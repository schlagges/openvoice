import type {
  AuditEvent,
  AudioMode,
  ChannelType,
  DefaultRoleKey,
  MessageContentFormat,
  PermissionMask,
  VideoContentMode,
  VideoQualityProfile,
} from "@openvoice/shared";

export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface User {
  readonly createdAt: Date;
  readonly createdFromInviteId: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly id: string;
  readonly keycloakSubject: string | null;
  readonly kind: UserKind;
  readonly linkedAt: Date | null;
  readonly passwordHash: string;
  readonly updatedAt: Date;
}

export type UserKind = "guest" | "registered";

export interface Session {
  readonly createdAt: Date;
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly revokedAt: Date | null;
  readonly tokenHash: string;
  readonly userId: string;
}

export interface Workspace {
  readonly accessMode: WorkspaceAccessMode;
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly updatedAt: Date;
}

export type WorkspaceAccessMode = "global_authenticated" | "private";

export interface WorkspaceWithMemberCount extends Workspace {
  readonly memberCount: number;
}

export interface WorkspaceMember {
  readonly createdAt: Date;
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  readonly userDisplayName: string;
  readonly userEmail: string;
  readonly userKind: UserKind;
  readonly userKeycloakSubject: string | null;
}

export interface WorkspaceInvite {
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly revokedAt: Date | null;
  readonly usedCount: number;
  readonly workspaceId: string;
}

export interface Role {
  readonly createdAt: Date;
  readonly id: string;
  readonly isDefault: boolean;
  readonly key: DefaultRoleKey;
  readonly name: string;
  readonly permissions: PermissionMask;
  readonly position: number;
  readonly updatedAt: Date;
  readonly workspaceId: string;
}

export interface AuditLogEntry {
  readonly actorId: string | null;
  readonly createdAt: Date;
  readonly event: AuditEvent | string;
  readonly id: string;
  readonly ipHash: string | null;
  readonly metadata: AuditMetadata;
  readonly reason: string | null;
  readonly targetId: string | null;
  readonly targetType: string;
  readonly workspaceId: string;
}

