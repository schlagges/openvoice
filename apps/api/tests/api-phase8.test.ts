import { randomUUID } from "node:crypto";

import { ChannelType, MessageContentFormat } from "@openvoice/shared";
import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMediaProvider } from "../src/modules/media/provider.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
import { HealthService } from "../src/modules/observability/health.js";
import { OpenVoiceMetrics } from "../src/modules/observability/metrics.js";
import { ObservabilityService } from "../src/modules/observability/service.js";
import { TurnCredentialService } from "../src/modules/turn/credentials.js";
import { VoiceService } from "../src/modules/voice/service.js";
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

interface TestApp {
  readonly handler: (request: Request) => Promise<Response>;
  readonly metrics: OpenVoiceMetrics;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

describe("Phase 8 observability API", () => {
  it("exposes liveness, readiness, and Prometheus metrics", async () => {
    const app = createTestApp();

    const healthResponse = await app.handler(new Request("http://local.test/healthz"));
    const healthBody = (await healthResponse.json()) as { status: string };
    expect(healthResponse.status).toBe(200);
    expect(healthBody.status).toBe("ok");

    const readinessResponse = await app.handler(new Request("http://local.test/readyz"));
    const readinessBody = (await readinessResponse.json()) as {
      checks: readonly { ok: boolean }[];
      status: string;
    };
    expect(readinessResponse.status).toBe(200);
    expect(readinessBody.status).toBe("ok");
    expect(readinessBody.checks.every((check) => check.ok)).toBe(true);

    const metrics = await metricsText(app);
    expect(metrics).toContain("# TYPE gateway_connections gauge");
    expect(metrics).toContain('api_http_requests_total{method="GET",status="200"} 2');
  });

  it("counts message sends and failed voice joins", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const textChannel = await createChannel(app, owner, workspace.id, ChannelType.TEXT);

    const messageResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${textChannel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: "hello observability",
          contentFormat: MessageContentFormat.MARKDOWN,
        },
        authHeaders(owner),
      ),
    );
    expect(messageResponse.status).toBe(201);

    const failedJoinResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${textChannel.id}/voice/join`,
        { audioMode: "voice", selfDeafened: false, selfMuted: false },
        authHeaders(owner),
      ),
    );
    expect(failedJoinResponse.status).toBe(400);

    const metrics = await metricsText(app);
    expect(metrics).toContain("messages_sent_total 1");
    expect(metrics).toContain("voice_join_failures_total 1");
  });

  it("ingests RTC stats only for users that can view the channel", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const outsider = await register(app, "outsider@example.com");
    const workspace = await createWorkspace(app, owner);
    const voiceChannel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);
    const sampleBody = createRtcStatsBody(workspace.id, voiceChannel.id);

    const accepted = await app.handler(
      jsonRequest("/api/v1/rtc/stats", sampleBody, authHeaders(owner)),
    );
    expect(accepted.status).toBe(202);

    const denied = await app.handler(
      jsonRequest("/api/v1/rtc/stats", sampleBody, authHeaders(outsider)),
    );
    expect(denied.status).toBe(403);

    const metrics = await metricsText(app);
    expect(metrics).toContain("rtc_relay_ratio 1");
    expect(metrics).toContain("rtc_audio_rtt_p95 42");
    expect(metrics).toContain("rtc_video_bitrate_avg 1000000");
    expect(metrics).toContain("permission_denied_total 1");
  });
});

function createTestApp(): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
  const metrics = new OpenVoiceMetrics();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher: new TestPasswordHasher(),
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const channelService = new ChannelService({ repository });
  const mediaProvider = new InMemoryMediaProvider();
  const turnCredentialService = new TurnCredentialService({
    realm: "openvoice.test",
    sharedSecret: "turn-secret",
    ttlSeconds: 1200,
    turnHost: "turn.local",
  });
  const observabilityService = new ObservabilityService({
    channelService,
    healthService: new HealthService([
      {
        name: "in-memory-repository",
        run: async () => undefined,
      },
    ]),
    mediaProvider,
    metrics,
  });
  const voiceService = new VoiceService({
    channelService,
    livekitUrl: "ws://livekit.local:7880",
    mediaProvider,
    metrics,
    repository,
    turnCredentialService,
  });
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
    messageService: new MessageService({
      channelService,
      eventPublisher: new InMemoryMessageEventHub(),
      metrics,
      repository,
    }),
    observabilityService,
    voiceService,
    workspaceService: new WorkspaceService({ repository }),
  });

  return { handler, metrics, repository };
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
): Promise<{ readonly id: string }> {
  const response = await app.handler(
    jsonRequest("/api/v1/workspaces", { name: "OpenVoice Test" }, authHeaders(session)),
  );
  const body = (await response.json()) as { workspace: { id: string } };

  expect(response.status).toBe(201);
  return body.workspace;
}

async function createChannel(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  type: ChannelType,
): Promise<{ readonly id: string }> {
  const response = await app.handler(
    jsonRequest(
      `/api/v1/workspaces/${workspaceId}/channels`,
      { name: `${type}-${randomUUID()}`, type },
      authHeaders(session),
    ),
  );
  const body = (await response.json()) as { channel: { id: string } };

  expect(response.status).toBe(201);
  return body.channel;
}

async function metricsText(app: TestApp): Promise<string> {
  const response = await app.handler(new Request("http://local.test/metrics"));
  expect(response.status).toBe(200);
  return response.text();
}

function createRtcStatsBody(workspaceId: string, channelId: string) {
  return {
    audio: {
      bitrateBps: null,
      concealedSamples: null,
      jitterMs: 5,
      packetsLost: 1,
      packetsReceived: 98,
      rttMs: 42,
    },
    channelId,
    connection: {
      iceState: "connected",
      selectedCandidateType: "relay",
      transport: "udp",
    },
    sessionId: randomUUID(),
    timestamp: new Date(0).toISOString(),
    video: {
      bitrateBps: 1_000_000,
      framesDropped: null,
      framesPerSecond: 30,
      height: 720,
      packetsLost: 1,
      width: 1280,
    },
    workspaceId,
  };
}

function authHeaders(session: TestSession): HeadersInit {
  return {
    cookie: session.cookie,
    "x-openvoice-csrf-token": session.csrfToken,
  };
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`http://local.test${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}
