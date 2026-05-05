import type { ChannelNode, ChannelTreeNode } from "../channels/types.js";
import type { Message } from "../messages/types.js";

export const GatewayOp = {
  DISPATCH: "DISPATCH",
  ERROR: "ERROR",
  HEARTBEAT: "HEARTBEAT",
  HEARTBEAT_ACK: "HEARTBEAT_ACK",
  HELLO: "HELLO",
  IDENTIFY: "IDENTIFY",
  READY: "READY",
} as const;

export type GatewayOp = (typeof GatewayOp)[keyof typeof GatewayOp];

export const PresenceStatus = {
  DND: "dnd",
  IDLE: "idle",
  OFFLINE: "offline",
  ONLINE: "online",
} as const;

export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

export const ClientGatewayEventType = {
  PRESENCE_UPDATE: "PRESENCE_UPDATE",
} as const;

export type ClientGatewayEventType =
  (typeof ClientGatewayEventType)[keyof typeof ClientGatewayEventType];

export const ServerGatewayEventType = {
  CHANNEL_CREATE: "CHANNEL_CREATE",
  CHANNEL_DELETE: "CHANNEL_DELETE",
  CHANNEL_REORDER: "CHANNEL_REORDER",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  MEMBER_JOIN: "MEMBER_JOIN",
  MEMBER_LEAVE: "MEMBER_LEAVE",
  MEMBER_UPDATE: "MEMBER_UPDATE",
  MESSAGE_CREATE: "MESSAGE_CREATE",
  MESSAGE_DELETE: "MESSAGE_DELETE",
  MESSAGE_UPDATE: "MESSAGE_UPDATE",
  PERMISSION_UPDATE: "PERMISSION_UPDATE",
  PRESENCE_UPDATE: "PRESENCE_UPDATE",
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_DELETE: "ROLE_DELETE",
  ROLE_UPDATE: "ROLE_UPDATE",
  WORKSPACE_UPDATE: "WORKSPACE_UPDATE",
} as const;

export type ServerGatewayEventType =
  (typeof ServerGatewayEventType)[keyof typeof ServerGatewayEventType];

export interface GatewayEnvelope<T = unknown> {
  readonly d?: T;
  readonly op: GatewayOp;
  readonly s?: number;
  readonly t?: string;
}

export interface GatewayHelloPayload {
  readonly heartbeatIntervalMs: number;
  readonly resumeTimeoutMs: number;
}

export interface GatewayIdentifyPayload {
  readonly resumeToken?: string;
  readonly sessionToken?: string;
}

export interface GatewayReadyWorkspace {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
}

export interface GatewayReadyUser {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
}

export interface GatewayReadyPayload {
  readonly heartbeatIntervalMs: number;
  readonly resumeToken: string;
  readonly resumed: boolean;
  readonly user: GatewayReadyUser;
  readonly workspaces: readonly GatewayReadyWorkspace[];
}

export interface GatewayErrorPayload {
  readonly code: string;
  readonly message: string;
}

export interface PresenceUpdatePayload {
  readonly status: PresenceStatus;
  readonly updatedAt: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ChannelCreatePayload {
  readonly channel: ChannelNode;
}

export interface ChannelReorderPayload {
  readonly channels: readonly ChannelTreeNode[];
  readonly workspaceId: string;
}

export interface PermissionUpdatePayload {
  readonly workspaceId: string;
}

export interface WorkspaceUpdatePayload {
  readonly workspace: GatewayReadyWorkspace;
}

export type GatewayDispatchPayload =
  | ChannelCreatePayload
  | ChannelReorderPayload
  | Message
  | PermissionUpdatePayload
  | PresenceUpdatePayload
  | WorkspaceUpdatePayload;

export function isPresenceStatus(value: unknown): value is PresenceStatus {
  return (
    value === PresenceStatus.DND ||
    value === PresenceStatus.IDLE ||
    value === PresenceStatus.OFFLINE ||
    value === PresenceStatus.ONLINE
  );
}
