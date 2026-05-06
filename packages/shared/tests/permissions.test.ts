import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSION_MASK,
  canPerformOwnerOnlyAction,
  createPermissionMask,
  DEFAULT_ROLE_DEFINITIONS,
  GUEST_PERMISSION_MASK,
  hasPermission,
  hasPermissionBit,
  MEMBER_PERMISSION_MASK,
  MODERATOR_PERMISSION_MASK,
  parsePermissionMask,
  Permission,
  serializePermissionMask,
} from "../src/index.js";

const role = (key: string) => {
  const definition = DEFAULT_ROLE_DEFINITIONS.find((candidate) => candidate.key === key);

  if (!definition) {
    throw new Error(`Missing default role definition for ${key}.`);
  }

  return definition.permissions;
};

describe("permission bitsets", () => {
  it("serializes and parses permission masks for database storage", () => {
    const mask = createPermissionMask([Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES]);

    expect(parsePermissionMask(serializePermissionMask(mask))).toBe(mask);
  });

  it("defines default role masks from the specification", () => {
    expect(hasPermissionBit(role("owner"), Permission.ADMINISTRATOR)).toBe(true);
    expect(hasPermissionBit(role("administrator"), Permission.ADMINISTRATOR)).toBe(true);
    expect(hasPermissionBit(MODERATOR_PERMISSION_MASK, Permission.MANAGE_MESSAGES)).toBe(true);
    expect(hasPermissionBit(MEMBER_PERMISSION_MASK, Permission.SHARE_SCREEN)).toBe(true);
    expect(hasPermissionBit(GUEST_PERMISSION_MASK, Permission.READ_MESSAGE_HISTORY)).toBe(true);
    expect(hasPermissionBit(GUEST_PERMISSION_MASK, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermissionBit(GUEST_PERMISSION_MASK, Permission.SHARE_SCREEN)).toBe(true);
    expect(hasPermissionBit(GUEST_PERMISSION_MASK, Permission.MANAGE_INVITES)).toBe(false);
  });
});

describe("permission engine", () => {
  it("allows the workspace owner to perform every normal and owner-only action", () => {
    const context = {
      userId: "user_owner",
      workspaceOwnerId: "user_owner",
      rolePermissions: [0n],
    };

    expect(hasPermission(context, Permission.BAN_MEMBERS)).toBe(true);
    expect(canPerformOwnerOnlyAction(context)).toBe(true);
  });

  it("allows system admins to perform every action", () => {
    const context = {
      userId: "user_admin",
      workspaceOwnerId: "user_owner",
      isSystemAdmin: true,
      rolePermissions: [0n],
    };

    expect(hasPermission(context, Permission.MANAGE_WORKSPACE)).toBe(true);
    expect(canPerformOwnerOnlyAction(context)).toBe(true);
  });

  it("allows administrators to bypass normal checks but not owner-only checks", () => {
    const context = {
      userId: "user_admin",
      workspaceOwnerId: "user_owner",
      rolePermissions: [role("administrator")],
    };

    expect(hasPermission(context, Permission.MANAGE_ROLES)).toBe(true);
    expect(hasPermission(context, Permission.SHARE_SCREEN_4K)).toBe(true);
    expect(canPerformOwnerOnlyAction(context)).toBe(false);
  });

  it("combines permissions from multiple roles", () => {
    const context = {
      userId: "user_member",
      workspaceOwnerId: "user_owner",
      rolePermissions: [
        createPermissionMask([Permission.VIEW_CHANNEL]),
        createPermissionMask([Permission.SEND_MESSAGES]),
      ],
    };

    expect(hasPermission(context, Permission.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(context, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(context, Permission.MANAGE_WORKSPACE)).toBe(false);
  });

  it("lets role deny beat role allow on the same channel layer", () => {
    const context = {
      userId: "user_member",
      workspaceOwnerId: "user_owner",
      rolePermissions: [createPermissionMask([Permission.VIEW_CHANNEL])],
      channelPath: [
        {
          roleOverrides: [
            { allow: createPermissionMask([Permission.SEND_MESSAGES]), deny: 0n },
            { allow: 0n, deny: createPermissionMask([Permission.SEND_MESSAGES]) },
          ],
        },
      ],
    };

    expect(hasPermission(context, Permission.SEND_MESSAGES)).toBe(false);
  });

  it("lets member override allow beat role deny on the same channel layer", () => {
    const context = {
      userId: "user_member",
      workspaceOwnerId: "user_owner",
      rolePermissions: [createPermissionMask([Permission.VIEW_CHANNEL])],
      channelPath: [
        {
          roleOverrides: [{ allow: 0n, deny: createPermissionMask([Permission.SEND_MESSAGES]) }],
          memberOverride: { allow: createPermissionMask([Permission.SEND_MESSAGES]), deny: 0n },
        },
      ],
    };

    expect(hasPermission(context, Permission.SEND_MESSAGES)).toBe(true);
  });

  it("lets deeper channel overrides change inherited parent results", () => {
    const context = {
      userId: "user_member",
      workspaceOwnerId: "user_owner",
      rolePermissions: [createPermissionMask([Permission.VIEW_CHANNEL])],
      channelPath: [
        {
          roleOverrides: [{ allow: 0n, deny: createPermissionMask([Permission.VIEW_CHANNEL]) }],
        },
        {
          roleOverrides: [{ allow: createPermissionMask([Permission.VIEW_CHANNEL]), deny: 0n }],
        },
      ],
    };

    expect(hasPermission(context, Permission.VIEW_CHANNEL)).toBe(true);
  });

  it("keeps the all-permission mask explicit", () => {
    expect(hasPermissionBit(ALL_PERMISSION_MASK, Permission.VIEW_CHANNEL_STATS)).toBe(true);
  });
});
