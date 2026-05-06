import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
import { WorkspaceService } from "../src/modules/workspaces/service.js";
import type { PasswordHasher } from "../src/security/password.js";

class TestPasswordHasher implements PasswordHasher {
  public readonly hashedPasswords: string[] = [];

  public async hashPassword(password: string): Promise<string> {
    const hash = `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
    this.hashedPasswords.push(hash);
    return hash;
  }

  public async verifyPassword(hash: string, password: string): Promise<boolean> {
    return hash === `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }
}

interface TestApp {
  readonly handler: (request: Request) => Promise<Response>;
  readonly passwordHasher: TestPasswordHasher;
  readonly repository: InMemoryOpenVoiceRepository;
}

describe("Phase 1 API", () => {
  it("registers a user, stores a hashed password, returns /me, and logs out with CSRF", async () => {
    const app = createTestApp();
    const registerResponse = await app.handler(
      jsonRequest("/api/v1/auth/register", {
        displayName: "Ada",
        email: "ADA@example.com",
        password: "very-secure-password",
      }),
    );
    const registerBody = (await registerResponse.json()) as { csrfToken: string; user: PublicUser };
    const cookie = registerResponse.headers.get("set-cookie");

    expect(registerResponse.status).toBe(201);
    expect(registerBody.user.email).toBe("ada@example.com");
    expect(registerBody.csrfToken).toBeTruthy();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(app.repository.users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(app.repository.users[0]?.passwordHash).not.toContain("very-secure-password");

    const meResponse = await app.handler(
      new Request("http://local.test/api/v1/me", { headers: { cookie: cookie ?? "" } }),
    );
    expect(meResponse.status).toBe(200);

    const logoutWithoutCsrf = await app.handler(
      new Request("http://local.test/api/v1/auth/logout", {
        headers: { cookie: cookie ?? "" },
        method: "POST",
      }),
    );
    expect(logoutWithoutCsrf.status).toBe(403);

    const logoutResponse = await app.handler(
      new Request("http://local.test/api/v1/auth/logout", {
        headers: { cookie: cookie ?? "", "x-openvoice-csrf-token": registerBody.csrfToken },
        method: "POST",
      }),
    );
    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await app.handler(
      new Request("http://local.test/api/v1/me", { headers: { cookie: cookie ?? "" } }),
    );
    expect(meAfterLogout.status).toBe(401);
  });

  it("logs in an existing user and rejects invalid credentials", async () => {
    const app = createTestApp();
    await app.handler(
      jsonRequest("/api/v1/auth/register", {
        email: "user@example.com",
        password: "very-secure-password",
      }),
    );

    const failedLogin = await app.handler(
      jsonRequest("/api/v1/auth/login", {
        email: "user@example.com",
        password: "wrong-password",
      }),
    );
    expect(failedLogin.status).toBe(401);

    const loginResponse = await app.handler(
      jsonRequest("/api/v1/auth/login", {
        email: "user@example.com",
        password: "very-secure-password",
      }),
    );
    const loginBody = (await loginResponse.json()) as { csrfToken: string; user: PublicUser };

    expect(loginResponse.status).toBe(200);
    expect(loginBody.user.email).toBe("user@example.com");
    expect(loginBody.csrfToken).toBeTruthy();
  });

  it("creates a workspace with owner membership, default roles, and audit log entries", async () => {
    const app = createTestApp();
    const registerResponse = await app.handler(
      jsonRequest("/api/v1/auth/register", {
        email: "owner@example.com",
        password: "very-secure-password",
      }),
    );
    const registerBody = (await registerResponse.json()) as { csrfToken: string; user: PublicUser };
    const cookie = registerResponse.headers.get("set-cookie") ?? "";

    const response = await app.handler(
      jsonRequest(
        "/api/v1/workspaces",
        { name: "OpenVoice Test" },
        {
          cookie,
          "x-openvoice-csrf-token": registerBody.csrfToken,
        },
      ),
    );
    const body = (await response.json()) as {
      auditLogEntriesCreated: number;
      defaultRoles: Array<{ key: string; permissions: string }>;
      ownerMemberId: string;
      workspace: { ownerId: string };
    };

    expect(response.status).toBe(201);
    expect(body.workspace.ownerId).toBe(registerBody.user.id);
    expect(body.ownerMemberId).toBeTruthy();
    expect(body.defaultRoles.map((role) => role.key)).toEqual([
      "owner",
      "administrator",
      "moderator",
      "member",
      "guest",
    ]);
    expect(body.auditLogEntriesCreated).toBe(7);
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain(
      "WORKSPACE_CREATE",
    );
    expect(
      app.repository.auditLogEntries.filter((entry) => entry.event === "ROLE_CREATE"),
    ).toHaveLength(5);
  });

  it("lists only workspaces the authenticated user belongs to", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const other = await register(app, "other@example.com");

    await createWorkspace(app, owner, "Owner Workspace");
    await createWorkspace(app, other, "Other Workspace");

    const response = await app.handler(
      new Request("http://local.test/api/v1/workspaces", {
        headers: { cookie: owner.cookie },
      }),
    );
    const body = (await response.json()) as {
      workspaces: Array<{ name: string; ownerId: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0]).toMatchObject({
      name: "Owner Workspace",
      ownerId: owner.user.id,
    });
  });

  it("rejects workspace creation without authentication", async () => {
    const app = createTestApp();
    const response = await app.handler(jsonRequest("/api/v1/workspaces", { name: "Nope" }));

    expect(response.status).toBe(401);
  });
});

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

function createTestApp(): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
  const passwordHasher = new TestPasswordHasher();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher,
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const channelService = new ChannelService({ repository });
  const messageService = new MessageService({
    channelService,
    eventPublisher: new InMemoryMessageEventHub(),
    repository,
  });
  const workspaceService = new WorkspaceService({ repository });
  const handler = createApiHandler({
    authService,
    channelService,
    config: {
      corsAllowedOrigins: ["http://local.test"],
      enableHsts: false,
      sessionCookieName: "openvoice_session",
      sessionCookieSecure: false,
      sessionTtlSeconds: 3600,
    },
    messageService,
    workspaceService,
  });

  return {
    handler,
    passwordHasher,
    repository,
  };
}

function jsonRequest(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`http://local.test${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

async function register(app: TestApp, email: string): Promise<TestSession> {
  const response = await app.handler(
    jsonRequest("/api/v1/auth/register", {
      email,
      password: "very-secure-password",
    }),
  );
  const body = (await response.json()) as { csrfToken: string; user: PublicUser };
  return {
    cookie: response.headers.get("set-cookie") ?? "",
    csrfToken: body.csrfToken,
    user: body.user,
  };
}

async function createWorkspace(app: TestApp, session: TestSession, name: string): Promise<void> {
  const response = await app.handler(
    jsonRequest(
      "/api/v1/workspaces",
      { name },
      {
        cookie: session.cookie,
        "x-openvoice-csrf-token": session.csrfToken,
      },
    ),
  );
  expect(response.status).toBe(201);
}
