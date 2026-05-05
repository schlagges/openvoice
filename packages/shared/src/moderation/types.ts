export const AuditEvent = {
  CHANNEL_CREATE: "CHANNEL_CREATE",
  CHANNEL_DELETE: "CHANNEL_DELETE",
  CHANNEL_MOVE: "CHANNEL_MOVE",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  INVITE_CREATE: "INVITE_CREATE",
  INVITE_REVOKE: "INVITE_REVOKE",
  MEMBER_BAN: "MEMBER_BAN",
  MEMBER_KICK: "MEMBER_KICK",
  MEMBER_TIMEOUT: "MEMBER_TIMEOUT",
  MEMBER_UNBAN: "MEMBER_UNBAN",
  MESSAGE_DELETE: "MESSAGE_DELETE",
  PERMISSION_OVERRIDE_CREATE: "PERMISSION_OVERRIDE_CREATE",
  PERMISSION_OVERRIDE_DELETE: "PERMISSION_OVERRIDE_DELETE",
  PERMISSION_OVERRIDE_UPDATE: "PERMISSION_OVERRIDE_UPDATE",
  ROLE_ASSIGN: "ROLE_ASSIGN",
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_DELETE: "ROLE_DELETE",
  ROLE_REMOVE: "ROLE_REMOVE",
  ROLE_UPDATE: "ROLE_UPDATE",
  VOICE_DISCONNECT: "VOICE_DISCONNECT",
  VOICE_MOVE: "VOICE_MOVE",
  VOICE_SERVER_DEAFEN: "VOICE_SERVER_DEAFEN",
  VOICE_SERVER_MUTE: "VOICE_SERVER_MUTE",
  WORKSPACE_CREATE: "WORKSPACE_CREATE",
  WORKSPACE_DELETE: "WORKSPACE_DELETE",
  WORKSPACE_UPDATE: "WORKSPACE_UPDATE",
} as const;

export type AuditEvent = (typeof AuditEvent)[keyof typeof AuditEvent];

export type AuditMetadataValue = boolean | null | number | string;

export interface PublicAuditLogEntry {
  readonly actorId: string | null;
  readonly createdAt: string;
  readonly event: AuditEvent | string;
  readonly id: string;
  readonly ipHash: string | null;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
  readonly reason: string | null;
  readonly targetId: string | null;
  readonly targetType: string;
  readonly workspaceId: string;
}

export interface WorkspaceBan {
  readonly bannedBy: string;
  readonly createdAt: string;
  readonly id: string;
  readonly reason: string | null;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface WorkspaceTimeout {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly reason: string | null;
  readonly timedOutUntil: string;
  readonly updatedAt: string;
  readonly userId: string;
  readonly workspaceId: string;
}
