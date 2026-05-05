import type {
  AuditLogEntry,
  BanWorkspaceMemberInput,
  BanWorkspaceMemberResult,
  ChannelNodeRecord,
  CreateChannelInput,
  CreateMessageInput,
  CreateMessageResult,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  DisconnectVoiceMemberInput,
  DisconnectVoiceMemberResult,
  KickWorkspaceMemberInput,
  KickWorkspaceMemberResult,
  ListAuditLogInput,
  ListMessagesInput,
  MessageRecord,
  MoveVoiceMemberInput,
  MoveVoiceMemberResult,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  ReorderChannelInput,
  Role,
  SetVoiceModerationInput,
  Session,
  SoftDeleteMessageInput,
  TimeoutWorkspaceMemberInput,
  UnbanWorkspaceMemberInput,
  UpdateMessageInput,
  UpdateVoiceSelfStateInput,
  UpsertPermissionOverrideInput,
  UpsertVoiceStateInput,
  User,
  VoiceStateRecord,
  Workspace,
  WorkspaceBanRecord,
  WorkspaceMember,
  WorkspaceTimeoutRecord,
  WorkspaceAccessContext,
} from "./models.js";

export interface OpenVoiceRepository {
  createChannel(input: CreateChannelInput): Promise<ChannelNodeRecord>;
  createMessage(input: CreateMessageInput): Promise<CreateMessageResult>;
  createSession(input: CreateSessionInput): Promise<Session>;
  createUser(input: CreateUserInput): Promise<User>;
  createWorkspaceWithDefaults(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult>;
  banWorkspaceMember(input: BanWorkspaceMemberInput): Promise<BanWorkspaceMemberResult>;
  deletePermissionOverride(
    channelId: string,
    targetType: PermissionOverrideTargetType,
    targetId: string,
    actorId: string,
  ): Promise<void>;
  findActiveSessionByTokenHash(tokenHash: string, now: Date): Promise<Session | null>;
  findChannelById(channelId: string): Promise<ChannelNodeRecord | null>;
  findMessageById(messageId: string): Promise<MessageRecord | null>;
  findRoleById(roleId: string): Promise<Role | null>;
  findUserByEmailNormalized(emailNormalized: string): Promise<User | null>;
  findUserById(userId: string): Promise<User | null>;
  findActiveWorkspaceBan(workspaceId: string, userId: string): Promise<WorkspaceBanRecord | null>;
  findActiveWorkspaceTimeout(
    workspaceId: string,
    userId: string,
    now: Date,
  ): Promise<WorkspaceTimeoutRecord | null>;
  findWorkspaceAccessContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext | null>;
  findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  kickWorkspaceMember(input: KickWorkspaceMemberInput): Promise<KickWorkspaceMemberResult | null>;
  listChannels(workspaceId: string): Promise<readonly ChannelNodeRecord[]>;
  listAuditLog(input: ListAuditLogInput): Promise<readonly AuditLogEntry[]>;
  listMessages(input: ListMessagesInput): Promise<readonly MessageRecord[]>;
  listPermissionOverrides(channelId: string): Promise<readonly PermissionOverrideRecord[]>;
  listPermissionOverridesForChannels(
    channelIds: readonly string[],
  ): Promise<readonly PermissionOverrideRecord[]>;
  findVoiceState(workspaceId: string, userId: string): Promise<VoiceStateRecord | null>;
  listVoiceStatesForChannel(channelId: string): Promise<readonly VoiceStateRecord[]>;
  listWorkspacesForUser(userId: string): Promise<readonly Workspace[]>;
  moveVoiceMember(input: MoveVoiceMemberInput): Promise<MoveVoiceMemberResult | null>;
  disconnectVoiceMember(
    input: DisconnectVoiceMemberInput,
  ): Promise<DisconnectVoiceMemberResult | null>;
  reorderChannels(input: ReorderChannelInput): Promise<readonly ChannelNodeRecord[]>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  setVoiceModerationState(input: SetVoiceModerationInput): Promise<VoiceStateRecord | null>;
  softDeleteMessage(input: SoftDeleteMessageInput): Promise<MessageRecord>;
  timeoutWorkspaceMember(input: TimeoutWorkspaceMemberInput): Promise<WorkspaceTimeoutRecord>;
  unbanWorkspaceMember(input: UnbanWorkspaceMemberInput): Promise<WorkspaceBanRecord | null>;
  updateMessage(input: UpdateMessageInput): Promise<MessageRecord>;
  updateVoiceSelfState(input: UpdateVoiceSelfStateInput): Promise<VoiceStateRecord | null>;
  upsertPermissionOverride(input: UpsertPermissionOverrideInput): Promise<PermissionOverrideRecord>;
  upsertVoiceState(input: UpsertVoiceStateInput): Promise<VoiceStateRecord>;
  deleteVoiceState(workspaceId: string, userId: string): Promise<VoiceStateRecord | null>;
}
