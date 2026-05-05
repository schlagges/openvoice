import { hasPermission, Permission } from "@openvoice/shared";

import type { WorkspaceAccessContext } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { forbidden, notFound } from "../../http/errors.js";

export async function requireWorkspacePermission(
  repository: OpenVoiceRepository,
  workspaceId: string,
  userId: string,
  permission: Permission,
): Promise<WorkspaceAccessContext> {
  const access = await repository.findWorkspaceAccessContext(workspaceId, userId);
  if (!access) {
    throw forbidden("Workspace access required.");
  }

  const activeBan = await repository.findActiveWorkspaceBan(workspaceId, userId);
  if (activeBan) {
    throw forbidden("Workspace access is blocked by an active ban.");
  }

  if (
    !hasPermission(
      {
        rolePermissions: access.roles.map((role) => role.permissions),
        userId,
        workspaceOwnerId: access.workspace.ownerId,
      },
      permission,
    )
  ) {
    throw forbidden("Missing required workspace permission.", {
      permission: permission.toString(10),
    });
  }

  return access;
}

export async function assertCanModerateMember(input: {
  readonly actorAccess: WorkspaceAccessContext;
  readonly repository: OpenVoiceRepository;
  readonly targetUserId: string;
}): Promise<WorkspaceAccessContext> {
  const { actorAccess, repository, targetUserId } = input;

  if (actorAccess.member.userId === targetUserId) {
    throw forbidden("Members cannot moderate themselves.");
  }

  if (actorAccess.workspace.ownerId === targetUserId) {
    throw forbidden("The workspace owner is protected from moderation actions.");
  }

  const targetAccess = await repository.findWorkspaceAccessContext(
    actorAccess.workspace.id,
    targetUserId,
  );
  if (!targetAccess) {
    throw notFound("Workspace member not found.");
  }

  if (actorAccess.workspace.ownerId === actorAccess.member.userId) {
    return targetAccess;
  }

  const actorRank = getHighestRoleRank(actorAccess);
  const targetRank = getHighestRoleRank(targetAccess);
  if (actorRank >= targetRank) {
    throw forbidden("Role hierarchy prevents this moderation action.");
  }

  return targetAccess;
}

function getHighestRoleRank(access: WorkspaceAccessContext): number {
  return Math.min(Number.MAX_SAFE_INTEGER, ...access.roles.map((role) => role.position));
}
