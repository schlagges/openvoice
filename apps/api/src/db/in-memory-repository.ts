import { randomUUID } from "node:crypto";

import {
  DEFAULT_ROLE_DEFINITIONS,
  serializePermissionMask,
  VideoContentMode,
  VideoQualityProfile,
} from "@openvoice/shared";

import type { OpenVoiceRepository } from "./repository.js";
import type {
  AuditLogEntry,
  ChannelNodeRecord,
  CreateChannelInput,
  CreateMessageInput,
  CreateMessageResult,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  ListMessagesInput,
  MessageRecord,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  ReorderChannelInput,
  Role,
  SetVoiceModerationInput,
  Session,
  SoftDeleteMessageInput,
  UpdateMessageInput,
  UpdateVoiceSelfStateInput,
  UpsertPermissionOverrideInput,
  UpsertVoiceStateInput,
  User,
  VoiceStateRecord,
  Workspace,
  WorkspaceAccessContext,
  WorkspaceMember,
} from "./models.js";
import { DuplicateEmailError } from "./errors.js";

export class InMemoryOpenVoiceRepository implements OpenVoiceRepository {
  public readonly auditLogEntries: AuditLogEntry[] = [];
  public readonly channels: ChannelNodeRecord[] = [];
  public readonly memberRoles: Array<{
    readonly roleId: string;
    readonly workspaceMemberId: string;
  }> = [];
  public readonly messages: MessageRecord[] = [];
  public readonly permissionOverrides: PermissionOverrideRecord[] = [];
  public readonly roles: Role[] = [];
  public readonly sessions: Session[] = [];
  public readonly users: User[] = [];
  public readonly voiceStates: VoiceStateRecord[] = [];
  public readonly workspaceMembers: WorkspaceMember[] = [];
  public readonly workspaces: Workspace[] = [];

  public async createUser(input: CreateUserInput): Promise<User> {
    if (this.users.some((user) => user.emailNormalized === input.emailNormalized)) {
      throw new DuplicateEmailError();
    }

    const now = new Date();
    const user: User = {
      createdAt: now,
      displayName: input.displayName,
      email: input.email,
      emailNormalized: input.emailNormalized,
      id: randomUUID(),
      passwordHash: input.passwordHash,
      updatedAt: now,
    };

    this.users.push(user);
    return user;
  }

  public async findUserByEmailNormalized(emailNormalized: string): Promise<User | null> {
    return this.users.find((user) => user.emailNormalized === emailNormalized) ?? null;
  }

  public async findUserById(userId: string): Promise<User | null> {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  public async createSession(input: CreateSessionInput): Promise<Session> {
    const session: Session = {
      createdAt: new Date(),
      csrfTokenHash: input.csrfTokenHash,
      expiresAt: input.expiresAt,
      id: randomUUID(),
      revokedAt: null,
      tokenHash: input.tokenHash,
      userId: input.userId,
    };

    this.sessions.push(session);
    return session;
  }

  public async findActiveSessionByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    return (
      this.sessions.find(
        (session) =>
          session.tokenHash === tokenHash &&
          session.revokedAt === null &&
          session.expiresAt.getTime() > now.getTime(),
      ) ?? null
    );
  }

