import type {
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
  Session,
  SoftDeleteMessageInput,
  UpdateMessageInput,
  UpsertPermissionOverrideInput,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceAccessContext,
} from "./models.js";

export interface OpenVoiceRepository {
  createChannel(input: CreateChannelInput): Promise<ChannelNodeRecord>;
  createMessage(input: CreateMessageInput): Promise<CreateMessageResult>;
  createSession(input: CreateSessionInput): Promise<Session>;
  createUser(input: CreateUserInput): Promise<User>;
  createWorkspaceWithDefaults(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult>;
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
  findWorkspaceAccessContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext | null>;
  findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  listChannels(workspaceId: string): Promise<readonly ChannelNodeRecord[]>;
  listMessages(input: ListMessagesInput): Promise<readonly MessageRecord[]>;
  listPermissionOverrides(channelId: string): Promise<readonly PermissionOverrideRecord[]>;
  listPermissionOverridesForChannels(
    channelIds: readonly string[],
  ): Promise<readonly PermissionOverrideRecord[]>;
  listWorkspacesForUser(userId: string): Promise<readonly Workspace[]>;
  reorderChannels(input: ReorderChannelInput): Promise<readonly ChannelNodeRecord[]>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  softDeleteMessage(input: SoftDeleteMessageInput): Promise<MessageRecord>;
  updateMessage(input: UpdateMessageInput): Promise<MessageRecord>;
  upsertPermissionOverride(input: UpsertPermissionOverrideInput): Promise<PermissionOverrideRecord>;
}
