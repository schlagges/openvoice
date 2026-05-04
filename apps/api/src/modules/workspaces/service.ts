import { DEFAULT_ROLE_DEFINITIONS, serializePermissionMask } from "@openvoice/shared";

import type { CreateWorkspaceResult, Role, Workspace } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";

export interface WorkspaceServiceOptions {
  readonly repository: OpenVoiceRepository;
}

export interface PublicRole {
  readonly id: string;
  readonly isDefault: boolean;
  readonly key: string;
  readonly name: string;
  readonly permissions: string;
  readonly position: number;
}

export interface WorkspaceCreationResponse {
  readonly auditLogEntriesCreated: number;
  readonly defaultRoles: readonly PublicRole[];
  readonly ownerMemberId: string;
  readonly workspace: PublicWorkspace;
}

export interface PublicWorkspace {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
}

export class WorkspaceService {
  private readonly repository: OpenVoiceRepository;

  public constructor(options: WorkspaceServiceOptions) {
    this.repository = options.repository;
  }

  public async createWorkspace(input: {
    readonly name: string;
    readonly ownerId: string;
  }): Promise<WorkspaceCreationResponse> {
    const result = await this.repository.createWorkspaceWithDefaults(input);

    return toWorkspaceCreationResponse(result);
  }
}

export function toWorkspaceCreationResponse(
  result: CreateWorkspaceResult,
): WorkspaceCreationResponse {
  return {
    auditLogEntriesCreated: result.auditLogEntries.length,
    defaultRoles: result.roles.map(toPublicRole),
    ownerMemberId: result.member.id,
    workspace: toPublicWorkspace(result.workspace),
  };
}

export function toPublicWorkspace(workspace: Workspace): PublicWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    ownerId: workspace.ownerId,
  };
}

export function toPublicRole(role: Role): PublicRole {
  return {
    id: role.id,
    isDefault: role.isDefault,
    key: role.key,
    name: role.name,
    permissions: serializePermissionMask(role.permissions),
    position: role.position,
  };
}

export function assertDefaultRolesCreated(roles: readonly Role[]): void {
  const expectedKeys = DEFAULT_ROLE_DEFINITIONS.map((role) => role.key);
  const actualKeys = roles.map((role) => role.key);

  for (const expectedKey of expectedKeys) {
    if (!actualKeys.includes(expectedKey)) {
      throw new Error(`Missing default role ${expectedKey}.`);
    }
  }
}
