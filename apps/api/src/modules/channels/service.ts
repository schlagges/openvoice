import { randomUUID } from "node:crypto";

import {
  applyChannelOverrides,
  ALL_PERMISSION_MASK,
  buildChannelTree,
  canHaveChannelChildren,
  ChannelType,
  EMPTY_PERMISSION_MASK,
  hasPermission,
  hasPermissionBit,
  isChannelDepthAllowed,
  MAX_CHANNEL_DEPTH,
  Permission,
  ServerGatewayEventType,
  serializePermissionMask,
  type ChannelNode,
  type ChannelTreeNode,
  type PermissionMask,
} from "@openvoice/shared";

import type {
  ChannelNodeRecord,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  WorkspaceAccessContext,
} from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { badRequest, conflict, forbidden, notFound } from "../../http/errors.js";
import type { GatewayEventPublisher } from "../gateway/events.js";

export interface ChannelServiceOptions {
  readonly eventPublisher?: GatewayEventPublisher;
  readonly repository: OpenVoiceRepository;
}

export interface CreateChannelCommand {
  readonly name: string;
  readonly parentId?: string | null;
  readonly position?: number;
  readonly type: ChannelType;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ReorderChannelCommand {
  readonly moves: readonly ReorderChannelMoveCommand[];
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ReorderChannelMoveCommand {
  readonly channelId: string;
  readonly parentId: string | null;
  readonly position: number;
}

export interface UpsertPermissionOverrideCommand {
  readonly allow: PermissionMask;
  readonly channelId: string;
  readonly deny: PermissionMask;
  readonly targetId: string;
  readonly targetType: PermissionOverrideTargetType;
  readonly userId: string;
}

export interface DeletePermissionOverrideCommand {
  readonly channelId: string;
  readonly targetId: string;
  readonly targetType: PermissionOverrideTargetType;
  readonly userId: string;
}

export interface PublicPermissionOverride {
  readonly allow: string;
  readonly channelId: string;
  readonly createdAt: string;
  readonly deny: string;
  readonly id: string;
  readonly targetId: string;
  readonly targetType: PermissionOverrideTargetType;
  readonly updatedAt: string;
}

export interface EffectivePermissionsResponse {
  readonly channelId: string;
  readonly permissions: string;
}

export class ChannelService {
  private readonly eventPublisher: GatewayEventPublisher | null;
  private readonly repository: OpenVoiceRepository;

  public constructor(options: ChannelServiceOptions) {
    this.eventPublisher = options.eventPublisher ?? null;
    this.repository = options.repository;
  }

  public async createChannel(command: CreateChannelCommand): Promise<ChannelNode> {
    const access = await this.requireWorkspacePermission(
      command.workspaceId,
      command.userId,
      Permission.MANAGE_CHANNELS,
    );
    const channels = await this.repository.listChannels(command.workspaceId);
    const parent = this.resolveParent(command.workspaceId, command.parentId ?? null, channels);

    if (parent && !canHaveChannelChildren(parent.type)) {
      throw badRequest("Only category channels can contain child channels.", {
        field: "parentId",
      });
    }

    const depth = parent ? parent.depth + 1 : 0;
    if (!isChannelDepthAllowed(depth)) {
      throw badRequest("Channel depth exceeds the configured maximum.", {
        maxDepth: MAX_CHANNEL_DEPTH,
      });
    }

    const slug = createSlug(command.name);
    const parentId = parent?.id ?? null;
    if (
      channels.some(
        (channel) =>
          channel.parentId === parentId && channel.slug === slug && channel.deletedAt === null,
      )
    ) {
      throw conflict("A channel with this slug already exists in the same parent.", {
        field: "name",
      });
    }

    const id = randomUUID();
    const position =
      command.position ??
      Math.max(
        -1,
        ...channels
          .filter((channel) => channel.parentId === parentId)
          .map((channel) => channel.position),
      ) + 1;

    if (
      channels.some(
        (channel) =>
          channel.parentId === parentId &&
          channel.position === position &&
          channel.deletedAt === null,
      )
    ) {
      throw conflict("A channel already exists at this position in the same parent.", {
        field: "position",
      });
    }

    const channel = await this.repository.createChannel({
      actorId: access.member.userId,
      depth,
      id,
      name: command.name,
      parentId,
      path: parent ? `${parent.path}.${id}` : id,
      position,
      slug,
      type: command.type,
      workspaceId: command.workspaceId,
    });
    const publicChannel = toPublicChannelNode(channel);
    await this.eventPublisher?.publish({
      channelId: channel.id,
      payload: { channel: publicChannel },
      type: ServerGatewayEventType.CHANNEL_CREATE,
      workspaceId: channel.workspaceId,
    });

    return publicChannel;
  }

  public async listVisibleTree(
    workspaceId: string,
    userId: string,
  ): Promise<readonly ChannelTreeNode[]> {
    const access = await this.requireWorkspaceMember(workspaceId, userId);
    const channels = await this.repository.listChannels(workspaceId);
    const overrides = await this.repository.listPermissionOverridesForChannels(
      channels.map((channel) => channel.id),
    );
    const visibleNodes = sanitizeVisibleNodes(
      channels
        .filter((channel) =>
          this.hasChannelPermission(access, channel, channels, overrides, Permission.VIEW_CHANNEL),
        )
        .map((channel) => toPublicChannelNode(channel)),
    );

    return buildChannelTree(visibleNodes);
  }

  public async reorderChannels(command: ReorderChannelCommand): Promise<readonly ChannelNode[]> {
    const access = await this.requireWorkspacePermission(
      command.workspaceId,
      command.userId,
      Permission.MANAGE_CHANNELS,
    );

    if (command.moves.length === 0) {
      throw badRequest("At least one channel move is required.", {
        field: "moves",
      });
    }

    const channels = await this.repository.listChannels(command.workspaceId);
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    const moveByChannelId = new Map(command.moves.map((move) => [move.channelId, move]));

    if (moveByChannelId.size !== command.moves.length) {
      throw badRequest("Duplicate channel moves are not allowed.", {
        field: "moves",
      });
    }

    for (const move of command.moves) {
      const channel = channelById.get(move.channelId);
      if (!channel) {
        throw notFound("Channel not found.");
      }

      const parent = move.parentId ? channelById.get(move.parentId) : null;
      if (move.parentId && !parent) {
        throw badRequest("Parent channel does not exist in the workspace.", {
          field: "parentId",
        });
      }

      if (parent && !canHaveChannelChildren(parent.type)) {
        throw badRequest("Only category channels can contain child channels.", {
          field: "parentId",
        });
      }
    }

    const updatedParentById = new Map<string, string | null>();
    for (const channel of channels) {
      const move = moveByChannelId.get(channel.id);
      updatedParentById.set(channel.id, move ? move.parentId : channel.parentId);
    }

    for (const channel of channels) {
      assertNoCycle(channel.id, updatedParentById);
    }

    assertUniqueSiblingPositions(channels, updatedParentById, moveByChannelId);

    const childrenByParent = buildChildrenIndex(channels, updatedParentById);
    const derivedMoves = new Map<
      string,
      { depth: number; parentId: string | null; path: string }
    >();
    const roots = channels.filter((channel) => updatedParentById.get(channel.id) === null);

    for (const root of roots) {
      deriveTreeMetadata(root, null, 0, root.id, childrenByParent, derivedMoves);
    }

    const repositoryMoves = channels.map((channel) => {
      const move = moveByChannelId.get(channel.id);
      const derived = derivedMoves.get(channel.id);
      if (!derived) {
        throw badRequest("Channel tree contains an unreachable node.", {
          channelId: channel.id,
        });
      }

      return {
        channelId: channel.id,
        depth: derived.depth,
        parentId: derived.parentId,
        path: derived.path,
        position: move?.position ?? channel.position,
      };
    });

    const updated = await this.repository.reorderChannels({
      actorId: access.member.userId,
      moves: repositoryMoves,
      workspaceId: command.workspaceId,
    });

    await this.eventPublisher?.publish({
      payload: { channels: [], workspaceId: command.workspaceId },
      type: ServerGatewayEventType.CHANNEL_REORDER,
      workspaceId: command.workspaceId,
    });

    return updated.map(toPublicChannelNode);
  }

  public async listPermissionOverrides(
    channelId: string,
    userId: string,
  ): Promise<readonly PublicPermissionOverride[]> {
    const { access } = await this.requireChannelPermission(
      channelId,
      userId,
      Permission.MANAGE_CHANNEL_PERMS,
    );
    const channel = await this.requireChannel(channelId);
    if (channel.workspaceId !== access.workspace.id) {
      throw notFound("Channel not found.");
    }

    const overrides = await this.repository.listPermissionOverrides(channelId);
    return overrides.map(toPublicPermissionOverride);
  }

  public async upsertPermissionOverride(
    command: UpsertPermissionOverrideCommand,
  ): Promise<PublicPermissionOverride> {
    const { channel } = await this.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.MANAGE_CHANNEL_PERMS,
    );
    await this.assertOverrideTarget(channel.workspaceId, command.targetType, command.targetId);

    const override = await this.repository.upsertPermissionOverride({
      actorId: command.userId,
      allow: command.allow,
      channelId: command.channelId,
      deny: command.deny,
      targetId: command.targetId,
      targetType: command.targetType,
    });

    await this.eventPublisher?.publish({
      payload: { workspaceId: channel.workspaceId },
      type: ServerGatewayEventType.PERMISSION_UPDATE,
      workspaceId: channel.workspaceId,
    });

    return toPublicPermissionOverride(override);
  }

  public async deletePermissionOverride(command: DeletePermissionOverrideCommand): Promise<void> {
    const { channel } = await this.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.MANAGE_CHANNEL_PERMS,
    );
    await this.repository.deletePermissionOverride(
      command.channelId,
      command.targetType,
      command.targetId,
      command.userId,
    );
    await this.eventPublisher?.publish({
      payload: { workspaceId: channel.workspaceId },
      type: ServerGatewayEventType.PERMISSION_UPDATE,
      workspaceId: channel.workspaceId,
    });
  }