  public async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);

    if (session) {
      const index = this.sessions.indexOf(session);
      this.sessions[index] = {
        ...session,
        revokedAt,
      };
    }
  }

  public async createWorkspaceWithDefaults(
    input: CreateWorkspaceInput,
  ): Promise<CreateWorkspaceResult> {
    const now = new Date();
    const workspace: Workspace = {
      createdAt: now,
      id: randomUUID(),
      name: input.name,
      ownerId: input.ownerId,
      updatedAt: now,
    };
    const member: WorkspaceMember = {
      createdAt: now,
      id: randomUUID(),
      userId: input.ownerId,
      workspaceId: workspace.id,
    };
    const roles: Role[] = DEFAULT_ROLE_DEFINITIONS.map((definition) => ({
      createdAt: now,
      id: randomUUID(),
      isDefault: true,
      key: definition.key,
      name: definition.name,
      permissions: definition.permissions,
      position: definition.position,
      updatedAt: now,
      workspaceId: workspace.id,
    }));
    const ownerRole = roles.find((role) => role.key === "owner");

    if (!ownerRole) {
      throw new Error("Default owner role missing.");
    }

    const auditLogEntries: AuditLogEntry[] = [
      {
        actorId: input.ownerId,
        createdAt: now,
        event: "WORKSPACE_CREATE",
        id: randomUUID(),
        ipHash: null,
        metadata: { workspaceName: input.name },
        reason: null,
        targetId: workspace.id,
        targetType: "workspace",
        workspaceId: workspace.id,
      },
      ...roles.map<AuditLogEntry>((role) => ({
        actorId: input.ownerId,
        createdAt: now,
        event: "ROLE_CREATE",
        id: randomUUID(),
        ipHash: null,
        metadata: {
          defaultRole: true,
          key: role.key,
          permissions: serializePermissionMask(role.permissions),
        },
        reason: null,
        targetId: role.id,
        targetType: "role",
        workspaceId: workspace.id,
      })),
      {
        actorId: input.ownerId,
        createdAt: now,
        event: "MEMBER_ROLE_ASSIGN",
        id: randomUUID(),
        ipHash: null,
        metadata: { roleKey: ownerRole.key },
        reason: null,
        targetId: member.id,
        targetType: "workspace_member",
        workspaceId: workspace.id,
      },
    ];

    this.workspaces.push(workspace);
    this.workspaceMembers.push(member);
    this.roles.push(...roles);
    this.memberRoles.push({ roleId: ownerRole.id, workspaceMemberId: member.id });
    this.auditLogEntries.push(...auditLogEntries);

    return {
      auditLogEntries,
      member,
      roles,
      workspace,
    };
  }

  public async findWorkspaceAccessContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext | null> {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    const member = this.workspaceMembers.find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId,
    );

    if (!workspace || !member) {
      return null;
    }

    const memberRoleIds = this.memberRoles
      .filter((memberRole) => memberRole.workspaceMemberId === member.id)
      .map((memberRole) => memberRole.roleId);
    const roles = this.roles.filter(
      (role) => role.workspaceId === workspaceId && memberRoleIds.includes(role.id),
    );

    return { member, roles, workspace };
  }

  public async findWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    return (
      this.workspaceMembers.find(
        (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId,
      ) ?? null
    );
  }

  public async findRoleById(roleId: string): Promise<Role | null> {
    return this.roles.find((role) => role.id === roleId) ?? null;
  }

  public async createChannel(input: CreateChannelInput): Promise<ChannelNodeRecord> {
    const now = new Date();
    const channel: ChannelNodeRecord = {
      createdAt: now,
      deletedAt: null,
      depth: input.depth,
      id: input.id,
      inheritsPermissions: true,
      name: input.name,
      parentId: input.parentId,
      path: input.path,
      position: input.position,
      settings: {},
      slug: input.slug,
      type: input.type,
      updatedAt: now,
      workspaceId: input.workspaceId,
    };

    this.channels.push(channel);
    this.auditLogEntries.push({
      actorId: input.actorId,
      createdAt: now,
      event: "CHANNEL_CREATE",
      id: randomUUID(),
      ipHash: null,
      metadata: { channelName: input.name, type: input.type },
      reason: null,
      targetId: channel.id,
      targetType: "channel",
      workspaceId: input.workspaceId,
    });

    return channel;
  }

  public async findChannelById(channelId: string): Promise<ChannelNodeRecord | null> {
    return (
      this.channels.find((channel) => channel.id === channelId && channel.deletedAt === null) ??
      null
    );
  }

  public async listChannels(workspaceId: string): Promise<readonly ChannelNodeRecord[]> {
    return this.channels.filter(
      (channel) => channel.workspaceId === workspaceId && channel.deletedAt === null,
    );
  }

  public async listWorkspacesForUser(userId: string): Promise<readonly Workspace[]> {
    const workspaceIds = new Set(
      this.workspaceMembers
        .filter((member) => member.userId === userId)
        .map((member) => member.workspaceId),
    );

    return this.workspaces.filter((workspace) => workspaceIds.has(workspace.id));
  }

  public async reorderChannels(input: ReorderChannelInput): Promise<readonly ChannelNodeRecord[]> {
    const now = new Date();
    const updated: ChannelNodeRecord[] = [];

    for (const move of input.moves) {
      const channel = this.channels.find(
        (candidate) =>
          candidate.workspaceId === input.workspaceId && candidate.id === move.channelId,
      );

      if (!channel) {
        continue;
      }

      const replacement: ChannelNodeRecord = {
        ...channel,
        depth: move.depth,
        parentId: move.parentId,
        path: move.path,
        position: move.position,
        updatedAt: now,
      };
      this.channels[this.channels.indexOf(channel)] = replacement;
      updated.push(replacement);
    }

    this.auditLogEntries.push({
      actorId: input.actorId,
      createdAt: now,
      event: "CHANNEL_MOVE",
      id: randomUUID(),
      ipHash: null,
      metadata: { movedCount: input.moves.length },
      reason: null,
      targetId: null,
      targetType: "channel",
      workspaceId: input.workspaceId,
    });

    return updated;
  }

  public async listPermissionOverrides(
    channelId: string,
  ): Promise<readonly PermissionOverrideRecord[]> {
    return this.permissionOverrides.filter((override) => override.channelId === channelId);
  }

  public async listPermissionOverridesForChannels(
    channelIds: readonly string[],
  ): Promise<readonly PermissionOverrideRecord[]> {
    const channelIdSet = new Set(channelIds);
    return this.permissionOverrides.filter((override) => channelIdSet.has(override.channelId));
  }

  public async upsertPermissionOverride(
    input: UpsertPermissionOverrideInput,
  ): Promise<PermissionOverrideRecord> {
    const now = new Date();
    const existing = this.permissionOverrides.find(
      (override) =>
        override.channelId === input.channelId &&
        override.targetType === input.targetType &&
        override.targetId === input.targetId,
    );

    if (existing) {
      const replacement: PermissionOverrideRecord = {
        ...existing,
        allow: input.allow,
        deny: input.deny,
        updatedAt: now,
      };
      this.permissionOverrides[this.permissionOverrides.indexOf(existing)] = replacement;
      this.writePermissionOverrideAudit(input, "PERMISSION_OVERRIDE_UPDATE", now);
      return replacement;
    }

    const override: PermissionOverrideRecord = {
      allow: input.allow,
      channelId: input.channelId,
      createdAt: now,
      deny: input.deny,
      id: randomUUID(),
      targetId: input.targetId,
      targetType: input.targetType,
      updatedAt: now,
    };
    this.permissionOverrides.push(override);
    this.writePermissionOverrideAudit(input, "PERMISSION_OVERRIDE_CREATE", now);
    return override;
  }

  public async deletePermissionOverride(
    channelId: string,
    targetType: PermissionOverrideTargetType,
    targetId: string,
    actorId: string,
  ): Promise<void> {
    const existing = this.permissionOverrides.find(
      (override) =>
        override.channelId === channelId &&
        override.targetType === targetType &&
        override.targetId === targetId,
    );

    if (!existing) {
      return;
    }

    this.permissionOverrides.splice(this.permissionOverrides.indexOf(existing), 1);
    const channel = this.channels.find((candidate) => candidate.id === channelId);
    if (channel) {
      this.auditLogEntries.push({
        actorId,
        createdAt: new Date(),
        event: "PERMISSION_OVERRIDE_DELETE",
        id: randomUUID(),
        ipHash: null,
        metadata: { targetId, targetType },
        reason: null,
        targetId: channelId,
        targetType: "permission_override",
        workspaceId: channel.workspaceId,
      });
    }
  }

  public async createMessage(input: CreateMessageInput): Promise<CreateMessageResult> {
    const existing = this.messages.find(
      (message) =>
        message.channelId === input.channelId &&
        message.authorId === input.authorId &&
        message.clientMessageId === input.clientMessageId,
    );
    if (existing) {
      return { created: false, message: existing };
    }

    const now = new Date();
    const message: MessageRecord = {
      authorId: input.authorId,
      channelId: input.channelId,
      clientMessageId: input.clientMessageId,
      content: input.content,
      contentFormat: input.contentFormat,
      createdAt: now,
      deletedAt: null,
      deletedBy: null,
      editedAt: null,
      id: input.id,
      updatedAt: now,
      workspaceId: input.workspaceId,
    };

    this.messages.push(message);
    return { created: true, message };
  }

  public async findMessageById(messageId: string): Promise<MessageRecord | null> {
    return this.messages.find((message) => message.id === messageId) ?? null;
  }

  public async listMessages(input: ListMessagesInput): Promise<readonly MessageRecord[]> {
    return this.messages
      .filter((message) => message.channelId === input.channelId)
      .filter((message) => {
        if (input.before) {
          return compareMessageCursor(message, input.before) < 0;
        }

        if (input.after) {
          return compareMessageCursor(message, input.after) > 0;
        }

        return true;
      })
      .sort(compareMessagesDesc)
      .slice(0, input.limit);
  }

  public async updateMessage(input: UpdateMessageInput): Promise<MessageRecord> {
    const message = this.messages.find((candidate) => candidate.id === input.messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    const replacement: MessageRecord = {
      ...message,
      content: input.content,
      contentFormat: input.contentFormat,
      editedAt: new Date(),
      updatedAt: new Date(),
    };
    this.messages[this.messages.indexOf(message)] = replacement;
    return replacement;
  }

  public async softDeleteMessage(input: SoftDeleteMessageInput): Promise<MessageRecord> {
    const message = this.messages.find((candidate) => candidate.id === input.messageId);
    if (!message) {
      throw new Error("Message not found.");
    }

    const now = new Date();
    const replacement: MessageRecord = {
      ...message,
      deletedAt: message.deletedAt ?? now,
      deletedBy: message.deletedBy ?? input.deletedBy,
      updatedAt: now,
    };
    this.messages[this.messages.indexOf(message)] = replacement;

    if (!message.deletedAt) {
      this.auditLogEntries.push({
        actorId: input.actorId,
        createdAt: now,
        event: "MESSAGE_DELETE",
        id: randomUUID(),
        ipHash: null,
        metadata: { channelId: message.channelId },
        reason: null,
        targetId: message.id,
        targetType: "message",
        workspaceId: message.workspaceId,
      });
    }

    return replacement;
  }

  public async upsertVoiceState(input: UpsertVoiceStateInput): Promise<VoiceStateRecord> {
    const now = new Date();
    const existing = this.voiceStates.find(
      (state) => state.workspaceId === input.workspaceId && state.userId === input.userId,
    );

    if (existing) {
      const replacement: VoiceStateRecord = {
        ...existing,
        audioMode: input.audioMode,
        cameraEnabled: false,
        cameraQuality: VideoQualityProfile.P720,
        channelId: input.channelId,
        screenShareContentMode: VideoContentMode.DETAIL,
        screenShareEnabled: false,
        screenShareQuality: VideoQualityProfile.P1080,
        selfDeafened: input.selfDeafened,
        selfMuted: input.selfMuted,
        sessionId: input.sessionId,
        speaking: false,
        updatedAt: now,
      };
      this.voiceStates[this.voiceStates.indexOf(existing)] = replacement;
      return replacement;
    }

    const state: VoiceStateRecord = {
      audioMode: input.audioMode,
      cameraEnabled: false,
      cameraQuality: VideoQualityProfile.P720,
      channelId: input.channelId,
      connectedAt: now,
      screenShareContentMode: VideoContentMode.DETAIL,
      screenShareEnabled: false,
      screenShareQuality: VideoQualityProfile.P1080,
      selfDeafened: input.selfDeafened,
      selfMuted: input.selfMuted,
      serverDeafened: false,
      serverMuted: false,
      sessionId: input.sessionId,
      speaking: false,
      updatedAt: now,
      userId: input.userId,
      workspaceId: input.workspaceId,
    };
    this.voiceStates.push(state);
    return state;
  }

  public async findVoiceState(
    workspaceId: string,
    userId: string,
  ): Promise<VoiceStateRecord | null> {
    return (
      this.voiceStates.find(
        (state) => state.workspaceId === workspaceId && state.userId === userId,
      ) ?? null
    );
  }

  public async listVoiceStatesForChannel(channelId: string): Promise<readonly VoiceStateRecord[]> {
    return this.voiceStates.filter((state) => state.channelId === channelId);
  }

  public async updateVoiceSelfState(
    input: UpdateVoiceSelfStateInput,
  ): Promise<VoiceStateRecord | null> {
    const existing = this.voiceStates.find(
      (state) => state.workspaceId === input.workspaceId && state.userId === input.userId,
    );
    if (!existing) {
      return null;
    }

    const selfDeafened = input.selfDeafened ?? existing.selfDeafened;
    const speaking =
      input.speaking !== undefined
        ? input.speaking && !existing.serverMuted && !existing.serverDeafened && !selfDeafened
        : existing.speaking && !existing.serverMuted && !existing.serverDeafened && !selfDeafened;
    const replacement: VoiceStateRecord = {
      ...existing,
      ...(input.audioMode !== undefined ? { audioMode: input.audioMode } : {}),
      ...(input.cameraEnabled !== undefined ? { cameraEnabled: input.cameraEnabled } : {}),
      ...(input.cameraQuality !== undefined ? { cameraQuality: input.cameraQuality } : {}),
      ...(input.screenShareContentMode !== undefined
        ? { screenShareContentMode: input.screenShareContentMode }
        : {}),
      ...(input.screenShareEnabled !== undefined
        ? { screenShareEnabled: input.screenShareEnabled }
        : {}),
      ...(input.screenShareQuality !== undefined
        ? { screenShareQuality: input.screenShareQuality }
        : {}),
      selfDeafened,
      selfMuted: selfDeafened ? true : (input.selfMuted ?? existing.selfMuted),
      speaking,
      updatedAt: new Date(),
    };
    this.voiceStates[this.voiceStates.indexOf(existing)] = replacement;
    return replacement;
  }

  public async setVoiceModerationState(
    input: SetVoiceModerationInput,
  ): Promise<VoiceStateRecord | null> {
    const existing = this.voiceStates.find(
      (state) => state.workspaceId === input.workspaceId && state.userId === input.targetUserId,
    );
    if (!existing) {
      return null;
    }

    const now = new Date();
    const serverMuted = input.serverMuted ?? existing.serverMuted;
    const serverDeafened = input.serverDeafened ?? existing.serverDeafened;
    const replacement: VoiceStateRecord = {
      ...existing,
      serverDeafened,
      serverMuted,
      speaking: serverMuted || serverDeafened ? false : existing.speaking,
      updatedAt: now,
    };
    this.voiceStates[this.voiceStates.indexOf(existing)] = replacement;
    this.auditLogEntries.push({
      actorId: input.actorId,
      createdAt: now,
      event: input.serverMuted !== undefined ? "VOICE_SERVER_MUTE" : "VOICE_SERVER_DEAFEN",
      id: randomUUID(),
      ipHash: null,
      metadata: {
        channelId: existing.channelId,
        serverDeafened: replacement.serverDeafened,
        serverMuted: replacement.serverMuted,
      },
      reason: null,
      targetId: input.targetUserId,
      targetType: "workspace_member",
      workspaceId: input.workspaceId,
    });
    return replacement;
  }

  public async deleteVoiceState(
    workspaceId: string,
    userId: string,
  ): Promise<VoiceStateRecord | null> {
    const existing = this.voiceStates.find(
      (state) => state.workspaceId === workspaceId && state.userId === userId,
    );
    if (!existing) {
      return null;
    }

    this.voiceStates.splice(this.voiceStates.indexOf(existing), 1);
    return existing;
  }

  private writePermissionOverrideAudit(
    input: UpsertPermissionOverrideInput,
    event: "PERMISSION_OVERRIDE_CREATE" | "PERMISSION_OVERRIDE_UPDATE",
    createdAt: Date,
  ): void {
    const channel = this.channels.find((candidate) => candidate.id === input.channelId);
    if (!channel) {
      return;
    }

    this.auditLogEntries.push({
      actorId: input.actorId,
      createdAt,
      event,
      id: randomUUID(),
      ipHash: null,
      metadata: {
        allow: serializePermissionMask(input.allow),
        deny: serializePermissionMask(input.deny),
        targetId: input.targetId,
        targetType: input.targetType,
      },
      reason: null,
      targetId: input.channelId,
      targetType: "permission_override",
      workspaceId: channel.workspaceId,
    });
  }
}

function compareMessagesDesc(left: MessageRecord, right: MessageRecord): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function compareMessageCursor(
  message: MessageRecord,
  cursor: { readonly createdAt: Date; readonly id: string },
): number {
  return (
    message.createdAt.getTime() - cursor.createdAt.getTime() || message.id.localeCompare(cursor.id)
  );
}
