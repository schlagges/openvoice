export const Permission = {
  ADMINISTRATOR: 1n << 0n,
  MANAGE_WORKSPACE: 1n << 1n,
  MANAGE_ROLES: 1n << 2n,
  MANAGE_CHANNELS: 1n << 3n,
  MANAGE_INVITES: 1n << 4n,
  VIEW_AUDIT_LOG: 1n << 5n,
  KICK_MEMBERS: 1n << 6n,
  BAN_MEMBERS: 1n << 7n,
  TIMEOUT_MEMBERS: 1n << 8n,
  VIEW_CHANNEL: 1n << 9n,
  READ_MESSAGE_HISTORY: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  EDIT_OWN_MESSAGES: 1n << 12n,
  DELETE_OWN_MESSAGES: 1n << 13n,
  MANAGE_MESSAGES: 1n << 14n,
  MENTION_MEMBERS: 1n << 15n,
  MENTION_EVERYONE: 1n << 16n,
  CONNECT_VOICE: 1n << 17n,
  SPEAK: 1n << 18n,
  USE_VAD: 1n << 19n,
  USE_PUSH_TO_TALK: 1n << 20n,
  STREAM_CAMERA: 1n << 21n,
  SHARE_SCREEN: 1n << 22n,
  SHARE_SCREEN_4K: 1n << 23n,
  PRIORITY_AUDIO: 1n << 24n,
  MUTE_MEMBERS: 1n << 25n,
  DEAFEN_MEMBERS: 1n << 26n,
  MOVE_MEMBERS: 1n << 27n,
  DISCONNECT_MEMBERS: 1n << 28n,
  MANAGE_CHANNEL_PERMS: 1n << 29n,
  VIEW_CHANNEL_STATS: 1n << 30n,
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export type PermissionMask = bigint;

export const EMPTY_PERMISSION_MASK = 0n;

export const ALL_PERMISSIONS = Object.values(Permission);

export const ALL_PERMISSION_MASK = ALL_PERMISSIONS.reduce<PermissionMask>(
  (mask, permission) => mask | permission,
  EMPTY_PERMISSION_MASK,
);

export function createPermissionMask(permissions: readonly Permission[]): PermissionMask {
  return permissions.reduce<PermissionMask>(
    (mask, permission) => mask | permission,
    EMPTY_PERMISSION_MASK,
  );
}

export function hasPermissionBit(mask: PermissionMask, permission: Permission): boolean {
  return (mask & permission) === permission;
}

export function serializePermissionMask(mask: PermissionMask): string {
  return mask.toString(10);
}

export function parsePermissionMask(value: string): PermissionMask {
  if (!/^\d+$/.test(value)) {
    throw new Error("Permission mask must be a non-negative decimal string.");
  }

  return BigInt(value);
}
