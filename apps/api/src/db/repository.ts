import type {
  ChannelNodeRecord,
  CreateChannelInput,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  ReorderChannelInput,
  Role,
  Session,
  UpsertPermissionOverrideInput,
  User,
  WorkspaceMember,
  WorkspaceAccessContext,
} from "./models.js";

export interface OpenVoiceRepository {
  createChannel(input: CreateChannelInput): Promise<ChannelNodeRecord>;
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
  findRoleById(roleId: string): Promise<Role | null>;
  findUserByEmailNormalized(emailNormalized: string): Promise<User | null>;
  findUserById(userId: string): Promise<User | null>;
  findWorkspaceAccessContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext | null>;
  findWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  listChannels(workspaceId: string): Promise<readonly ChannelNodeRecord[]>;
  listPermissionOverrides(channelId: string): Promise<readonly PermissionOverrideRecord[]>;
  listPermissionOverridesForChannels(
    channelIds: readonly string[],
  ): Promise<readonly PermissionOverrideRecord[]>;
  reorderChannels(input: ReorderChannelInput): Promise<readonly ChannelNodeRecord[]>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  upsertPermissionOverride(input: UpsertPermissionOverrideInput): Promise<PermissionOverrideRecord>;
}
