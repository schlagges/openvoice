import { randomUUID } from "node:crypto";

import {
  DEFAULT_ROLE_DEFINITIONS,
  parsePermissionMask,
  serializePermissionMask,
  type DefaultRoleKey,
} from "@openvoice/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { DuplicateEmailError } from "./errors.js";
import type {
  AuditLogEntry,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  Role,
  Session,
  User,
  Workspace,
  WorkspaceMember,
} from "./models.js";
import type { OpenVoiceRepository } from "./repository.js";

export class PostgresOpenVoiceRepository implements OpenVoiceRepository {
  private readonly pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

  public async createUser(input: CreateUserInput): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `INSERT INTO users (id, email, email_normalized, display_name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         RETURNING *`,
        [randomUUID(), input.email, input.emailNormalized, input.displayName, input.passwordHash],
      );

      return mapUser(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateEmailError();
      }

      throw error;
    }
  }

  public async findUserByEmailNormalized(emailNormalized: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE email_normalized = $1",
      [emailNormalized],
    );

    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async findUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);

    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async createSession(input: CreateSessionInput): Promise<Session> {
    const result = await this.pool.query<SessionRow>(
      `INSERT INTO sessions (id, user_id, token_hash, csrf_token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, null, now())
       RETURNING *`,
      [randomUUID(), input.userId, input.tokenHash, input.csrfTokenHash, input.expiresAt],
    );

    return mapSession(result.rows[0]);
  }

  public async findActiveSessionByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT *
       FROM sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > $2`,
      [tokenHash, now],
    );

    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  public async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.pool.query("UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1", [
      tokenHash,
      revokedAt,
    ]);
  }

  public async createWorkspaceWithDefaults(
    input: CreateWorkspaceInput,
  ): Promise<CreateWorkspaceResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const workspaceResult = await client.query<WorkspaceRow>(
        `INSERT INTO workspaces (id, name, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())
         RETURNING *`,
        [randomUUID(), input.name, input.ownerId],
      );
      const workspace = mapWorkspace(workspaceResult.rows[0]);

      const memberResult = await client.query<WorkspaceMemberRow>(
        `INSERT INTO workspace_members (id, workspace_id, user_id, created_at)
         VALUES ($1, $2, $3, now())
         RETURNING *`,
        [randomUUID(), workspace.id, input.ownerId],
      );
      const member = mapWorkspaceMember(memberResult.rows[0]);

      const roles: Role[] = [];
      for (const definition of DEFAULT_ROLE_DEFINITIONS) {
        const roleResult = await client.query<RoleRow>(
          `INSERT INTO roles (id, workspace_id, key, name, permissions, position, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, now(), now())
           RETURNING *`,
          [
            randomUUID(),
            workspace.id,
            definition.key,
            definition.name,
            serializePermissionMask(definition.permissions),
            definition.position,
          ],
        );
        roles.push(mapRole(roleResult.rows[0]));
      }

      const ownerRole = roles.find((role) => role.key === "owner");
      if (!ownerRole) {
        throw new Error("Default owner role missing.");
      }

      await client.query(
        `INSERT INTO member_roles (workspace_member_id, role_id, created_at)
         VALUES ($1, $2, now())`,
        [member.id, ownerRole.id],
      );

      const auditLogEntries = await insertWorkspaceCreationAuditEntries(client, {
        actorId: input.ownerId,
        member,
        roles,
        workspace,
      });

      await client.query("COMMIT");

      return {
        auditLogEntries,
        member,
        roles,
        workspace,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

interface WorkspaceCreationAuditInput {
  readonly actorId: string;
  readonly member: WorkspaceMember;
  readonly roles: readonly Role[];
  readonly workspace: Workspace;
}

async function insertWorkspaceCreationAuditEntries(
  client: PoolClient,
  input: WorkspaceCreationAuditInput,
): Promise<AuditLogEntry[]> {
  const entries = [
    {
      actorId: input.actorId,
      event: "WORKSPACE_CREATE",
      metadata: { workspaceName: input.workspace.name },
      targetId: input.workspace.id,
      targetType: "workspace",
      workspaceId: input.workspace.id,
    },
    ...input.roles.map((role) => ({
      actorId: input.actorId,
      event: "ROLE_CREATE",
      metadata: {
        defaultRole: true,
        key: role.key,
        permissions: serializePermissionMask(role.permissions),
      },
      targetId: role.id,
      targetType: "role",
      workspaceId: input.workspace.id,
    })),
    {
      actorId: input.actorId,
      event: "MEMBER_ROLE_ASSIGN",
      metadata: { roleKey: "owner" },
      targetId: input.member.id,
      targetType: "workspace_member",
      workspaceId: input.workspace.id,
    },
  ];
  const auditLogEntries: AuditLogEntry[] = [];

  for (const entry of entries) {
    const result = await client.query<AuditLogRow>(
      `INSERT INTO audit_log (id, workspace_id, actor_id, event, target_type, target_id, reason, metadata, ip_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, null, $7, null, now())
       RETURNING *`,
      [
        randomUUID(),
        entry.workspaceId,
        entry.actorId,
        entry.event,
        entry.targetType,
        entry.targetId,
        JSON.stringify(entry.metadata),
      ],
    );
    auditLogEntries.push(mapAuditLogEntry(result.rows[0]));
  }

  return auditLogEntries;
}

interface UserRow extends QueryResultRow {
  readonly created_at: Date;
  readonly display_name: string;
  readonly email: string;
  readonly email_normalized: string;
  readonly id: string;
  readonly password_hash: string;
  readonly updated_at: Date;
}

interface SessionRow extends QueryResultRow {
  readonly created_at: Date;
  readonly csrf_token_hash: string;
  readonly expires_at: Date;
  readonly id: string;
  readonly revoked_at: Date | null;
  readonly token_hash: string;
  readonly user_id: string;
}

interface WorkspaceRow extends QueryResultRow {
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly owner_id: string;
  readonly updated_at: Date;
}

interface WorkspaceMemberRow extends QueryResultRow {
  readonly created_at: Date;
  readonly id: string;
  readonly user_id: string;
  readonly workspace_id: string;
}

interface RoleRow extends QueryResultRow {
  readonly created_at: Date;
  readonly id: string;
  readonly is_default: boolean;
  readonly key: DefaultRoleKey;
  readonly name: string;
  readonly permissions: string;
  readonly position: number;
  readonly updated_at: Date;
  readonly workspace_id: string;
}

interface AuditLogRow extends QueryResultRow {
  readonly actor_id: string | null;
  readonly created_at: Date;
  readonly event: string;
  readonly id: string;
  readonly ip_hash: string | null;
  readonly metadata: Record<string, string | number | boolean | null>;
  readonly reason: string | null;
  readonly target_id: string | null;
  readonly target_type: string;
  readonly workspace_id: string;
}

function mapUser(row: UserRow | undefined): User {
  if (!row) {
    throw new Error("Expected user row.");
  }

  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email: row.email,
    emailNormalized: row.email_normalized,
    id: row.id,
    passwordHash: row.password_hash,
    updatedAt: row.updated_at,
  };
}

function mapSession(row: SessionRow | undefined): Session {
  if (!row) {
    throw new Error("Expected session row.");
  }

  return {
    createdAt: row.created_at,
    csrfTokenHash: row.csrf_token_hash,
    expiresAt: row.expires_at,
    id: row.id,
    revokedAt: row.revoked_at,
    tokenHash: row.token_hash,
    userId: row.user_id,
  };
}

function mapWorkspace(row: WorkspaceRow | undefined): Workspace {
  if (!row) {
    throw new Error("Expected workspace row.");
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    updatedAt: row.updated_at,
  };
}

function mapWorkspaceMember(row: WorkspaceMemberRow | undefined): WorkspaceMember {
  if (!row) {
    throw new Error("Expected workspace member row.");
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

function mapRole(row: RoleRow | undefined): Role {
  if (!row) {
    throw new Error("Expected role row.");
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    isDefault: row.is_default,
    key: row.key,
    name: row.name,
    permissions: parsePermissionMask(row.permissions),
    position: row.position,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
  };
}

function mapAuditLogEntry(row: AuditLogRow | undefined): AuditLogEntry {
  if (!row) {
    throw new Error("Expected audit log row.");
  }

  return {
    actorId: row.actor_id,
    createdAt: row.created_at,
    event: row.event,
    id: row.id,
    ipHash: row.ip_hash,
    metadata: row.metadata,
    reason: row.reason,
    targetId: row.target_id,
    targetType: row.target_type,
    workspaceId: row.workspace_id,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
