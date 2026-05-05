import { createHmac, randomUUID } from "node:crypto";

import {
  AudioMode,
  ChannelType,
  Permission,
  serializePermissionMask,
  type VoiceJoinResponse,
} from "@openvoice/shared";
import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMediaProvider } from "../src/modules/media/provider.js";
import { MessageService } from "../src/modules/messages/service.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
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
  readonly mediaProvider: InMemoryMediaProvider;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

describe("Phase 5 voice API", () => {
  it("uses configured external TURN ports in ICE responses", () => {
    const service = new TurnCredentialService({
      realm: "openvoice.test",
      sharedSecret: "turn-secret",
      ttlSeconds: 1200,
      turnHost: "turn.local",
      turnPort: 3488,
      turnsPort: 5359,
    });

    expect(
      service
        .createIceServers({ now: new Date(0), userId: "user" })
        .iceServers.flatMap((server) => server.urls),
    ).toEqual([
      "stun:turn.local:3488",
      "turn:turn.local:3488?transport=udp",
      "turn:turn.local:3488?transport=tcp",
      "turns:turn.local:5359?transport=tcp",
    ]);
  });

  it("issues LiveKit voice tokens and short-lived TURN REST credentials", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    const joinResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/voice/join`,
        { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
        authHeaders(owner),
      ),
    );
    const joinBody = (await joinResponse.json()) as VoiceJoinResponse;

    expect(joinResponse.status).toBe(200);
    expect(joinBody.livekitUrl).toBe("ws://livekit.local:7880");
    expect(joinBody.permissions.canConnect).toBe(true);
    expect(joinBody.permissions.canPublishAudio).toBe(true);
    expect(joinBody.iceServers.flatMap((server) => server.urls)).toEqual([
      "stun:turn.local:3478",
      "turn:turn.local:3478?transport=udp",
      "turn:turn.local:3478?transport=tcp",
      "turns:turn.local:5349?transport=tcp",
    ]);
    expect(app.mediaProvider.issuedTokens.at(-1)).toMatchObject({
      canPublishAudio: true,
      roomName: joinBody.roomName,
      userId: owner.user.id,
    });
    expect(app.repository.voiceStates).toHaveLength(1);

    const turnResponse = await app.handler(
      new Request("http://local.test/api/v1/turn/credentials", {
        headers: { cookie: owner.cookie },
      }),
    );
    const turnBody = (await turnResponse.json()) as Pick<VoiceJoinResponse, "iceServers">;
    const turnServer = turnBody.iceServers[1];
    expect(turnResponse.status).toBe(200);
    expect(turnServer?.username).toContain(`:${owner.user.id}`);
    expect(turnServer?.credential).toBe(
      createHmac("sha1", "turn-secret")
        .update(turnServer?.username ?? "")
        .digest("base64"),
    );
  });

  it("denies CONNECT_VOICE and allows CONNECT_VOICE without SPEAK as receive-only", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.CONNECT_VOICE),
    });
    const connectDenied = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/voice/join`,
        { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
        authHeaders(member),
      ),
    );
    expect(connectDenied.status).toBe(403);

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: serializePermissionMask(Permission.CONNECT_VOICE),
      deny: serializePermissionMask(Permission.SPEAK),
    });
    const receiveOnlyResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/voice/join`,
        { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
        authHeaders(member),
      ),
    );
    const receiveOnlyBody = (await receiveOnlyResponse.json()) as VoiceJoinResponse;

    expect(receiveOnlyResponse.status).toBe(200);
    expect(receiveOnlyBody.permissions.canPublishAudio).toBe(false);
    expect(app.mediaProvider.issuedTokens.at(-1)?.canPublishAudio).toBe(false);
  });

  it("enforces server mute and server deafen through repository state and media provider", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    const joinResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/voice/join`,
        { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
        authHeaders(member),
      ),
    );
    expect(joinResponse.status).toBe(200);

    const muteResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/voice/server-mute`,
        { enabled: true, targetUserId: member.user.id },
        authHeaders(owner),
      ),
    );
    expect(muteResponse.status).toBe(200);
    expect(app.repository.voiceStates[0]?.serverMuted).toBe(true);
    expect(app.mediaProvider.publishEnforcements.at(-1)).toMatchObject({
      canPublishAudio: false,
      userId: member.user.id,
    });
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain(
      "VOICE_SERVER_MUTE",
    );

    const mutedJoinResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/voice/join`,
        { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
        authHeaders(member),
      ),
    );
    const mutedJoinBody = (await mutedJoinResponse.json()) as VoiceJoinResponse;
    expect(mutedJoinBody.permissions.canPublishAudio).toBe(false);

    const deafenResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/voice/server-deafen`,
        { enabled: true, targetUserId: member.user.id },
        authHeaders(owner),
      ),
    );
    expect(deafenResponse.status).toBe(200);
    expect(app.repository.voiceStates[0]?.serverDeafened).toBe(true);
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain(
      "VOICE_SERVER_DEAFEN",
    );
  });
});

function createTestApp(): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
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
  const voiceService = new VoiceService({
    channelService,
    livekitUrl: "ws://livekit.local:7880",
    mediaProvider,
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
      repository,
    }),
    voiceService,
    workspaceService: new WorkspaceService({ repository }),
  });

  return { handler, mediaProvider, repository };
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

function addWorkspaceMember(
  repository: InMemoryOpenVoiceRepository,
  workspaceId: string,
  userId: string,
  roleKey: string,
) {
  const role = repository.roles.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.key === roleKey,
  );
  if (!role) {
    throw new Error(`Expected ${roleKey} role.`);
  }

  const member = {
    createdAt: new Date(),
    id: randomUUID(),
    userId,
    workspaceId,
  };
  repository.workspaceMembers.push(member);
  repository.memberRoles.push({ roleId: role.id, workspaceMemberId: member.id });
  return role;
}

async function putOverride(
  app: TestApp,
  session: TestSession,
  channelId: string,
  targetType: "member" | "role",
  targetId: string,
  body: { readonly allow: string; readonly deny: string },
): Promise<void> {
  const response = await app.handler(
    new Request(
      `http://local.test/api/v1/channels/${channelId}/permission-overrides/${targetType}/${targetId}`,
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...authHeaders(session),
        },
        method: "PUT",
      },
    ),
  );

  expect(response.status).toBe(200);
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
