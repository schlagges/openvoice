import { randomUUID } from "node:crypto";

import {
  DEFAULT_ROLE_DEFINITIONS,
  parsePermissionMask,
  serializePermissionMask,
  type ChannelType,
  type DefaultRoleKey,
  type MessageContentFormat,
} from "@openvoice/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { DuplicateEmailError } from "./errors.js";
import { getAuditIpHash } from "../modules/audit/context.js";
import type {
  AuditLogEntry,
  AuditMetadata,
  BanWorkspaceMemberInput,
  BanWorkspaceMemberResult,
  ChannelNodeRecord,
  CreateChannelInput,
  CreateMessageInput,
  CreateMessageResult,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInviteInput,
  CreateWorkspaceInviteResult,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  DisconnectVoiceMemberInput,
  DisconnectVoiceMemberResult,
  KickWorkspaceMemberInput,
  KickWorkspaceMemberResult,
  ListAuditLogInput,
  ListMessagesInput,
  MessageRecord,
  MoveVoiceMemberInput,
  MoveVoiceMemberResult,
  PermissionOverrideRecord,
  PermissionOverrideTargetType,
  ReorderChannelInput,
  RedeemWorkspaceInviteInput,
  RedeemWorkspaceInviteResult,
  Role,
  SetVoiceModerationInput,
  Session,
  SoftDeleteMessageInput,
  TimeoutWorkspaceMemberInput,
  UnbanWorkspaceMemberInput,
  UpdateMessageInput,
  UpdateVoiceSelfStateInput,
  UpsertPermissionOverrideInput,
  UpsertVoiceStateInput,
  User,
  VoiceStateRecord,
  Workspace,
  WorkspaceAccessContext,
  WorkspaceBanRecord,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceWithMemberCount,
  WorkspaceTimeoutRecord,
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
        `INSERT INTO users (id, email, email_normalized, display_name, password_hash, kind, keycloak_subject, created_from_invite_id, linked_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
         RETURNING *`,
        [
          randomUUID(),
          input.email,
          input.emailNormalized,
          input.displayName,
          input.passwordHash,
          input.kind ?? "registered",
          input.keycloakSubject ?? null,
          input.createdFromInviteId ?? null,
          input.linkedAt ?? null,
        ],
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

  public async findUserByKeycloakSubject(keycloakSubject: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE keycloak_subject = $1",
      [keycloakSubject],
    );

    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  public async linkUserToKeycloakSubject(
    userId: string,
    keycloakSubject: string,
    linkedAt: Date,
  ): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users
       SET keycloak_subject = $2,
           linked_at = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [userId, keycloakSubject, linkedAt],
    );

    return mapUser(result.rows[0]);
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

  public async createWorkspaceInvite(
    input: CreateWorkspaceInviteInput,
  ): Promise<CreateWorkspaceInviteResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const inviteResult = await client.query<WorkspaceInviteRow>(
        `INSERT INTO invites (id, workspace_id, code_hash, created_by, expires_at, revoked_at, used_count, created_at)
         VALUES ($1, $2, $3, $4, $5, null, 0, now())
         RETURNING *`,
        [randomUUID(), input.workspaceId, input.codeHash, input.actorId, input.expiresAt],
      );
      const invite = mapWorkspaceInvite(inviteResult.rows[0]);
      const auditLogEntry = await insertAuditLog(client, {
        actorId: input.actorId,
        event: "INVITE_CREATE",
        metadata: { expiresAt: invite.expiresAt.toISOString() },
        targetId: invite.id,
        targetType: "invite",
        workspaceId: input.workspaceId,
      });
      await client.query("COMMIT");

      return { auditLogEntry, invite };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async redeemWorkspaceInvite(
    input: RedeemWorkspaceInviteInput,
  ): Promise<RedeemWorkspaceInviteResult | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const inviteResult = await client.query<WorkspaceInviteRow>(
        `SELECT *
         FROM invites
         WHERE code_hash = $1
           AND revoked_at IS NULL
           AND expires_at > $2
         FOR UPDATE`,
        [input.codeHash, input.now],
      );
      const invite = inviteResult.rows[0] ? mapWorkspaceInvite(inviteResult.rows[0]) : null;
      if (!invite) {
        await client.query("ROLLBACK");
        return null;
      }

      const workspaceResult = await client.query<WorkspaceRow>(
        "SELECT * FROM workspaces WHERE id = $1",
        [invite.workspaceId],
      );
      const workspace = workspaceResult.rows[0] ? mapWorkspace(workspaceResult.rows[0]) : null;
      if (!workspace) {
        await client.query("ROLLBACK");
        return null;
      }

      const existingMemberResult = await client.query<WorkspaceMemberRow>(
        "SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [invite.workspaceId, input.actorId],
      );
      if (existingMemberResult.rows[0]) {
        await client.query("COMMIT");
        return {
          auditLogEntries: [],
          alreadyMember: true,
          member: mapWorkspaceMember(existingMemberResult.rows[0]),
          role: null,
          workspace,
        };
      }

      const memberResult = await client.query<WorkspaceMemberRow>(
        `INSERT INTO workspace_members (id, workspace_id, user_id, created_at)
         VALUES ($1, $2, $3, now())
         RETURNING *`,
        [randomUUID(), invite.workspaceId, input.actorId],
      );
      const member = mapWorkspaceMember(memberResult.rows[0]);
      const roleResult = await client.query<RoleRow>(
        "SELECT * FROM roles WHERE workspace_id = $1 AND key = $2",
        [invite.workspaceId, input.roleKey ?? "member"],
      );
      const role = roleResult.rows[0] ? mapRole(roleResult.rows[0]) : null;
      if (role) {
        await client.query(
          `INSERT INTO member_roles (workspace_member_id, role_id, created_at)
           VALUES ($1, $2, now())`,
          [member.id, role.id],
        );
      }

      await client.query("UPDATE invites SET used_count = used_count + 1 WHERE id = $1", [
        invite.id,
      ]);

      const auditLogEntries = [
        await insertAuditLog(client, {
          actorId: input.actorId,
          event: "MEMBER_JOIN",
          metadata: { inviteId: invite.id },
          targetId: member.id,
          targetType: "workspace_member",
          workspaceId: invite.workspaceId,
        }),
        ...(role
          ? [
              await insertAuditLog(client, {
                actorId: input.actorId,
                event: "MEMBER_ROLE_ASSIGN",
                metadata: { roleKey: role.key },
                targetId: member.id,
                targetType: "workspace_member",
                workspaceId: invite.workspaceId,
              }),
            ]
          : []),
        ...(input.joinKind === "guest"
          ? [
              await insertAuditLog(client, {
                actorId: input.actorId,
                event: "GUEST_JOIN",
                metadata: { inviteId: invite.id },
                targetId: member.id,
                targetType: "workspace_member",
                workspaceId: invite.workspaceId,
              }),
            ]
          : []),
      ];

      await client.query("COMMIT");

      return {
        auditLogEntries,
        alreadyMember: false,
        member,
        role,
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

  public async findWorkspaceByNameNormalized(nameNormalized: string): Promise<Workspace | null> {
    const result = await this.pool.query<WorkspaceRow>(
      "SELECT * FROM workspaces WHERE lower(trim(name)) = $1 LIMIT 1",
      [nameNormalized],
    );

    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
  }

  public async findActiveWorkspaceBan(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceBanRecord | null> {
    const result = await this.pool.query<WorkspaceBanRow>(
      `SELECT *
       FROM bans
       WHERE workspace_id = $1
         AND user_id = $2
         AND revoked_at IS NULL`,
      [workspaceId, userId],
    );

    return result.rows[0] ? mapWorkspaceBan(result.rows[0]) : null;
  }

  public async findActiveWorkspaceInvite(
    codeHash: string,
    now: Date,
  ): Promise<WorkspaceInvite | null> {
    const result = await this.pool.query<WorkspaceInviteRow>(
      `SELECT *
       FROM invites
       WHERE code_hash = $1
         AND revoked_at IS NULL
         AND expires_at > $2`,
      [codeHash, now],
    );

    return result.rows[0] ? mapWorkspaceInvite(result.rows[0]) : null;
  }

  public async findActiveWorkspaceTimeout(
    workspaceId: string,
    userId: string,
    now: Date,
  ): Promise<WorkspaceTimeoutRecord | null> {
    const result = await this.pool.query<WorkspaceTimeoutRow>(
      `SELECT *
       FROM member_timeouts
       WHERE workspace_id = $1
         AND user_id = $2
         AND timed_out_until > $3`,
      [workspaceId, userId, now],
    );

    return result.rows[0] ? mapWorkspaceTimeout(result.rows[0]) : null;
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

  public async listAuditLog(input: ListAuditLogInput): Promise<readonly AuditLogEntry[]> {
    const result = await this.pool.query<AuditLogRow>(
      `SELECT *
       FROM audit_log
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [input.workspaceId, input.limit],
    );

    return result.rows.map(mapAuditLogEntry);
  }

  public async listWorkspacesForUser(userId: string): Promise<readonly WorkspaceWithMemberCount[]> {
    const result = await this.pool.query<WorkspaceRow & { readonly member_count: string }>(
      `SELECT w.*, count(all_members.id) AS member_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       LEFT JOIN workspace_members all_members ON all_members.workspace_id = w.id
       WHERE wm.user_id = $1
       GROUP BY w.id
       ORDER BY w.created_at ASC`,
      [userId],
    );

    return result.rows.map((row) => ({
      ...mapWorkspace(row),
      memberCount: Number(row.member_count),
    }));
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

  public async createMessage(input: CreateMessageInput): Promise<CreateMessageResult> {
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO messages (
         id, workspace_id, channel_id, author_id, client_message_id, content,
         content_format, edited_at, deleted_at, deleted_by, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, null, null, null, now(), now())
       ON CONFLICT (channel_id, author_id, client_message_id)
       DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.workspaceId,
        input.channelId,
        input.authorId,
        input.clientMessageId,
        input.content,
        input.contentFormat,
      ],
    );

    if (result.rows[0]) {
      return {
        created: true,
        message: mapMessage(result.rows[0]),
      };
    }

    const existing = await this.pool.query<MessageRow>(
      `SELECT *
       FROM messages
       WHERE channel_id = $1
         AND author_id = $2
         AND client_message_id = $3`,
      [input.channelId, input.authorId, input.clientMessageId],
    );

    return {
      created: false,
      message: mapMessage(existing.rows[0]),
    };
  }

  public async findMessageById(messageId: string): Promise<MessageRecord | null> {
    const result = await this.pool.query<MessageRow>("SELECT * FROM messages WHERE id = $1", [
      messageId,
    ]);

    return result.rows[0] ? mapMessage(result.rows[0]) : null;
  }

  public async listMessages(input: ListMessagesInput): Promise<readonly MessageRecord[]> {
    const cursorClause = input.before
      ? "AND (created_at, id) < ($3, $4)"
      : input.after
        ? "AND (created_at, id) > ($3, $4)"
        : "";
    const params: Array<Date | number | string> = [input.channelId, input.limit];

    if (input.before) {
      params.push(input.before.createdAt, input.before.id);
    } else if (input.after) {
      params.push(input.after.createdAt, input.after.id);
    }

    const result = await this.pool.query<MessageRow>(
      `SELECT *
       FROM messages
       WHERE channel_id = $1
       ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      params,
    );

    return result.rows.map(mapMessage);
  }

  public async updateMessage(input: UpdateMessageInput): Promise<MessageRecord> {
    const result = await this.pool.query<MessageRow>(
      `UPDATE messages
       SET content = $2,
           content_format = $3,
           edited_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [input.messageId, input.content, input.contentFormat],
    );

    return mapMessage(result.rows[0]);
  }

  public async softDeleteMessage(input: SoftDeleteMessageInput): Promise<MessageRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<MessageRow>(
        `UPDATE messages
         SET deleted_at = COALESCE(deleted_at, now()),
             deleted_by = COALESCE(deleted_by, $2),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [input.messageId, input.deletedBy],
      );
      const message = mapMessage(result.rows[0]);

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "MESSAGE_DELETE",
        metadata: { channelId: message.channelId },
        targetId: message.id,
        targetType: "message",
        workspaceId: message.workspaceId,
      });

      await client.query("COMMIT");
      return message;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async kickWorkspaceMember(
    input: KickWorkspaceMemberInput,
  ): Promise<KickWorkspaceMemberResult | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const memberResult = await client.query<WorkspaceMemberRow>(
        `DELETE FROM workspace_members
         WHERE workspace_id = $1
           AND user_id = $2
         RETURNING *`,
        [input.workspaceId, input.targetUserId],
      );
      if (!memberResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }

      const voiceState = await deleteVoiceStateWithClient(
        client,
        input.workspaceId,
        input.targetUserId,
      );
      const member = mapWorkspaceMember(memberResult.rows[0]);
      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "MEMBER_KICK",
        metadata: {},
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return { member, voiceState };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async banWorkspaceMember(
    input: BanWorkspaceMemberInput,
  ): Promise<BanWorkspaceMemberResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingBanResult = await client.query<WorkspaceBanRow>(
        `SELECT *
         FROM bans
         WHERE workspace_id = $1
           AND user_id = $2
           AND revoked_at IS NULL
         FOR UPDATE`,
        [input.workspaceId, input.targetUserId],
      );
      let ban = existingBanResult.rows[0] ? mapWorkspaceBan(existingBanResult.rows[0]) : null;
      if (!ban) {
        const banResult = await client.query<WorkspaceBanRow>(
          `INSERT INTO bans (id, workspace_id, user_id, banned_by, reason, revoked_at, revoked_by, created_at)
           VALUES ($1, $2, $3, $4, $5, null, null, now())
           RETURNING *`,
          [
            randomUUID(),
            input.workspaceId,
            input.targetUserId,
            input.actorId,
            input.reason ?? null,
          ],
        );
        ban = mapWorkspaceBan(banResult.rows[0]);
      }

      const memberResult = await client.query<WorkspaceMemberRow>(
        `DELETE FROM workspace_members
         WHERE workspace_id = $1
           AND user_id = $2
         RETURNING *`,
        [input.workspaceId, input.targetUserId],
      );
      const voiceState = await deleteVoiceStateWithClient(
        client,
        input.workspaceId,
        input.targetUserId,
      );

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "MEMBER_BAN",
        metadata: { alreadyBanned: existingBanResult.rows[0] !== undefined },
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return {
        ban,
        member: memberResult.rows[0] ? mapWorkspaceMember(memberResult.rows[0]) : null,
        voiceState,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async unbanWorkspaceMember(
    input: UnbanWorkspaceMemberInput,
  ): Promise<WorkspaceBanRecord | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<WorkspaceBanRow>(
        `UPDATE bans
         SET revoked_at = now(),
             revoked_by = $3
         WHERE workspace_id = $1
           AND user_id = $2
           AND revoked_at IS NULL
         RETURNING *`,
        [input.workspaceId, input.targetUserId, input.actorId],
      );
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }

      const ban = mapWorkspaceBan(result.rows[0]);
      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "MEMBER_UNBAN",
        metadata: {},
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return ban;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async timeoutWorkspaceMember(
    input: TimeoutWorkspaceMemberInput,
  ): Promise<WorkspaceTimeoutRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<WorkspaceTimeoutRow>(
        `INSERT INTO member_timeouts (
           workspace_id, user_id, timed_out_until, created_by, reason, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, now(), now())
         ON CONFLICT (workspace_id, user_id)
         DO UPDATE SET timed_out_until = EXCLUDED.timed_out_until,
                       created_by = EXCLUDED.created_by,
                       reason = EXCLUDED.reason,
                       updated_at = now()
         RETURNING *`,
        [
          input.workspaceId,
          input.targetUserId,
          input.timedOutUntil,
          input.actorId,
          input.reason ?? null,
        ],
      );
      const timeout = mapWorkspaceTimeout(result.rows[0]);
      await client.query(
        `UPDATE voice_states
         SET speaking = false,
             updated_at = now()
         WHERE workspace_id = $1
           AND user_id = $2`,
        [input.workspaceId, input.targetUserId],
      );
      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "MEMBER_TIMEOUT",
        metadata: { timedOutUntil: input.timedOutUntil.toISOString() },
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return timeout;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async upsertVoiceState(input: UpsertVoiceStateInput): Promise<VoiceStateRecord> {
    const result = await this.pool.query<VoiceStateRow>(
      `INSERT INTO voice_states (
         workspace_id, channel_id, user_id, session_id, self_muted, self_deafened,
         server_muted, server_deafened, speaking, camera_enabled, screen_share_enabled,
         audio_mode, connected_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, false, false, false, false, false, $7, now(), now())
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET channel_id = EXCLUDED.channel_id,
                     session_id = EXCLUDED.session_id,
                     self_muted = EXCLUDED.self_muted,
                     self_deafened = EXCLUDED.self_deafened,
                     speaking = false,
                     camera_enabled = false,
                     camera_quality = '720p',
                     screen_share_enabled = false,
                     screen_share_quality = '1080p',
                     screen_share_content_mode = 'detail',
                     audio_mode = EXCLUDED.audio_mode,
                     updated_at = now()
       RETURNING *`,
      [
        input.workspaceId,
        input.channelId,
        input.userId,
        input.sessionId,
        input.selfMuted,
        input.selfDeafened,
        input.audioMode,
      ],
    );

    return mapVoiceState(result.rows[0]);
  }

  public async findVoiceState(
    workspaceId: string,
    userId: string,
  ): Promise<VoiceStateRecord | null> {
    const result = await this.pool.query<VoiceStateRow>(
      "SELECT * FROM voice_states WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );

    return result.rows[0] ? mapVoiceState(result.rows[0]) : null;
  }

  public async findVoiceStateByUserId(userId: string): Promise<VoiceStateRecord | null> {
    const result = await this.pool.query<VoiceStateRow>(
      "SELECT * FROM voice_states WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
      [userId],
    );
    return result.rows[0] ? mapVoiceState(result.rows[0]) : null;
  }

  public async listVoiceStatesForChannel(channelId: string): Promise<readonly VoiceStateRecord[]> {
    const result = await this.pool.query<VoiceStateRow>(
      `SELECT *
       FROM voice_states
       WHERE channel_id = $1
       ORDER BY connected_at ASC`,
      [channelId],
    );

    return result.rows.map(mapVoiceState);
  }

  public async updateVoiceSelfState(
    input: UpdateVoiceSelfStateInput,
  ): Promise<VoiceStateRecord | null> {
    const existing = await this.findVoiceState(input.workspaceId, input.userId);
    if (!existing) {
      return null;
    }

    const selfDeafened = input.selfDeafened ?? existing.selfDeafened;
    const selfMuted = selfDeafened ? true : (input.selfMuted ?? existing.selfMuted);
    const speaking =
      input.speaking !== undefined
        ? input.speaking && !existing.serverMuted && !existing.serverDeafened && !selfDeafened
        : existing.speaking && !existing.serverMuted && !existing.serverDeafened && !selfDeafened;
    const result = await this.pool.query<VoiceStateRow>(
      `UPDATE voice_states
       SET self_muted = $3,
           self_deafened = $4,
           speaking = $5,
           audio_mode = $6,
           camera_enabled = $7,
           camera_quality = $8,
           screen_share_enabled = $9,
           screen_share_quality = $10,
           screen_share_content_mode = $11,
           updated_at = now()
       WHERE workspace_id = $1
         AND user_id = $2
       RETURNING *`,
      [
        input.workspaceId,
        input.userId,
        selfMuted,
        selfDeafened,
        speaking,
        input.audioMode ?? existing.audioMode,
        input.cameraEnabled ?? existing.cameraEnabled,
        input.cameraQuality ?? existing.cameraQuality,
        input.screenShareEnabled ?? existing.screenShareEnabled,
        input.screenShareQuality ?? existing.screenShareQuality,
        input.screenShareContentMode ?? existing.screenShareContentMode,
      ],
    );

    return result.rows[0] ? mapVoiceState(result.rows[0]) : null;
  }

  public async setVoiceModerationState(
    input: SetVoiceModerationInput,
  ): Promise<VoiceStateRecord | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult = await client.query<VoiceStateRow>(
        "SELECT * FROM voice_states WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE",
        [input.workspaceId, input.targetUserId],
      );
      const existing = existingResult.rows[0] ? mapVoiceState(existingResult.rows[0]) : null;
      if (!existing) {
        await client.query("COMMIT");
        return null;
      }

      const serverMuted = input.serverMuted ?? existing.serverMuted;
      const serverDeafened = input.serverDeafened ?? existing.serverDeafened;
      const result = await client.query<VoiceStateRow>(
        `UPDATE voice_states
         SET server_muted = $3,
             server_deafened = $4,
             speaking = CASE WHEN $3 OR $4 THEN false ELSE speaking END,
             updated_at = now()
         WHERE workspace_id = $1
           AND user_id = $2
         RETURNING *`,
        [input.workspaceId, input.targetUserId, serverMuted, serverDeafened],
      );
      const state = mapVoiceState(result.rows[0]);

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: input.serverMuted !== undefined ? "VOICE_SERVER_MUTE" : "VOICE_SERVER_DEAFEN",
        metadata: {
          channelId: state.channelId,
          serverDeafened: state.serverDeafened,
          serverMuted: state.serverMuted,
        },
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return state;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async moveVoiceMember(input: MoveVoiceMemberInput): Promise<MoveVoiceMemberResult | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult = await client.query<VoiceStateRow>(
        "SELECT * FROM voice_states WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE",
        [input.workspaceId, input.targetUserId],
      );
      const existing = existingResult.rows[0] ? mapVoiceState(existingResult.rows[0]) : null;
      if (!existing) {
        await client.query("COMMIT");
        return null;
      }

      const result = await client.query<VoiceStateRow>(
        `UPDATE voice_states
         SET channel_id = $3,
             speaking = false,
             updated_at = now()
         WHERE workspace_id = $1
           AND user_id = $2
         RETURNING *`,
        [input.workspaceId, input.targetUserId, input.targetChannelId],
      );
      const state = mapVoiceState(result.rows[0]);
      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "VOICE_MOVE",
        metadata: {
          fromChannelId: existing.channelId,
          toChannelId: input.targetChannelId,
        },
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return { previousChannelId: existing.channelId, state };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async disconnectVoiceMember(
    input: DisconnectVoiceMemberInput,
  ): Promise<DisconnectVoiceMemberResult | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const state = await deleteVoiceStateWithClient(client, input.workspaceId, input.targetUserId);
      if (!state) {
        await client.query("COMMIT");
        return null;
      }

      await insertAuditLog(client, {
        actorId: input.actorId,
        event: "VOICE_DISCONNECT",
        metadata: { channelId: state.channelId },
        reason: input.reason ?? null,
        targetId: input.targetUserId,
        targetType: "workspace_member",
        workspaceId: input.workspaceId,
      });

      await client.query("COMMIT");
      return { state };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async deleteVoiceState(
    workspaceId: string,
    userId: string,
  ): Promise<VoiceStateRecord | null> {
    return deleteVoiceStateWithClient(this.pool, workspaceId, userId);
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
       VALUES ($1, $2, $3, $4, $5, $6, null, $7, $8, now())
       RETURNING *`,
      [
        randomUUID(),
        entry.workspaceId,
        entry.actorId,
        entry.event,
        entry.targetType,
        entry.targetId,
        JSON.stringify(entry.metadata),
        getAuditIpHash(),
      ],
    );
    auditLogEntries.push(mapAuditLogEntry(result.rows[0]));
  }

  return auditLogEntries;
}

interface UserRow extends QueryResultRow {
  readonly created_at: Date;
  readonly created_from_invite_id: string | null;
  readonly display_name: string;
  readonly email: string;
  readonly email_normalized: string;
  readonly id: string;
  readonly keycloak_subject: string | null;
  readonly kind: User["kind"];
  readonly linked_at: Date | null;
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

interface WorkspaceInviteRow extends QueryResultRow {
  readonly code_hash: string;
  readonly created_at: Date;
  readonly created_by: string;
  readonly expires_at: Date;
  readonly id: string;
  readonly revoked_at: Date | null;
  readonly used_count: number;
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

interface MessageRow extends QueryResultRow {
  readonly author_id: string;
  readonly channel_id: string;
  readonly client_message_id: string;
  readonly content: string;
  readonly content_format: MessageContentFormat;
  readonly created_at: Date;
  readonly deleted_at: Date | null;
  readonly deleted_by: string | null;
  readonly edited_at: Date | null;
  readonly id: string;
  readonly updated_at: Date;
  readonly workspace_id: string;
}

interface VoiceStateRow extends QueryResultRow {
  readonly audio_mode: VoiceStateRecord["audioMode"];
  readonly camera_enabled: boolean;
  readonly camera_quality: VoiceStateRecord["cameraQuality"];
  readonly channel_id: string;
  readonly connected_at: Date;
  readonly screen_share_content_mode: VoiceStateRecord["screenShareContentMode"];
  readonly screen_share_enabled: boolean;
  readonly screen_share_quality: VoiceStateRecord["screenShareQuality"];
  readonly self_deafened: boolean;
  readonly self_muted: boolean;
  readonly server_deafened: boolean;
  readonly server_muted: boolean;
  readonly session_id: string;
  readonly speaking: boolean;
  readonly updated_at: Date;
  readonly user_id: string;
  readonly workspace_id: string;
}

interface WorkspaceBanRow extends QueryResultRow {
  readonly banned_by: string;
  readonly created_at: Date;
  readonly id: string;
  readonly reason: string | null;
  readonly revoked_at: Date | null;
  readonly revoked_by: string | null;
  readonly user_id: string;
  readonly workspace_id: string;
}

interface WorkspaceTimeoutRow extends QueryResultRow {
  readonly created_at: Date;
  readonly created_by: string;
  readonly reason: string | null;
  readonly timed_out_until: Date;
  readonly updated_at: Date;
  readonly user_id: string;
  readonly workspace_id: string;
}

interface InsertAuditLogInput {
  readonly actorId: string | null;
  readonly event: string;
  readonly metadata: AuditMetadata;
  readonly reason?: string | null;
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     RETURNING *`,
    [
      randomUUID(),
      input.workspaceId,
      input.actorId,
      input.event,
      input.targetType,
      input.targetId,
      input.reason ?? null,
      JSON.stringify(input.metadata),
      getAuditIpHash(),
    ],
  );

  return mapAuditLogEntry(result.rows[0]);
}

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{
    rows: T[];
  }>;
}

async function deleteVoiceStateWithClient(
  queryable: Queryable,
  workspaceId: string,
  userId: string,
): Promise<VoiceStateRecord | null> {
  const result = await queryable.query<VoiceStateRow>(
    `DELETE FROM voice_states
     WHERE workspace_id = $1
       AND user_id = $2
     RETURNING *`,
    [workspaceId, userId],
  );

  return result.rows[0] ? mapVoiceState(result.rows[0]) : null;
}

function mapUser(row: UserRow | undefined): User {
  if (!row) {
    throw new Error("Expected user row.");
  }

  return {
    createdAt: row.created_at,
    createdFromInviteId: row.created_from_invite_id ?? null,
    displayName: row.display_name,
    email: row.email,
    emailNormalized: row.email_normalized,
    id: row.id,
    keycloakSubject: row.keycloak_subject ?? null,
    kind: row.kind ?? "registered",
    linkedAt: row.linked_at ?? null,
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

function mapWorkspaceInvite(row: WorkspaceInviteRow | undefined): WorkspaceInvite {
  if (!row) {
    throw new Error("Expected workspace invite row.");
  }

  return {
    codeHash: row.code_hash,
    createdAt: row.created_at,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    id: row.id,
    revokedAt: row.revoked_at,
    usedCount: row.used_count,
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

function mapWorkspaceBan(row: WorkspaceBanRow | undefined): WorkspaceBanRecord {
  if (!row) {
    throw new Error("Expected workspace ban row.");
  }

  return {
    bannedBy: row.banned_by,
    createdAt: row.created_at,
    id: row.id,
    reason: row.reason,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

function mapWorkspaceTimeout(row: WorkspaceTimeoutRow | undefined): WorkspaceTimeoutRecord {
  if (!row) {
    throw new Error("Expected workspace timeout row.");
  }

  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    reason: row.reason,
    timedOutUntil: row.timed_out_until,
    updatedAt: row.updated_at,
    userId: row.user_id,
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

function mapMessage(row: MessageRow | undefined): MessageRecord {
  if (!row) {
    throw new Error("Expected message row.");
  }

  return {
    authorId: row.author_id,
    channelId: row.channel_id,
    clientMessageId: row.client_message_id,
    content: row.content,
    contentFormat: row.content_format,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    editedAt: row.edited_at,
    id: row.id,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
  };
}

function mapVoiceState(row: VoiceStateRow | undefined): VoiceStateRecord {
  if (!row) {
    throw new Error("Expected voice state row.");
  }

  return {
    audioMode: row.audio_mode,
    cameraEnabled: row.camera_enabled,
    cameraQuality: row.camera_quality,
    channelId: row.channel_id,
    connectedAt: row.connected_at,
    screenShareContentMode: row.screen_share_content_mode,
    screenShareEnabled: row.screen_share_enabled,
    screenShareQuality: row.screen_share_quality,
    selfDeafened: row.self_deafened,
    selfMuted: row.self_muted,
    serverDeafened: row.server_deafened,
    serverMuted: row.server_muted,
    sessionId: row.session_id,
    speaking: row.speaking,
    updatedAt: row.updated_at,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
