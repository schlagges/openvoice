import type { DefaultRoleKey, PermissionMask } from "@openvoice/shared";

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
