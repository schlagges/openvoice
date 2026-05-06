import { createSign, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("rejects duplicate workspace names", async () => {
    const app = createTestApp();
    const firstOwner = await register(app, "duplicate-owner@example.com");
    const secondOwner = await register(app, "duplicate-other@example.com");

    await createWorkspace(app, firstOwner, "Shared Name");
    const duplicate = await app.handler(
      jsonRequest(
        "/api/v1/workspaces",
        { name: " shared name " },
        {
          cookie: secondOwner.cookie,
          "x-openvoice-csrf-token": secondOwner.csrfToken,
        },
      ),
    );

    expect(duplicate.status).toBe(409);
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
      workspaces: Array<{ memberCount: number; name: string; ownerId: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0]).toMatchObject({
      memberCount: 1,
      name: "Owner Workspace",
      ownerId: owner.user.id,
    });
  });

  it("creates membership-scoped invites and lets another user join the workspace", async () => {
    const app = createTestApp();
    const owner = await register(app, "invite-owner@example.com");
    const invited = await register(app, "invite-user@example.com");
    const workspace = await createWorkspace(app, owner, "Invite Workspace");

    const inviteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.workspace.id}/invites`,
        {},
        {
          cookie: owner.cookie,
          "x-openvoice-csrf-token": owner.csrfToken,
        },
      ),
    );
    const inviteBody = (await inviteResponse.json()) as { code: string; workspaceId: string };

    expect(inviteResponse.status).toBe(201);
    expect(inviteBody.workspaceId).toBe(workspace.workspace.id);
    expect(app.repository.workspaceInvites[0]?.codeHash).toBeTruthy();
    expect(app.repository.workspaceInvites[0]?.codeHash).not.toBe(inviteBody.code);

    const joinResponse = await app.handler(
      jsonRequest(
        "/api/v1/invites/join",
        { code: inviteBody.code },
        {
          cookie: invited.cookie,
          "x-openvoice-csrf-token": invited.csrfToken,
        },
      ),
    );
    const joinBody = (await joinResponse.json()) as {
      alreadyMember: boolean;
      role: { key: string } | null;
      workspace: { id: string };
    };

    expect(joinResponse.status).toBe(200);
    expect(joinBody.alreadyMember).toBe(false);
    expect(joinBody.role?.key).toBe("member");
    expect(joinBody.workspace.id).toBe(workspace.workspace.id);
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("MEMBER_JOIN");

    const listed = await app.handler(
      new Request("http://local.test/api/v1/workspaces", {
        headers: { cookie: invited.cookie },
      }),
    );
    const listedBody = (await listed.json()) as {
      workspaces: Array<{ id: string; memberCount: number }>;
    };
    expect(listedBody.workspaces).toContainEqual(
      expect.objectContaining({ id: workspace.workspace.id, memberCount: 2 }),
    );
  });

  it("creates short-lived invites by default", async () => {
    const app = createTestApp();
    const owner = await register(app, "short-invite-owner@example.com");
    const workspace = await createWorkspace(app, owner, "Short Invite Workspace");
    const before = Date.now();

    const inviteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.workspace.id}/invites`,
        {},
        {
          cookie: owner.cookie,
          "x-openvoice-csrf-token": owner.csrfToken,
        },
      ),
    );
    const inviteBody = (await inviteResponse.json()) as { expiresAt: string };
    const expiresAt = new Date(inviteBody.expiresAt).getTime();

    expect(inviteResponse.status).toBe(201);
    expect(expiresAt - before).toBeGreaterThan(295_000);
    expect(expiresAt - before).toBeLessThan(305_000);
  });

  it("lets guests join an invite with display name only and returns a bearer session", async () => {
    const app = createTestApp();
    const owner = await register(app, "guest-invite-owner@example.com");
    const workspace = await createWorkspace(app, owner, "Guest Invite Workspace");
    const inviteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.workspace.id}/invites`,
        {},
        {
          cookie: owner.cookie,
          "x-openvoice-csrf-token": owner.csrfToken,
        },
      ),
    );
    const inviteBody = (await inviteResponse.json()) as { code: string };

    const guestJoin = await app.handler(
      jsonRequest(`/api/v1/invites/${inviteBody.code}/guest-join`, {
        displayName: "Guest Tester",
      }),
    );
    const guestBody = (await guestJoin.json()) as {
      accessToken: string;
      role: { key: string } | null;
      user: { displayName: string };
      workspace: { id: string };
    };

    expect(guestJoin.status).toBe(200);
    expect(guestBody.accessToken).toBeTruthy();
    expect(guestBody.role?.key).toBe("guest");
    expect(guestBody.user.displayName).toBe("Guest Tester");
    expect(guestBody.workspace.id).toBe(workspace.workspace.id);

    const guestUser = app.repository.users.find((user) => user.displayName === "Guest Tester");
    expect(guestUser).toMatchObject({
      kind: "guest",
      keycloakSubject: null,
    });
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("GUEST_JOIN");

    const listed = await app.handler(
      new Request("http://local.test/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${guestBody.accessToken}` },
      }),
    );
    const listedBody = (await listed.json()) as {
      workspaces: Array<{ id: string; memberCount: number }>;
    };

    expect(listed.status).toBe(200);
    expect(listedBody.workspaces).toContainEqual(
      expect.objectContaining({ id: workspace.workspace.id, memberCount: 2 }),
    );
  });

  it("exposes OIDC login configuration and can disable local password auth", async () => {
    const app = createTestApp({
      localPasswordAuthEnabled: false,
      oidcClientId: "openvoice-web",
      oidcIssuerUrl: "https://auth.schnick-schnack.info/realms/schnick-schnack",
    });

    const configResponse = await app.handler(new Request("http://local.test/api/v1/auth/config"));
    const configBody = (await configResponse.json()) as {
      localPasswordAuthEnabled: boolean;
      oidc: { accountUrl: string; callbackUrl: string; clientId: string; issuerUrl: string };
    };

    expect(configResponse.status).toBe(200);
    expect(configBody).toEqual({
      localPasswordAuthEnabled: false,
      oidc: {
        accountUrl: "https://auth.schnick-schnack.info/realms/schnick-schnack/account",
        callbackUrl: "https://voice.schnick-schnack.info/api/v1/auth/oidc/callback",
        clientId: "openvoice-web",
        issuerUrl: "https://auth.schnick-schnack.info/realms/schnick-schnack",
      },
    });

    const registerResponse = await app.handler(
      jsonRequest("/api/v1/auth/register", {
        email: "disabled@example.com",
        password: "very-secure-password",
      }),
    );

    expect(registerResponse.status).toBe(403);
  });

  it("starts OIDC login and completes the backend callback into an OpenVoice session", async () => {
    const issuer = "https://auth.schnick-schnack.info/realms/schnick-schnack";
    const callbackUrl = "http://local.test/api/v1/auth/oidc/callback";
    const app = createTestApp({
      localPasswordAuthEnabled: false,
      oidcAudience: "openvoice",
      oidcCallbackUrl: callbackUrl,
      oidcClientId: "openvoice",
      oidcClientSecret: "test-client-secret",
      oidcEnabled: true,
      oidcIssuerUrl: issuer,
      oidcRequiredClientRole: "user",
    });
    const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicJwk = keyPair.publicKey.export({ format: "jwk" }) as JsonWebKey;
    const kid = "test-key";
    const idToken = signJwt(
      {
        aud: "openvoice",
        email: "keycloak@example.com",
        exp: Math.floor(Date.now() / 1000) + 600,
        iss: issuer,
        name: "Keycloak User",
        sub: "keycloak-subject-1",
      },
      keyPair.privateKey,
      kid,
    );
    const accessToken = signJwt(
      {
        aud: "openvoice",
        exp: Math.floor(Date.now() / 1000) + 600,
        iss: issuer,
        resource_access: { openvoice: { roles: ["user"] } },
      },
      keyPair.privateKey,
      kid,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url === `${issuer}/.well-known/openid-configuration`) {
          return Response.json({
            authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
            issuer,
            jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            token_endpoint: `${issuer}/protocol/openid-connect/token`,
          });
        }
        if (url === `${issuer}/protocol/openid-connect/token`) {
          return Response.json({ access_token: accessToken, id_token: idToken });
        }
        if (url === `${issuer}/protocol/openid-connect/certs`) {
          return Response.json({ keys: [{ ...publicJwk, kid }] });
        }
        return new Response(null, { status: 404 });
      }),
    );
    await app.repository.createUser({
      displayName: "Invited User",
      email: "keycloak@example.com",
      emailNormalized: "keycloak@example.com",
      passwordHash: "legacy-disabled",
    });
    const globalOwner = await app.repository.createUser({
      displayName: "Global Owner",
      email: "global-owner@example.com",
      emailNormalized: "global-owner@example.com",
      passwordHash: "legacy-disabled",
    });
    const globalWorkspace = await app.repository.createWorkspaceWithDefaults({
      accessMode: "global_authenticated",
      name: "Global",
      ownerId: globalOwner.id,
    });

    const login = await app.handler(
      new Request("http://local.test/api/v1/auth/oidc/login?returnTo=/"),
    );
    const location = login.headers.get("location");
    const stateCookie = login.headers.get("set-cookie") ?? "";

    expect(login.status).toBe(302);
    expect(location).toContain(`${issuer}/protocol/openid-connect/auth`);
    expect(location).toContain(`redirect_uri=${encodeURIComponent(callbackUrl)}`);
    expect(stateCookie).toContain("openvoice_oidc_state=");

    const state = new URL(location ?? "").searchParams.get("state");
    const callback = await app.handler(
      new Request(`http://local.test/api/v1/auth/oidc/callback?code=abc&state=${state}`, {
        headers: { cookie: stateCookie },
      }),
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/");
    expect(callback.headers.get("set-cookie")).toContain("openvoice_session=");
    const user = app.repository.users.find(
      (candidate) => candidate.email === "keycloak@example.com",
    );
    expect(user).toMatchObject({
      displayName: "Invited User",
      keycloakSubject: "keycloak-subject-1",
      kind: "registered",
    });
    expect(user?.id).toBeTruthy();
    await expect(
      app.repository.findWorkspaceMember(globalWorkspace.workspace.id, user?.id ?? ""),
    ).resolves.toMatchObject({
      userId: user?.id,
      workspaceId: globalWorkspace.workspace.id,
    });
  });

  it("blocks guests from joining global Keycloak workspaces by invite", async () => {
    const app = createTestApp();
    const owner = await register(app, "global-invite-owner@example.com");
    const globalWorkspace = await app.repository.createWorkspaceWithDefaults({
      accessMode: "global_authenticated",
      name: "Global Voice",
      ownerId: owner.user.id,
    });
    const inviteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${globalWorkspace.workspace.id}/invites`,
        {},
        {
          cookie: owner.cookie,
          "x-openvoice-csrf-token": owner.csrfToken,
        },
      ),
    );
    const inviteBody = (await inviteResponse.json()) as { code: string };
    expect(inviteResponse.status).toBe(201);

    const guestJoin = await app.handler(
      jsonRequest(`/api/v1/invites/${inviteBody.code}/guest-join`, {
        displayName: "Guest Global",
      }),
    );

    expect(guestJoin.status).toBe(403);
    expect(app.repository.users.some((candidate) => candidate.displayName === "Guest Global")).toBe(
      false,
    );
  });

  it("lets linked Keycloak users join global workspaces explicitly", async () => {
    const app = createTestApp();
    const owner = await register(app, "global-owner@example.com");
    const member = await register(app, "global-member@example.com");
    await app.repository.linkUserToKeycloakSubject(
      member.user.id,
      "global-member-subject",
      new Date(),
    );
    const globalWorkspace = await app.repository.createWorkspaceWithDefaults({
      accessMode: "global_authenticated",
      name: "Global Join",
      ownerId: owner.user.id,
    });

    const joinResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${globalWorkspace.workspace.id}/join-global`,
        {},
        {
          cookie: member.cookie,
          "x-openvoice-csrf-token": member.csrfToken,
        },
      ),
    );
    const joinBody = (await joinResponse.json()) as {
      workspace: { accessMode: string; id: string };
    };

    expect(joinResponse.status).toBe(200);
    expect(joinBody.workspace).toMatchObject({
      accessMode: "global_authenticated",
      id: globalWorkspace.workspace.id,
    });
    await expect(
      app.repository.findWorkspaceMember(globalWorkspace.workspace.id, member.user.id),
    ).resolves.toMatchObject({
      userId: member.user.id,
      workspaceId: globalWorkspace.workspace.id,
    });
  });

  it("creates a registered OpenVoice user for a valid new Keycloak identity", async () => {
    const app = createTestApp();

    const result = await app.repository.createUser({
      displayName: "Global Owner",
      email: "global-owner-new@example.com",
      emailNormalized: "global-owner-new@example.com",
      passwordHash: "legacy-disabled",
    });
    const globalWorkspace = await app.repository.createWorkspaceWithDefaults({
      accessMode: "global_authenticated",
      name: "Global New User",
      ownerId: result.id,
    });

    const login = await new AuthService({
      csrfSecret: "test-csrf-secret",
      passwordHasher: app.passwordHasher,
      repository: app.repository,
      sessionSecret: "test-session-secret",
      sessionTtlSeconds: 3600,
    }).loginWithExternalIdentity({
      displayName: "Keycloak New",
      email: "keycloak-new@example.com",
      subject: "keycloak-new-subject",
    });
    await new WorkspaceService({ repository: app.repository }).joinGlobalWorkspacesForUser(
      login.user.id,
    );

    const user = app.repository.users.find(
      (candidate) => candidate.keycloakSubject === "keycloak-new-subject",
    );
    expect(user).toMatchObject({
      displayName: "Keycloak New",
      email: "keycloak-new@example.com",
      kind: "registered",
    });
    await expect(
      app.repository.findWorkspaceMember(globalWorkspace.workspace.id, login.user.id),
    ).resolves.toMatchObject({
      workspaceId: globalWorkspace.workspace.id,
      userId: login.user.id,
    });
  });

  it("rejects invite creation without MANAGE_INVITES membership and blocks banned invite joins", async () => {
    const app = createTestApp();
    const owner = await register(app, "invite-owner-2@example.com");
    const outsider = await register(app, "invite-outsider@example.com");
    const banned = await register(app, "invite-banned@example.com");
    const workspace = await createWorkspace(app, owner, "Invite Guard Workspace");

    const forbiddenCreate = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.workspace.id}/invites`,
        {},
        {
          cookie: outsider.cookie,
          "x-openvoice-csrf-token": outsider.csrfToken,
        },
      ),
    );
    expect(forbiddenCreate.status).toBe(403);

    const inviteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.workspace.id}/invites`,
        {},
        {
          cookie: owner.cookie,
          "x-openvoice-csrf-token": owner.csrfToken,
        },
      ),
    );
    const inviteBody = (await inviteResponse.json()) as { code: string };
    app.repository.workspaceBans.push({
      bannedBy: owner.user.id,
      createdAt: new Date(),
      id: randomUUID(),
      reason: "manual test ban",
      revokedAt: null,
      revokedBy: null,
      userId: banned.user.id,
      workspaceId: workspace.workspace.id,
    });

    const bannedJoin = await app.handler(
      jsonRequest(
        "/api/v1/invites/join",
        { code: inviteBody.code },
        {
          cookie: banned.cookie,
          "x-openvoice-csrf-token": banned.csrfToken,
        },
      ),
    );

    expect(bannedJoin.status).toBe(403);
    expect(
      await app.repository.findWorkspaceMember(workspace.workspace.id, banned.user.id),
    ).toBeNull();
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

function createTestApp(
  configOverrides: Partial<{
    readonly localPasswordAuthEnabled: boolean;
    readonly oidcAudience: string;
    readonly oidcCallbackUrl: string;
    readonly oidcClientId: string;
    readonly oidcClientSecret: string;
    readonly oidcEnabled: boolean;
    readonly oidcIssuerUrl: string;
    readonly oidcRequiredClientRole: string;
  }> = {},
): TestApp {
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
      csrfSecret: "test-csrf-secret",
      enableHsts: false,
      ...configOverrides,
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

function signJwt(claims: Record<string, unknown>, privateKey: KeyObject, kid: string): string {
  const header = base64UrlJson({ alg: "RS256", kid, typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .end()
    .sign(privateKey, "base64url");

  return `${header}.${payload}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
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

async function createWorkspace(
  app: TestApp,
  session: TestSession,
  name: string,
): Promise<{ readonly workspace: { readonly id: string } }> {
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
  return (await response.json()) as { workspace: { id: string } };
}