  public async getEffectivePermissions(
    channelId: string,
    userId: string,
  ): Promise<EffectivePermissionsResponse> {
    const { access, channel, channels, overrides } = await this.requireChannelVisible(
      channelId,
      userId,
    );

    return {
      channelId,
      permissions: serializePermissionMask(
        this.calculateEffectiveChannelPermissions(access, channel, channels, overrides),
      ),
    };
  }

  private async requireWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext> {
    const access = await this.repository.findWorkspaceAccessContext(workspaceId, userId);
    if (!access) {
      throw forbidden("Workspace access required.");
    }
    const activeBan = await this.repository.findActiveWorkspaceBan(workspaceId, userId);
    if (activeBan) {
      throw forbidden("Workspace access is blocked by an active ban.");
    }

    return access;
  }

  private async requireWorkspacePermission(
    workspaceId: string,
    userId: string,
    permission: Permission,
  ): Promise<WorkspaceAccessContext> {
    const access = await this.requireWorkspaceMember(workspaceId, userId);
    if (
      !hasPermission(
        {
          rolePermissions: access.roles.map((role) => role.permissions),
          userId,
          workspaceOwnerId: access.workspace.ownerId,
        },
        permission,
      )
    ) {
      throw forbidden("Missing required workspace permission.");
    }

    return access;
  }

