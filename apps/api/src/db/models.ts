import type {
  AudioMode,
  ChannelType,
  DefaultRoleKey,
  MessageContentFormat,
  PermissionMask,
} from "@openvoice/shared";

export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface User {
  readonly createdAt: Date;
  readonly displayName: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly id: string;
  readonly passwordHash: string;
  readonly updatedAt: Date;
}

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
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly updatedAt: Date;
}

export interface WorkspaceMember {
  readonly createdAt: Date;
  readonly id: string;
  readonly userId: string;
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
  readonly event: string;
  readonly id: string;
  readonly ipHash: string | null;
  readonly metadata: AuditMetadata;
  readonly reason: string | null;
  readonly targetId: string | null;
  readonly targetType: string;
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
  readonly channelId: string;
  readonly connectedAt: Date;
  readonly screenShareEnabled: boolean;
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
  readonly displayName: string;
  readonly email: string;
  readonly emailNormalized: string;
  readonly passwordHash: string;
}

export interface CreateSessionInput {
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly tokenHash: string;
  readonly userId: string;
}

export interface CreateWorkspaceInput {
  readonly name: string;
  readonly ownerId: string;
}

export interface CreateWorkspaceResult {
  readonly auditLogEntries: readonly AuditLogEntry[];
  readonly member: WorkspaceMember;
  readonly roles: readonly Role[];
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
  readonly selfDeafened?: boolean;
  readonly selfMuted?: boolean;
  readonly speaking?: boolean;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface SetVoiceModerationInput {
  readonly actorId: string;
  readonly serverDeafened?: boolean;
  readonly serverMuted?: boolean;
  readonly targetUserId: string;
  readonly workspaceId: string;
}
