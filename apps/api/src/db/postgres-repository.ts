import { randomUUID } from "node:crypto";

import {
  DEFAULT_ROLE_DEFINITIONS,
  parsePermissionMask,
  serializePermissionMask,
  type DefaultRoleKey,
  type ChannelType,
} from "@openvoice/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { DuplicateEmailError } from "./errors.js";
import type {
  AuditLogEntry,
  AuditMetadata,
  ChannelNodeRecord,
  CreateChannelInput,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  ReorderChannelInput,
  Role,
  Session,
  UpsertPermissionOverrideInput,
  User,
  Workspace,
  WorkspaceAccessContext,
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

  public async findWorkspaceAccessContext(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceAccessContext | null> {
    const accessResult = await this.pool.query<WorkspaceAccessRow>(
      `SELECT
         w.id AS workspace_id,
         w.name AS workspace_name,
         w.owner_id,
         w.created_at AS workspace_created_at,
         w.updated_at AS workspace_updated_at,
         wm.id AS member_id,
         wm.user_id AS member_user_id,
         wm.workspace_id AS member_workspace_id,
         wm.created_at AS member_created_at
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1
         AND wm.user_id = $2`,
      [workspaceId, userId],
    );

    const row = accessResult.rows[0];
    if (!row) {
      return null;
    }

    const rolesResult = await this.pool.query<RoleRow>(
      `SELECT r.*
       FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       WHERE mr.workspace_member_id = $1
       ORDER BY r.position ASC`,
      [row.member_id],
    );

    return {
      member: {
        createdAt: row.member_created_at,
        id: row.member_id,
        userId: row.member_user_id,
        workspaceId: row.member_workspace_id,
      },
      roles: rolesResult.rows.map(mapRole),
      workspace: {
        createdAt: row.workspace_created_at,
        id: row.workspace_id,
        name: row.workspace_name,
        ownerId: row.owner_id,
        updatedAt: row.workspace_updated_at,
      },
    };
  }

  public async findWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    const result = await this.pool.query<WorkspaceMemberRow>(
      "SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );

    return result.rows[0] ? mapWorkspaceMember(result.rows[0]) : null;
  }

  public async findRoleById(roleId: string): Promise<Role | null> {
    const result = await this.pool.query<RoleRow>("SELECT * FROM roles WHERE id = $1", [roleId]);

    return result.rows[0] ? mapRole(result.rows[0]) : null;
  }

  public async createChannel(input: CreateChannelInput): Promise<ChannelNodeRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<ChannelNodeRow>(
        `INSERT INTO channel_nodes (
           id, workspace_id, parent_id, type, name, slug, position, depth, path,
           inherits_permissions, settings, created_at, updated_at, deleted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, '{}', now(), now(), null)
         RETURNING *`,
        [
          input.id,
          input.workspaceId,
          input.parentId,
          input.type,
          input.name,
          input.slug,
          input.position,
          input.depth,
          input.path,
        ],
      );
      const channel = mapChannelNode(result.rows[0]);

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "CHANNEL_CREATE",
        metadata: { channelName: input.name, type: input.type },
        targetId: channel.id,
        targetType: "channel",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return channel;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findChannelById(channelId: string): Promise<ChannelNodeRecord | null> {
    const result = await this.pool.query<ChannelNodeRow>(
      "SELECT * FROM channel_nodes WHERE id = $1 AND deleted_at IS NULL",
      [channelId],
    );

    return result.rows[0] ? mapChannelNode(result.rows[0]) : null;
  }

  public async listChannels(workspaceId: string): Promise<readonly ChannelNodeRecord[]> {
    const result = await this.pool.query<ChannelNodeRow>(
      `SELECT *
       FROM channel_nodes
       WHERE workspace_id = $1
         AND deleted_at IS NULL
       ORDER BY depth ASC, position ASC, name ASC`,
      [workspaceId],
    );

    return result.rows.map(mapChannelNode);
  }

  public async reorderChannels(input: ReorderChannelInput): Promise<readonly ChannelNodeRecord[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const updated: ChannelNodeRecord[] = [];
      for (const move of input.moves) {
        const result = await client.query<ChannelNodeRow>(
          `UPDATE channel_nodes
           SET parent_id = $3,
               position = $4,
               depth = $5,
               path = $6,
               updated_at = now()
           WHERE workspace_id = $1
             AND id = $2
             AND deleted_at IS NULL
           RETURNING *`,
          [input.workspaceId, move.channelId, move.parentId, move.position, move.depth, move.path],
        );

        if (result.rows[0]) {
          updated.push(mapChannelNode(result.rows[0]));
        }
      }

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "CHANNEL_MOVE",
        metadata: { movedCount: input.moves.length },
        targetId: null,
        targetType: "channel",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async listPermissionOverrides(
    channelId: string,
  ): Promise<readonly PermissionOverrideRecord[]> {
    const result = await this.pool.query<PermissionOverrideRow>(
      `SELECT *
       FROM permission_overrides
       WHERE channel_id = $1
       ORDER BY target_type ASC, target_id ASC`,
      [channelId],
    );

    return result.rows.map(mapPermissionOverride);
  }

  public async listPermissionOverridesForChannels(
    channelIds: readonly string[],
  ): Promise<readonly PermissionOverrideRecord[]> {
    if (channelIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<PermissionOverrideRow>(
      `SELECT *
       FROM permission_overrides
       WHERE channel_id = ANY($1::uuid[])`,
      [channelIds],
    );

    return result.rows.map(mapPermissionOverride);
  }

  public async upsertPermissionOverride(
    input: UpsertPermissionOverrideInput,
  ): Promise<PermissionOverrideRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const channelResult = await client.query<ChannelNodeRow>(
        "SELECT * FROM channel_nodes WHERE id = $1 AND deleted_at IS NULL",
        [input.channelId],
      );
      const channel = mapChannelNode(channelResult.rows[0]);
      const existingResult = await client.query<PermissionOverrideRow>(
        `SELECT *
         FROM permission_overrides
         WHERE channel_id = $1
           AND target_type = $2
           AND target_id = $3`,
        [input.channelId, input.targetType, input.targetId],
      );
      const event =
        existingResult.rowCount && existingResult.rowCount > 0
          ? "PERMISSION_OVERRIDE_UPDATE"
          : "PERMISSION_OVERRIDE_CREATE";
      const result = await client.query<PermissionOverrideRow>(
        `INSERT INTO permission_overrides (
           id, channel_id, target_type, target_id, allow, deny, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())
         ON CONFLICT (channel_id, target_type, target_id)
         DO UPDATE SET allow = EXCLUDED.allow,
                       deny = EXCLUDED.deny,
                       updated_at = now()
         RETURNING *`,
        [
          randomUUID(),
          input.channelId,
          input.targetType,
          input.targetId,
          serializePermissionMask(input.allow),
          serializePermissionMask(input.deny),
        ],
      );

      await insertAuditLog(client, {
        actorId: input.actorId,
        event,
        metadata: {
          allow: serializePermissionMask(input.allow),
          deny: serializePermissionMask(input.deny),
          targetId: input.targetId,
          targetType: input.targetType,
        },
        targetId: input.channelId,
        targetType: "permission_override",
        workspaceId: channel.workspaceId,
      });

      await client.query("COMMIT");
      return mapPermissionOverride(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async deletePermissionOverride(
    channelId: string,
    targetType: PermissionOverrideTargetType,
    targetId: string,
    actorId: string,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const channelResult = await client.query<ChannelNodeRow>(
        "SELECT * FROM channel_nodes WHERE id = $1 AND deleted_at IS NULL",
        [channelId],
      );
      const channel = mapChannelNode(channelResult.rows[0]);
      const deleteResult = await client.query<PermissionOverrideRow>(
        `DELETE FROM permission_overrides
         WHERE channel_id = $1
           AND target_type = $2
           AND target_id = $3
         RETURNING *`,
        [channelId, targetType, targetId],
      );

      if (deleteResult.rowCount && deleteResult.rowCount > 0) {
        await insertAuditLog(client, {
          actorId,
          event: "PERMISSION_OVERRIDE_DELETE",
          metadata: { targetId, targetType },
          targetId: channelId,
          targetType: "permission_override",
          workspaceId: channel.workspaceId,
        });
      }

      await client.query("COMMIT");
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

interface WorkspaceAccessRow extends QueryResultRow {
  readonly member_created_at: Date;
  readonly member_id: string;
  readonly member_user_id: string;
  readonly member_workspace_id: string;
  readonly owner_id: string;
  readonly workspace_created_at: Date;
  readonly workspace_id: string;
  readonly workspace_name: string;
  readonly workspace_updated_at: Date;
}

interface ChannelNodeRow extends QueryResultRow {
  readonly created_at: Date;
  readonly deleted_at: Date | null;
  readonly depth: number;
  readonly id: string;
  readonly inherits_permissions: boolean;
  readonly name: string;
  readonly parent_id: string | null;
  readonly path: string;
  readonly position: number;
  readonly settings: Record<string, never>;
  readonly slug: string;
  readonly type: ChannelType;
  readonly updated_at: Date;
  readonly workspace_id: string;
}

interface PermissionOverrideRow extends QueryResultRow {
  readonly allow: string;
  readonly channel_id: string;
  readonly created_at: Date;
  readonly deny: string;
  readonly id: string;
  readonly target_id: string;
  readonly target_type: PermissionOverrideTargetType;
  readonly updated_at: Date;
}

interface InsertAuditLogInput {
  readonly actorId: string | null;
  readonly event: string;
  readonly metadata: AuditMetadata;
  readonly targetId: string | null;
  readonly targetType: string;
  readonly workspaceId: string;
}

async function insertAuditLog(
  client: PoolClient,
  input: InsertAuditLogInput,
): Promise<AuditLogEntry> {
  const result = await client.query<AuditLogRow>(
    `INSERT INTO audit_log (id, workspace_id, actor_id, event, target_type, target_id, reason, metadata, ip_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, null, $7, null, now())
     RETURNING *`,
    [
      randomUUID(),
      input.workspaceId,
      input.actorId,
      input.event,
      input.targetType,
      input.targetId,
      JSON.stringify(input.metadata),
    ],
  );

  return mapAuditLogEntry(result.rows[0]);
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

function mapChannelNode(row: ChannelNodeRow | undefined): ChannelNodeRecord {
  if (!row) {
    throw new Error("Expected channel node row.");
  }

  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    depth: row.depth,
    id: row.id,
    inheritsPermissions: row.inherits_permissions,
    name: row.name,
    parentId: row.parent_id,
    path: row.path,
    position: row.position,
    settings: row.settings,
    slug: row.slug,
    type: row.type,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
  };
}

function mapPermissionOverride(row: PermissionOverrideRow | undefined): PermissionOverrideRecord {
  if (!row) {
    throw new Error("Expected permission override row.");
  }

  return {
    allow: parsePermissionMask(row.allow),
    channelId: row.channel_id,
    createdAt: row.created_at,
    deny: parsePermissionMask(row.deny),
    id: row.id,
    targetId: row.target_id,
    targetType: row.target_type,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
