import {
  EMPTY_PERMISSION_MASK,
  hasPermissionBit,
  type PermissionMask,
  Permission,
} from "./permissions.js";

export interface PermissionOverride {
  readonly allow: PermissionMask;
  readonly deny: PermissionMask;
}

export interface ChannelPermissionLayer {
  readonly roleOverrides?: readonly PermissionOverride[];
  readonly memberOverride?: PermissionOverride | null;
}

export interface PermissionEvaluationContext {
  readonly userId: string;
  readonly workspaceOwnerId: string;
  readonly isSystemAdmin?: boolean;
  readonly rolePermissions: readonly PermissionMask[];
  readonly channelPath?: readonly ChannelPermissionLayer[];
}

export function calculateWorkspaceRolePermissions(
  rolePermissions: readonly PermissionMask[],
): PermissionMask {
  return rolePermissions.reduce<PermissionMask>(
    (mask, roleMask) => mask | roleMask,
    EMPTY_PERMISSION_MASK,
  );
}

export function hasPermission(
  context: PermissionEvaluationContext,
  permission: Permission,
): boolean {
  if (context.isSystemAdmin === true) {
    return true;
  }

  if (context.workspaceOwnerId === context.userId) {
    return true;
  }

  const basePermissions = calculateWorkspaceRolePermissions(context.rolePermissions);

  if (hasPermissionBit(basePermissions, Permission.ADMINISTRATOR)) {
    return true;
  }

  const effectivePermissions = applyChannelOverrides(basePermissions, context.channelPath ?? []);

  return hasPermissionBit(effectivePermissions, permission);
}

export function canPerformOwnerOnlyAction(context: PermissionEvaluationContext): boolean {
  return context.isSystemAdmin === true || context.workspaceOwnerId === context.userId;
}

export function applyChannelOverrides(
  basePermissions: PermissionMask,
  channelPath: readonly ChannelPermissionLayer[],
): PermissionMask {
  let effectivePermissions = basePermissions;

  for (const layer of channelPath) {
    const roleOverride = combineRoleOverrides(layer.roleOverrides ?? []);
    effectivePermissions = applyOverride(effectivePermissions, roleOverride);

    if (layer.memberOverride) {
      effectivePermissions = applyOverride(effectivePermissions, layer.memberOverride);
    }
  }

  return effectivePermissions;
}

function combineRoleOverrides(overrides: readonly PermissionOverride[]): PermissionOverride {
  return overrides.reduce<PermissionOverride>(
    (combined, override) => ({
      allow: combined.allow | override.allow,
      deny: combined.deny | override.deny,
    }),
    {
      allow: EMPTY_PERMISSION_MASK,
      deny: EMPTY_PERMISSION_MASK,
    },
  );
}

function applyOverride(permissions: PermissionMask, override: PermissionOverride): PermissionMask {
  return (permissions | override.allow) & ~override.deny;
}