  public async requireChannelPermission(
    channelId: string,
    userId: string,
    permission: Permission,
  ): Promise<{
    readonly access: WorkspaceAccessContext;
    readonly channel: ChannelNodeRecord;
    readonly channels: readonly ChannelNodeRecord[];
    readonly overrides: readonly PermissionOverrideRecord[];
  }> {
    const channel = await this.requireChannel(channelId);
    const access = await this.requireWorkspaceMember(channel.workspaceId, userId);
    const channels = await this.repository.listChannels(channel.workspaceId);
    const overrides = await this.repository.listPermissionOverridesForChannels(
      channels.map((candidate) => candidate.id),
    );

    if (!this.hasChannelPermission(access, channel, channels, overrides, permission)) {
      throw forbidden("Missing required channel permission.");
    }

    return {
      access,
      channel,
      channels,
      overrides,
    };
  }

  private async requireChannelVisible(channelId: string, userId: string) {
    const result = await this.requireChannelPermission(channelId, userId, Permission.VIEW_CHANNEL);
    return result;
  }

  private async requireChannel(channelId: string): Promise<ChannelNodeRecord> {
    const channel = await this.repository.findChannelById(channelId);
    if (!channel) {
      throw notFound("Channel not found.");
    }

    return channel;
  }

  private resolveParent(
    workspaceId: string,
    parentId: string | null,
    channels: readonly ChannelNodeRecord[],
  ): ChannelNodeRecord | null {
    if (!parentId) {
      return null;
    }

    const parent = channels.find(
      (channel) => channel.workspaceId === workspaceId && channel.id === parentId,
    );
    if (!parent) {
      throw badRequest("Parent channel does not exist in the workspace.", {
        field: "parentId",
      });
    }

    return parent;
  }

