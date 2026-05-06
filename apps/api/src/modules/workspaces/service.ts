import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  DEFAULT_ROLE_DEFINITIONS,
  hasPermission,
  Permission,
  ServerGatewayEventType,
  serializePermissionMask,
} from "@openvoice/shared";

import type {
  CreateWorkspaceResult,
  Role,
  Workspace,
  WorkspaceAccessMode,
  WorkspaceMember,
  WorkspaceWithMemberCount,
  User,
} from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { conflict, forbidden, notFound } from "../../http/errors.js";
import type { GatewayEventPublisher } from "../gateway/events.js";

export interface WorkspaceServiceOptions {
  readonly eventPublisher?: GatewayEventPublisher;
  readonly inviteTtlSeconds?: number;
  readonly repository: OpenVoiceRepository;
}

export interface PublicRole {
  readonly id: string;
  readonly isDefault: boolean;
  readonly key: string;
  readonly name: string;
  readonly permissions: string;
  readonly position: number;
}

export interface WorkspaceCreationResponse {
  readonly auditLogEntriesCreated: number;
  readonly defaultRoles: readonly PublicRole[];
  readonly ownerMemberId: string;
  readonly workspace: PublicWorkspace;
}

export interface WorkspaceInviteResponse {
  readonly code: string;
  readonly expiresAt: string;
  readonly inviteId: string;
  readonly workspaceId: string;
}

export interface WorkspaceInviteJoinResponse {
  readonly alreadyMember: boolean;
  readonly member: PublicWorkspaceMember;
  readonly role: PublicRole | null;
  readonly workspace: PublicWorkspace;
}

export interface GlobalWorkspaceJoinResponse extends WorkspaceInviteJoinResponse {
  readonly joinedWorkspaces: readonly PublicWorkspace[];
}

export interface WorkspaceGuestInviteJoinResponse extends WorkspaceInviteJoinResponse {
  readonly user: User;
}

export interface PublicWorkspace {
  readonly accessMode: WorkspaceAccessMode;
  readonly id: string;
  readonly memberCount?: number;
  readonly name: string;
  readonly ownerId: string;
}

export interface PublicWorkspaceMember {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export class WorkspaceService {
  private readonly eventPublisher: GatewayEventPublisher | null;
  private readonly inviteTtlSeconds: number;
  private readonly repository: OpenVoiceRepository;

  public constructor(options: WorkspaceServiceOptions) {
    this.eventPublisher = options.eventPublisher ?? null;
    this.inviteTtlSeconds = options.inviteTtlSeconds ?? 60 * 5;
    this.repository = options.repository;
  }

  public async createWorkspace(input: {
    readonly name: string;
    readonly ownerId: string;
  }): Promise<WorkspaceCreationResponse> {
    const existing = await this.repository.findWorkspaceByNameNormalized(
      normalizeWorkspaceName(input.name),
    );
    if (existing) {
      throw conflict("Workspace name is already in use.", { field: "name" });
    }

    const result = await this.repository.createWorkspaceWithDefaults(input);
    const response = toWorkspaceCreationResponse(result);
    await this.eventPublisher?.publish({
      payload: { workspace: response.workspace },
      type: ServerGatewayEventType.WORKSPACE_UPDATE,
      workspaceId: response.workspace.id,
    });

    return response;
  }

  public async listWorkspacesForUser(userId: string): Promise<readonly PublicWorkspace[]> {
    const workspaces = await this.repository.listWorkspacesForUser(userId);
    return workspaces.map(toPublicWorkspaceWithMemberCount);
  }

  public async joinGlobalWorkspacesForUser(userId: string): Promise<readonly PublicWorkspace[]> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.kind !== "registered" || !user.keycloakSubject) {
      throw forbidden("Keycloak login required for global workspace access.");
    }

    const globals = await this.repository.listGlobalWorkspaces();
    const joined: PublicWorkspace[] = [];
    for (const workspace of globals) {
      const result = await this.repository.joinGlobalWorkspace({
        roleKey: "member",
        userId,
        workspaceId: workspace.id,
      });
      if (result) {
        joined.push(toPublicWorkspace(result.workspace));
        await this.eventPublisher?.publish({
          payload: { workspace: toPublicWorkspace(result.workspace) },
          type: ServerGatewayEventType.WORKSPACE_UPDATE,
          workspaceId: result.workspace.id,
        });
      }
    }

