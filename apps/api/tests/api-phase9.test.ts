import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { INTERNAL_REMOTE_ADDRESS_HEADER } from "../src/http/client-ip.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
import { WorkspaceService } from "../src/modules/workspaces/service.js";
import type { PasswordHasher } from "../src/security/password.js";

class TestPasswordHasher implements PasswordHasher {
  public async hashPassword(password: string): Promise<string> {
    return `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }

  public async verifyPassword(hash: string, password: string): Promise<boolean> {
    return hash === `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }
}

describe("Phase 9 hardening", () => {
  it("adds security headers and handles allowed CORS preflight requests", async () => {
    const app = createTestApp();

    const unauthorized = await app.handler(
      new Request("http://local.test/api/v1/me", {
        headers: { origin: "http://local.test" },
      }),
    );

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(unauthorized.headers.get("x-content-type-options")).toBe("nosniff");
    expect(unauthorized.headers.get("x-frame-options")).toBe("DENY");
    expect(unauthorized.headers.get("referrer-policy")).toBe("no-referrer");
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe("http://local.test");
    expect(unauthorized.headers.get("access-control-allow-credentials")).toBe("true");

    const preflight = await app.handler(
      new Request("http://local.test/api/v1/me", {
        headers: {
          "access-control-request-method": "GET",
          origin: "http://local.test",
        },
        method: "OPTIONS",
      }),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "x-openvoice-csrf-token",
    );
  });

  it("rejects untrusted CORS preflights and cookie CSRF origins", async () => {
    const app = createTestApp();

    const blockedPreflight = await app.handler(
      new Request("http://local.test/api/v1/me", {
        headers: {
          "access-control-request-method": "GET",
          origin: "https://evil.example",
        },
        method: "OPTIONS",
      }),
    );
    expect(blockedPreflight.status).toBe(403);

    const session = await register(app, "owner@example.com");
    const blockedWrite = await app.handler(
      jsonRequest(
        "/api/v1/workspaces",
        { name: "Blocked" },
        {
          cookie: session.cookie,
          origin: "https://evil.example",
          "x-openvoice-csrf-token": session.csrfToken,
        },
      ),
    );
    expect(blockedWrite.status).toBe(403);

    const allowedWrite = await app.handler(
      jsonRequest(
        "/api/v1/workspaces",
        { name: "Allowed" },
        {
          cookie: session.cookie,
          origin: "http://local.test",
          "x-openvoice-csrf-token": session.csrfToken,
        },
      ),
    );
    expect(allowedWrite.status).toBe(201);
  });

  it("rate limits repeated auth attempts and returns retry metadata", async () => {
    const app = createTestApp();
    await register(app, "rate@example.com");

    const attempts: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(
        await app.handler(
          jsonRequest("/api/v1/auth/login", {
            email: "rate@example.com",
            password: "wrong-password",
          }),
        ),
      );
    }

    expect(attempts.slice(0, 10).every((response) => response.status === 401)).toBe(true);
    expect(attempts[10]?.status).toBe(429);
    expect(attempts[10]?.headers.get("retry-after")).toBeTruthy();
  });

  it("does not trust spoofed x-forwarded-for without a trusted proxy", async () => {
    const app = createTestApp();
    await register(app, "spoofed-rate@example.com");

    const attempts: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(
        await app.handler(
          jsonRequest(
            "/api/v1/auth/login",
            {
              email: "spoofed-rate@example.com",
              password: "wrong-password",
            },
            {
              [INTERNAL_REMOTE_ADDRESS_HEADER]: "203.0.113.10",
              "x-forwarded-for": `198.51.100.${index}`,
            },
          ),
        ),
      );
    }

    expect(attempts[10]?.status).toBe(429);
  });

  it("trusts x-forwarded-for from configured exact and CIDR proxy addresses", async () => {
    const exactProxyApp = createTestApp({ trustedProxyIps: ["172.18.0.2"] });
    await register(exactProxyApp, "exact-proxy@example.com");

    const exactAttempts: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      exactAttempts.push(
        await exactProxyApp.handler(
          jsonRequest(
            "/api/v1/auth/login",
            {
              email: "exact-proxy@example.com",
              password: "wrong-password",
            },
            {
              [INTERNAL_REMOTE_ADDRESS_HEADER]: "172.18.0.2",
              "x-forwarded-for": `198.51.100.${index}`,
            },
          ),
        ),
      );
    }

    expect(exactAttempts.every((response) => response.status === 401)).toBe(true);

    const cidrProxyApp = createTestApp({ trustedProxyIps: ["172.18.0.0/16"] });
    await register(cidrProxyApp, "cidr-proxy@example.com");

    const cidrAttempts: Response[] = [];
    for (let index = 0; index < 11; index += 1) {
      cidrAttempts.push(
        await cidrProxyApp.handler(
          jsonRequest(
            "/api/v1/auth/login",
            {
              email: "cidr-proxy@example.com",
              password: "wrong-password",
            },
            {
              [INTERNAL_REMOTE_ADDRESS_HEADER]: "172.18.42.7",
              "x-forwarded-for": `203.0.113.${index}`,
            },
          ),
        ),
      );
    }

    expect(cidrAttempts.every((response) => response.status === 401)).toBe(true);
  });

  it("stores hashed request IPs for audit log entries when configured", async () => {
    const app = createTestApp({ auditIpHashSecret: "audit-hash-secret" });
    const session = await register(app, "audit-ip@example.com");

    const response = await app.handler(
      jsonRequest(
        "/api/v1/workspaces",
        { name: "Audit IP" },
        {
          ...authHeaders(session),
          [INTERNAL_REMOTE_ADDRESS_HEADER]: "203.0.113.77",
        },
      ),
    );

    expect(response.status).toBe(201);
    expect(app.repository.auditLogEntries[0]?.ipHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(app.repository.auditLogEntries[0]?.ipHash).not.toContain("203.0.113.77");
  });

  it("keeps release compose and examples free of runnable default secrets", () => {
    const compose = readFileSync("infra/docker-compose.yml", "utf8");
    const envExample = readFileSync(".env.example", "utf8");
    const livekitConfig = readFileSync("infra/livekit.yaml", "utf8");

    for (const unsafe of [
      "replace-with-generated",
      "replace-with-local",
      "openvoice_dev_password",
      "devkey",
      "CHANGE_ME",
    ]) {
      expect(compose).not.toContain(unsafe);
      expect(envExample).not.toContain(unsafe);
      expect(livekitConfig).not.toContain(unsafe);
    }

    for (const required of [
      "CSRF_SECRET",
      "AUDIT_IP_HASH_SECRET",
      "POSTGRES_PASSWORD",
      "LIVEKIT_API_SECRET",
      "PASSWORD_PEPPER",
      "SESSION_SECRET",
      "TURN_SHARED_SECRET",
      "GRAFANA_ADMIN_PASSWORD",
    ]) {
      expect(compose).toContain(`${required}:?`);
      expect(envExample).toContain(`${required}=`);
    }
  });
});

interface TestApp {
  readonly handler: (request: Request) => Promise<Response>;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
}

function createTestApp(
  options: {
    readonly auditIpHashSecret?: string;
    readonly trustedProxyIps?: readonly string[];
  } = {},
): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher: new TestPasswordHasher(),
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const channelService = new ChannelService({ repository });
  const handler = createApiHandler({
    authService,
    channelService,
    config: {
      corsAllowedOrigins: ["http://local.test"],
      enableHsts: false,
      ...(options.auditIpHashSecret ? { auditIpHashSecret: options.auditIpHashSecret } : {}),
      sessionCookieName: "openvoice_session",
      sessionCookieSecure: false,
      sessionTtlSeconds: 3600,
      ...(options.trustedProxyIps ? { trustedProxyIps: options.trustedProxyIps } : {}),
    },
    messageService: new MessageService({
      channelService,
      eventPublisher: new InMemoryMessageEventHub(),
      repository,
    }),
    workspaceService: new WorkspaceService({ repository }),
  });

  return { handler, repository };
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
  };
}

function authHeaders(session: TestSession): HeadersInit {
  return {
    cookie: session.cookie,
    "x-openvoice-csrf-token": session.csrfToken,
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