  private async assertOverrideTarget(
    workspaceId: string,
    targetType: PermissionOverrideTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === "role") {
      const role = await this.repository.findRoleById(targetId);
      if (!role || role.workspaceId !== workspaceId) {
        throw badRequest("Role target does not exist in the workspace.", {
          field: "targetId",
        });
      }
      return;
    }

    const member = await this.repository.findWorkspaceMember(workspaceId, targetId);
    if (!member) {
      throw badRequest("Member target does not exist in the workspace.", {
        field: "targetId",
      });
    }
  }

  private hasChannelPermission(
    access: WorkspaceAccessContext,
    channel: ChannelNodeRecord,
    channels: readonly ChannelNodeRecord[],
    overrides: readonly PermissionOverrideRecord[],
    permission: Permission,
  ): boolean {
    return hasPermission(
      {
        channelPath: this.buildPermissionPath(access, channel, channels, overrides),
        rolePermissions: access.roles.map((role) => role.permissions),
        userId: access.member.userId,
        workspaceOwnerId: access.workspace.ownerId,
      },
      permission,
    );
  }

  private calculateEffectiveChannelPermissions(
    access: WorkspaceAccessContext,
    channel: ChannelNodeRecord,
    channels: readonly ChannelNodeRecord[],
    overrides: readonly PermissionOverrideRecord[],
  ): PermissionMask {
    if (access.workspace.ownerId === access.member.userId) {
      return ALL_PERMISSION_MASK;
    }

    const basePermissions = access.roles.reduce(
      (mask, role) => mask | role.permissions,
      EMPTY_PERMISSION_MASK,
    );

    if (hasPermissionBit(basePermissions, Permission.ADMINISTRATOR)) {
      return ALL_PERMISSION_MASK;
    }

    return applyChannelOverrides(
      basePermissions,
      this.buildPermissionPath(access, channel, channels, overrides),
    );
  }

  private buildPermissionPath(
    access: WorkspaceAccessContext,
    channel: ChannelNodeRecord,
    channels: readonly ChannelNodeRecord[],
    overrides: readonly PermissionOverrideRecord[],
  ) {
    const channelById = new Map(channels.map((candidate) => [candidate.id, candidate]));
    const path: ChannelNodeRecord[] = [];
    let current: ChannelNodeRecord | undefined = channel;

    while (current) {
      path.unshift(current);
      current = current.parentId ? channelById.get(current.parentId) : undefined;
    }

    const roleIds = new Set(access.roles.map((role) => role.id));
    return path.map((node) => ({
      memberOverride:
        overrides.find(
          (override) =>
            override.channelId === node.id &&
            override.targetType === "member" &&
            override.targetId === access.member.userId,
        ) ?? null,
      roleOverrides: overrides.filter(
        (override) =>
          override.channelId === node.id &&
          override.targetType === "role" &&
          roleIds.has(override.targetId),
      ),
    }));
  }
}

function createSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "channel";
}

function buildChildrenIndex(
  channels: readonly ChannelNodeRecord[],
  parentById: ReadonlyMap<string, string | null>,
): Map<string | null, ChannelNodeRecord[]> {
  const childrenByParent = new Map<string | null, ChannelNodeRecord[]>();

  for (const channel of channels) {
    const parentId = parentById.get(channel.id) ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(channel);
    childrenByParent.set(parentId, siblings);
  }

  return childrenByParent;
}

