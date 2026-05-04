import { randomUUID } from "node:crypto";

import { DEFAULT_ROLE_DEFINITIONS, serializePermissionMask } from "@openvoice/shared";

import type { OpenVoiceRepository } from "./repository.js";
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
import { DuplicateEmailError } from "./errors.js";

export class InMemoryOpenVoiceRepository implements OpenVoiceRepository {
  public readonly auditLogEntries: AuditLogEntry[] = [];
  public readonly roles: Role[] = [];
  public readonly sessions: Session[] = [];
  public readonly users: User[] = [];
  public readonly workspaceMembers: WorkspaceMember[] = [];
  public readonly workspaces: Workspace[] = [];

  public async createUser(input: CreateUserInput): Promise<User> {
    if (this.users.some((user) => user.emailNormalized === input.emailNormalized)) {
      throw new DuplicateEmailError();
    }

    const now = new Date();
    const user: User = {
      createdAt: now,
      displayName: input.displayName,
      email: input.email,
      emailNormalized: input.emailNormalized,
      id: randomUUID(),
      passwordHash: input.passwordHash,
      updatedAt: now,
    };

    this.users.push(user);
    return user;
  }

  public async findUserByEmailNormalized(emailNormalized: string): Promise<User | null> {
    return this.users.find((user) => user.emailNormalized === emailNormalized) ?? null;
  }

  public async findUserById(userId: string): Promise<User | null> {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  public async createSession(input: CreateSessionInput): Promise<Session> {
    const session: Session = {
      createdAt: new Date(),
      csrfTokenHash: input.csrfTokenHash,
      expiresAt: input.expiresAt,
      id: randomUUID(),
      revokedAt: null,
      tokenHash: input.tokenHash,
      userId: input.userId,
    };

    this.sessions.push(session);
    return session;
  }

  public async findActiveSessionByTokenHash(tokenHash: string, now: Date): Promise<Session | null> {
    return (
      this.sessions.find(
        (session) =>
          session.tokenHash === tokenHash &&
          session.revokedAt === null &&
          session.expiresAt.getTime() > now.getTime(),
      ) ?? null
    );
  }

  public async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);

    if (session) {
      const index = this.sessions.indexOf(session);
      this.sessions[index] = {
        ...session,
        revokedAt,
      };
    }
  }

  public async createWorkspaceWithDefaults(
    input: CreateWorkspaceInput,
  ): Promise<CreateWorkspaceResult> {
    const now = new Date();
    const workspace: Workspace = {
      createdAt: now,
      id: randomUUID(),
      name: input.name,
      ownerId: input.ownerId,
      updatedAt: now,
    };
    const member: WorkspaceMember = {
      createdAt: now,
      id: randomUUID(),
      userId: input.ownerId,
      workspaceId: workspace.id,
    };
    const roles: Role[] = DEFAULT_ROLE_DEFINITIONS.map((definition) => ({
      createdAt: now,
      id: randomUUID(),
      isDefault: true,
      key: definition.key,
      name: definition.name,
      permissions: definition.permissions,
      position: definition.position,
      updatedAt: now,
      workspaceId: workspace.id,
    }));
    const ownerRole = roles.find((role) => role.key === "owner");

    if (!ownerRole) {
      throw new Error("Default owner role missing.");
    }

    const auditLogEntries: AuditLogEntry[] = [
      {
        actorId: input.ownerId,
        createdAt: now,
        event: "WORKSPACE_CREATE",
        id: randomUUID(),
        ipHash: null,
        metadata: { workspaceName: input.name },
        reason: null,
        targetId: workspace.id,
        targetType: "workspace",
        workspaceId: workspace.id,
      },
      ...roles.map<AuditLogEntry>((role) => ({
        actorId: input.ownerId,
        createdAt: now,
        event: "ROLE_CREATE",
        id: randomUUID(),
        ipHash: null,
        metadata: {
          defaultRole: true,
          key: role.key,
          permissions: serializePermissionMask(role.permissions),
        },
        reason: null,
        targetId: role.id,
        targetType: "role",
        workspaceId: workspace.id,
      })),
      {
        actorId: input.ownerId,
        createdAt: now,
        event: "MEMBER_ROLE_ASSIGN",
        id: randomUUID(),
        ipHash: null,
        metadata: { roleKey: ownerRole.key },
        reason: null,
        targetId: member.id,
        targetType: "workspace_member",
        workspaceId: workspace.id,
      },
    ];

    this.workspaces.push(workspace);
    this.workspaceMembers.push(member);
    this.roles.push(...roles);
    this.auditLogEntries.push(...auditLogEntries);

    return {
      auditLogEntries,
      member,
      roles,
      workspace,
    };
  }
}