    return joined;
  }

  public async joinGlobalWorkspace(input: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<GlobalWorkspaceJoinResponse> {
    const user = await this.repository.findUserById(input.userId);
    if (!user || user.kind !== "registered" || !user.keycloakSubject) {
      throw forbidden("Keycloak login required for global workspace access.");
    }

    const result = await this.repository.joinGlobalWorkspace({
      roleKey: "member",
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    if (!result) {
      throw notFound("Global workspace not found.");
    }

    const workspace = toPublicWorkspace(result.workspace);
    await this.eventPublisher?.publish({
      payload: { workspace },
      type: ServerGatewayEventType.WORKSPACE_UPDATE,
      workspaceId: workspace.id,
    });

    return {
      alreadyMember: result.alreadyMember,
      joinedWorkspaces: [workspace],
      member: toPublicWorkspaceMember(result.member),
      role: result.role ? toPublicRole(result.role) : null,
      workspace,
    };
  }

  public async createInvite(input: {
    readonly actorId: string;
    readonly workspaceId: string;
  }): Promise<WorkspaceInviteResponse> {
    const access = await this.repository.findWorkspaceAccessContext(
      input.workspaceId,
      input.actorId,
    );
    if (!access) {
      throw forbidden("Workspace access required.");
    }
    const activeBan = await this.repository.findActiveWorkspaceBan(
      input.workspaceId,
      input.actorId,
    );
    if (activeBan) {
      throw forbidden("Workspace access is blocked by an active ban.");
    }
    if (
      !hasPermission(
        {
          rolePermissions: access.roles.map((role) => role.permissions),
          userId: input.actorId,
          workspaceOwnerId: access.workspace.ownerId,
        },
        Permission.MANAGE_INVITES,
      )
    ) {
      throw forbidden("Missing required workspace permission.", {
        permission: Permission.MANAGE_INVITES.toString(10),
      });
    }

    const code = createInviteCode();
    const expiresAt = new Date(Date.now() + this.inviteTtlSeconds * 1000);
    const { invite } = await this.repository.createWorkspaceInvite({
      actorId: input.actorId,
      codeHash: hashInviteCode(code),
      expiresAt,
      workspaceId: input.workspaceId,
    });

    return {
      code,
      expiresAt: invite.expiresAt.toISOString(),
      inviteId: invite.id,
      workspaceId: invite.workspaceId,
    };
  }

  public async joinByInvite(input: {
    readonly code: string;
    readonly userId: string;
  }): Promise<WorkspaceInviteJoinResponse> {
    const codeHash = hashInviteCode(input.code);
    const now = new Date();
    const invite = await this.repository.findActiveWorkspaceInvite(codeHash, now);
    if (!invite) {
      throw notFound("Invite not found or expired.");
    }
    const globalWorkspace = (await this.repository.listGlobalWorkspaces()).find(
      (workspace) => workspace.id === invite.workspaceId,
    );
    if (globalWorkspace) {
      throw forbidden("Global workspaces require Keycloak login.");
    }
    const activeBan = await this.repository.findActiveWorkspaceBan(
      invite.workspaceId,
      input.userId,
    );
    if (activeBan) {
      throw forbidden("Workspace access is blocked by an active ban.");
    }

    const result = await this.repository.redeemWorkspaceInvite({
      actorId: input.userId,
      codeHash,
      now,
    });
    if (!result) {
      throw notFound("Invite not found or expired.");
    }

    return {
      alreadyMember: result.alreadyMember,
      member: toPublicWorkspaceMember(result.member),
      role: result.role ? toPublicRole(result.role) : null,
      workspace: toPublicWorkspace(result.workspace),
    };
  }

  public async guestJoinByInvite(input: {
    readonly code: string;
    readonly displayName: string;
  }): Promise<WorkspaceGuestInviteJoinResponse> {
    const codeHash = hashInviteCode(input.code);
    const now = new Date();
    const invite = await this.repository.findActiveWorkspaceInvite(codeHash, now);
    if (!invite) {
      throw notFound("Invite not found or expired.");
    }
    const globalWorkspace = (await this.repository.listGlobalWorkspaces()).find(
      (workspace) => workspace.id === invite.workspaceId,
    );
    if (globalWorkspace) {
      throw forbidden("Guests cannot join global workspaces.");
    }

    const guestId = randomUUID();
    const user = await this.repository.createUser({
      createdFromInviteId: invite.id,
      displayName: input.displayName,
      email: `guest+${guestId}@openvoice.local`,
      emailNormalized: `guest+${guestId}@openvoice.local`,
      kind: "guest",
      passwordHash: "guest-disabled",
    });
    const result = await this.repository.redeemWorkspaceInvite({
      actorId: user.id,
      codeHash,
      joinKind: "guest",
      now,
      roleKey: "guest",
    });
    if (!result) {
      throw notFound("Invite not found or expired.");
    }

    return {
      alreadyMember: result.alreadyMember,
      member: toPublicWorkspaceMember(result.member),
      role: result.role ? toPublicRole(result.role) : null,
      user,
      workspace: toPublicWorkspace(result.workspace),
    };
  }
}

export function toWorkspaceCreationResponse(
  result: CreateWorkspaceResult,
): WorkspaceCreationResponse {
  return {
    auditLogEntriesCreated: result.auditLogEntries.length,
    defaultRoles: result.roles.map(toPublicRole),
    ownerMemberId: result.member.id,
    workspace: toPublicWorkspace(result.workspace),
  };
}

export function toPublicWorkspace(workspace: Workspace): PublicWorkspace {
  return {
    accessMode: workspace.accessMode,
    id: workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId,
  };
}

function toPublicWorkspaceWithMemberCount(workspace: WorkspaceWithMemberCount): PublicWorkspace {
  return {
    ...toPublicWorkspace(workspace),
    memberCount: workspace.memberCount,
  };
}

export function toPublicWorkspaceMember(member: WorkspaceMember): PublicWorkspaceMember {
  return {
    id: member.id,
    userId: member.userId,
    workspaceId: member.workspaceId,
  };
}

export function toPublicRole(role: Role): PublicRole {
  return {
    id: role.id,
    isDefault: role.isDefault,
    key: role.key,
    name: role.name,
    permissions: serializePermissionMask(role.permissions),
    position: role.position,
  };
}

function createInviteCode(): string {
  return randomBytes(18).toString("base64url");
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function normalizeWorkspaceName(name: string): string {
  return name.trim().toLowerCase();
}

export function assertDefaultRolesCreated(roles: readonly Role[]): void {
  const expectedKeys = DEFAULT_ROLE_DEFINITIONS.map((role) => role.key);
  const actualKeys = roles.map((role) => role.key);

  for (const expectedKey of expectedKeys) {
    if (!actualKeys.includes(expectedKey)) {
      throw new Error(`Missing default role ${expectedKey}.`);
    }
  }
}