function deriveTreeMetadata(
  channel: ChannelNodeRecord,
  parentId: string | null,
  depth: number,
  path: string,
  childrenByParent: ReadonlyMap<string | null, readonly ChannelNodeRecord[]>,
  derivedMoves: Map<string, { depth: number; parentId: string | null; path: string }>,
): void {
  if (!isChannelDepthAllowed(depth)) {
    throw badRequest("Channel depth exceeds the configured maximum.", {
      maxDepth: MAX_CHANNEL_DEPTH,
    });
  }

  derivedMoves.set(channel.id, {
    depth,
    parentId,
    path,
  });

  for (const child of childrenByParent.get(channel.id) ?? []) {
    deriveTreeMetadata(
      child,
      channel.id,
      depth + 1,
      `${path}.${child.id}`,
      childrenByParent,
      derivedMoves,
    );
  }
}

function assertNoCycle(channelId: string, parentById: ReadonlyMap<string, string | null>): void {
  const seen = new Set<string>();
  let current: string | null | undefined = channelId;

  while (current) {
    if (seen.has(current)) {
      throw badRequest("Channel reorder would create a cycle.", {
        channelId,
      });
    }
    seen.add(current);
    current = parentById.get(current);
  }
}

function assertUniqueSiblingPositions(
  channels: readonly ChannelNodeRecord[],
  parentById: ReadonlyMap<string, string | null>,
  moveByChannelId: ReadonlyMap<string, ReorderChannelMoveCommand>,
): void {
  const positionsByParent = new Map<string, Set<number>>();

  for (const channel of channels) {
    const parentId = parentById.get(channel.id) ?? null;
    const position = moveByChannelId.get(channel.id)?.position ?? channel.position;
    const key = parentId ?? "root";
    const siblingPositions = positionsByParent.get(key) ?? new Set<number>();

    if (siblingPositions.has(position)) {
      throw badRequest("Sibling channels must have unique positions.", {
        parentId,
      });
    }

    siblingPositions.add(position);
    positionsByParent.set(key, siblingPositions);
  }
}

function sanitizeVisibleNodes(nodes: readonly ChannelNode[]): readonly ChannelNode[] {
  const visibleIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(
    nodes.map((node) => [
      node.id,
      {
        ...node,
        parentId: node.parentId && visibleIds.has(node.parentId) ? node.parentId : null,
      },
    ]),
  );
  const sanitizedById = new Map<string, ChannelNode>();

  const sanitize = (node: ChannelNode): ChannelNode => {
    const existing = sanitizedById.get(node.id);
    if (existing) {
      return existing;
    }

    const parent = node.parentId ? nodeById.get(node.parentId) : null;
    const sanitizedParent = parent ? sanitize(parent) : null;
    const sanitized: ChannelNode = {
      ...node,
      depth: sanitizedParent ? sanitizedParent.depth + 1 : 0,
      parentId: sanitizedParent?.id ?? null,
      path: sanitizedParent ? `${sanitizedParent.path}.${node.id}` : node.id,
    };
    sanitizedById.set(node.id, sanitized);
    return sanitized;
  };

  return nodes.map((node) => sanitize(nodeById.get(node.id) ?? node));
}

function toPublicChannelNode(channel: ChannelNodeRecord): ChannelNode {
  return {
    createdAt: channel.createdAt.toISOString(),
    depth: channel.depth,
    id: channel.id,
    inheritsPermissions: channel.inheritsPermissions,
    isArchived: channel.deletedAt !== null,
    name: channel.name,
    parentId: channel.parentId,
    path: channel.path,
    position: channel.position,
    slug: channel.slug,
    type: channel.type,
    updatedAt: channel.updatedAt.toISOString(),
    workspaceId: channel.workspaceId,
  };
}

function toPublicPermissionOverride(override: PermissionOverrideRecord): PublicPermissionOverride {
  return {
    allow: serializePermissionMask(override.allow),
    channelId: override.channelId,
    createdAt: override.createdAt.toISOString(),
    deny: serializePermissionMask(override.deny),
    id: override.id,
    targetId: override.targetId,
    targetType: override.targetType,
    updatedAt: override.updatedAt.toISOString(),
  };
}