export interface WorkspaceBanRecord {
  readonly bannedBy: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly reason: string | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface WorkspaceTimeoutRecord {
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly reason: string | null;
  readonly timedOutUntil: Date;
  readonly updatedAt: Date;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ChannelNodeRecord {
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly depth: number;
  readonly id: string;
  readonly inheritsPermissions: boolean;
  readonly name: string;
  readonly parentId: string | null;
  readonly path: string;
  readonly position: number;
  readonly settings: Record<string, never>;
  readonly slug: string;
  readonly type: ChannelType;
  readonly updatedAt: Date;
  readonly workspaceId: string;
}

export type PermissionOverrideTargetType = "member" | "role";

export interface PermissionOverrideRecord {
  readonly allow: PermissionMask;
  readonly channelId: string;
  readonly createdAt: Date;
  readonly deny: PermissionMask;
  readonly id: string;
  readonly targetId: string;
  readonly targetType: PermissionOverrideTargetType;
  readonly updatedAt: Date;
}

export interface MessageRecord {
  readonly authorId: string;
  readonly channelId: string;
  readonly clientMessageId: string;
  readonly content: string;
  readonly contentFormat: MessageContentFormat;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
  readonly editedAt: Date | null;
  readonly id: string;
  readonly updatedAt: Date;
  readonly workspaceId: string;
}

export interface VoiceStateRecord {
  readonly audioMode: AudioMode;
  readonly cameraEnabled: boolean;
  readonly cameraQuality: VideoQualityProfile;
  readonly channelId: string;
  readonly connectedAt: Date;
  readonly screenShareContentMode: VideoContentMode;
  readonly screenShareEnabled: boolean;
  readonly screenShareQuality: VideoQualityProfile;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
  readonly serverDeafened: boolean;
  readonly serverMuted: boolean;
  readonly sessionId: string;
  readonly speaking: boolean;
  readonly updatedAt: Date;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface WorkspaceAccessContext {
  readonly member: WorkspaceMember;
  readonly roles: readonly Role[];
  readonly workspace: Workspace;
}

export interface CreateUserInput {
  readonly createdFromInviteId?: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly keycloakSubject?: string | null;
  readonly kind?: UserKind;
  readonly linkedAt?: Date | null;
  readonly passwordHash: string;
}

export interface CreateSessionInput {
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly tokenHash: string;
  readonly userId: string;
}

export interface CreateWorkspaceInput {
  readonly accessMode?: WorkspaceAccessMode;
  readonly name: string;
  readonly ownerId: string;
}

export interface CreateWorkspaceResult {
  readonly auditLogEntries: readonly AuditLogEntry[];
  readonly member: WorkspaceMember;
  readonly roles: readonly Role[];
  readonly workspace: Workspace;
}

export interface CreateWorkspaceInviteInput {
  readonly actorId: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly workspaceId: string;
}

export interface CreateWorkspaceInviteResult {
  readonly auditLogEntry: AuditLogEntry;
  readonly invite: WorkspaceInvite;
}

export interface RedeemWorkspaceInviteInput {
  readonly actorId: string;
  readonly codeHash: string;
  readonly joinKind?: "guest" | "member";
  readonly now: Date;
  readonly roleKey?: DefaultRoleKey;
}

export interface RedeemWorkspaceInviteResult {
  readonly auditLogEntries: readonly AuditLogEntry[];
  readonly alreadyMember: boolean;
  readonly member: WorkspaceMember;
  readonly role: Role | null;
  readonly workspace: Workspace;
}

export interface JoinGlobalWorkspaceInput {
  readonly roleKey?: DefaultRoleKey;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface JoinGlobalWorkspaceResult {
  readonly auditLogEntries: readonly AuditLogEntry[];
  readonly alreadyMember: boolean;
  readonly member: WorkspaceMember;
  readonly role: Role | null;
  readonly workspace: Workspace;
}

export interface CreateChannelInput {
  readonly actorId: string;
  readonly depth: number;
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly path: string;
  readonly position: number;
  readonly slug: string;
  readonly type: ChannelType;
  readonly workspaceId: string;
}

export interface ReorderChannelInput {
  readonly actorId: string;
  readonly moves: readonly ReorderChannelMove[];
  readonly workspaceId: string;
}

export interface ReorderChannelMove {
  readonly channelId: string;
  readonly depth: number;
  readonly parentId: string | null;
  readonly path: string;
  readonly position: number;
}

export interface UpsertPermissionOverrideInput {
  readonly actorId: string;
  readonly allow: PermissionMask;
  readonly channelId: string;
  readonly deny: PermissionMask;
  readonly targetId: string;
  readonly targetType: PermissionOverrideTargetType;
}

export interface CreateMessageInput {
  readonly authorId: string;
  readonly channelId: string;
  readonly clientMessageId: string;
  readonly content: string;
  readonly contentFormat: MessageContentFormat;
  readonly id: string;
  readonly workspaceId: string;
}

export interface CreateMessageResult {
  readonly created: boolean;
  readonly message: MessageRecord;
}

export interface MessageCursorInput {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ListMessagesInput {
  readonly after?: MessageCursorInput;
  readonly before?: MessageCursorInput;
  readonly channelId: string;
  readonly limit: number;
}

export interface UpdateMessageInput {
  readonly content: string;
  readonly contentFormat: MessageContentFormat;
  readonly messageId: string;
}

export interface SoftDeleteMessageInput {
  readonly actorId: string;
  readonly deletedBy: string;
  readonly messageId: string;
}

export interface UpsertVoiceStateInput {
  readonly audioMode: AudioMode;
  readonly channelId: string;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface UpdateVoiceSelfStateInput {
  readonly audioMode?: AudioMode;
  readonly cameraEnabled?: boolean;
  readonly cameraQuality?: VideoQualityProfile;
  readonly screenShareContentMode?: VideoContentMode;
  readonly screenShareEnabled?: boolean;
  readonly screenShareQuality?: VideoQualityProfile;
  readonly selfDeafened?: boolean;
  readonly selfMuted?: boolean;
  readonly speaking?: boolean;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface SetVoiceModerationInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly serverDeafened?: boolean;
  readonly serverMuted?: boolean;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface KickWorkspaceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface KickWorkspaceMemberResult {
  readonly member: WorkspaceMember;
  readonly voiceState: VoiceStateRecord | null;
}

export interface BanWorkspaceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface BanWorkspaceMemberResult {
  readonly ban: WorkspaceBanRecord;
  readonly member: WorkspaceMember | null;
  readonly voiceState: VoiceStateRecord | null;
}

export interface UnbanWorkspaceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface TimeoutWorkspaceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly timedOutUntil: Date;
  readonly workspaceId: string;
}

export interface MoveVoiceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetChannelId: string;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface MoveVoiceMemberResult {
  readonly previousChannelId: string;
  readonly state: VoiceStateRecord;
}

export interface DisconnectVoiceMemberInput {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface DisconnectVoiceMemberResult {
  readonly state: VoiceStateRecord;
}

export interface ListAuditLogInput {
  readonly limit: number;
  readonly workspaceId: string;
}
