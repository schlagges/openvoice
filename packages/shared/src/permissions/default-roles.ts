import {
  ALL_PERMISSION_MASK,
  createPermissionMask,
  type PermissionMask,
  Permission,
} from "./permissions.js";

export type DefaultRoleKey = "owner" | "administrator" | "moderator" | "member" | "guest";

export interface DefaultRoleDefinition {
  readonly key: DefaultRoleKey;
  readonly name: string;
  readonly position: number;
  readonly permissions: PermissionMask;
}

export const MODERATOR_PERMISSION_MASK = createPermissionMask([
  Permission.VIEW_CHANNEL,
  Permission.READ_MESSAGE_HISTORY,
  Permission.SEND_MESSAGES,
  Permission.EDIT_OWN_MESSAGES,
  Permission.DELETE_OWN_MESSAGES,
  Permission.MANAGE_MESSAGES,
  Permission.CONNECT_VOICE,
  Permission.SPEAK,
  Permission.STREAM_CAMERA,
  Permission.SHARE_SCREEN,
  Permission.MUTE_MEMBERS,
  Permission.DEAFEN_MEMBERS,
  Permission.MOVE_MEMBERS,
  Permission.DISCONNECT_MEMBERS,
  Permission.KICK_MEMBERS,
  Permission.TIMEOUT_MEMBERS,
  Permission.VIEW_AUDIT_LOG,
]);

export const MEMBER_PERMISSION_MASK = createPermissionMask([
  Permission.VIEW_CHANNEL,
  Permission.READ_MESSAGE_HISTORY,
  Permission.SEND_MESSAGES,
  Permission.EDIT_OWN_MESSAGES,
  Permission.DELETE_OWN_MESSAGES,
  Permission.CONNECT_VOICE,
  Permission.SPEAK,
  Permission.USE_VAD,
  Permission.USE_PUSH_TO_TALK,
  Permission.STREAM_CAMERA,
  Permission.SHARE_SCREEN,
]);

export const GUEST_PERMISSION_MASK = createPermissionMask([
  Permission.VIEW_CHANNEL,
  Permission.CONNECT_VOICE,
  Permission.SPEAK,
]);

export const DEFAULT_ROLE_DEFINITIONS: readonly DefaultRoleDefinition[] = [
  {
    key: "owner",
    name: "Owner",
    position: 0,
    permissions: ALL_PERMISSION_MASK,
  },
  {
    key: "administrator",
    name: "Administrator",
    position: 1,
    permissions: ALL_PERMISSION_MASK,
  },
  {
    key: "moderator",
    name: "Moderator",
    position: 2,
    permissions: MODERATOR_PERMISSION_MASK,
  },
  {
    key: "member",
    name: "Member",
    position: 3,
    permissions: MEMBER_PERMISSION_MASK,
  },
  {
    key: "guest",
    name: "Guest",
    position: 4,
    permissions: GUEST_PERMISSION_MASK,
  },
];
