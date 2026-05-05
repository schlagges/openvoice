import { randomUUID } from "node:crypto";

import {
  AudioMode,
  ChannelType,
  Permission,
  serializePermissionMask,
  VideoContentMode,
  VideoQualityProfile,
  type VoiceJoinResponse,
  type VoiceState,
} from "@openvoice/shared";
import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMediaProvider } from "../src/modules/media/provider.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
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

describe("Phase 6 camera and screenshare API", () => {
  it("issues camera and screenshare publish permissions and blocks member 4K by default", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    const joinResponse = await joinVoice(app, member, channel.id);
    const joinBody = (await joinResponse.json()) as VoiceJoinResponse;

    expect(joinResponse.status).toBe(200);
    expect(joinBody.permissions.canPublishCamera).toBe(true);
    expect(joinBody.permissions.canPublishScreen).toBe(true);
    expect(joinBody.permissions.canPublishScreen4k).toBe(false);
    expect(app.mediaProvider.issuedTokens.at(-1)).toMatchObject({
      canPublishAudio: true,
      canPublishCamera: true,
      canPublishScreen: true,
    });

    const cameraResponse = await patchVoiceState(app, member, workspace.id, {
      cameraEnabled: true,
      cameraQuality: VideoQualityProfile.P720,
    });
    const cameraBody = (await cameraResponse.json()) as { state: VoiceState };
    expect(cameraResponse.status).toBe(200);
    expect(cameraBody.state.cameraEnabled).toBe(true);
    expect(cameraBody.state.cameraQuality).toBe(VideoQualityProfile.P720);

    const screenResponse = await patchVoiceState(app, member, workspace.id, {
      screenShareContentMode: VideoContentMode.DETAIL,
      screenShareEnabled: true,
      screenShareQuality: VideoQualityProfile.P1080,
    });
    const screenBody = (await screenResponse.json()) as { state: VoiceState };
    expect(screenResponse.status).toBe(200);
    expect(screenBody.state.screenShareEnabled).toBe(true);
    expect(screenBody.state.screenShareQuality).toBe(VideoQualityProfile.P1080);

    const denied4kResponse = await patchVoiceState(app, member, workspace.id, {
      screenShareEnabled: true,
      screenShareQuality: VideoQualityProfile.P4K,
    });
    expect(denied4kResponse.status).toBe(403);
  });

  it("denies camera and screenshare state changes when channel overrides remove rights", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.STREAM_CAMERA | Permission.SHARE_SCREEN),
    });

    const joinResponse = await joinVoice(app, member, channel.id);
    const joinBody = (await joinResponse.json()) as VoiceJoinResponse;
    expect(joinResponse.status).toBe(200);
    expect(joinBody.permissions.canPublishCamera).toBe(false);
    expect(joinBody.permissions.canPublishScreen).toBe(false);
    expect(app.mediaProvider.issuedTokens.at(-1)).toMatchObject({
      canPublishCamera: false,
      canPublishScreen: false,
    });

    const cameraResponse = await patchVoiceState(app, member, workspace.id, {
      cameraEnabled: true,
    });
    expect(cameraResponse.status).toBe(403);

    const screenResponse = await patchVoiceState(app, member, workspace.id, {
      screenShareEnabled: true,
      screenShareQuality: VideoQualityProfile.P1080,
    });
    expect(screenResponse.status).toBe(403);
  });

  it("allows a 4K screenshare profile when SHARE_SCREEN_4K is granted", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: serializePermissionMask(Permission.SHARE_SCREEN_4K),
      deny: "0",
    });

    const joinResponse = await joinVoice(app, member, channel.id);
    const joinBody = (await joinResponse.json()) as VoiceJoinResponse;
    expect(joinResponse.status).toBe(200);
    expect(joinBody.permissions.canPublishScreen4k).toBe(true);

    const screenResponse = await patchVoiceState(app, member, workspace.id, {
      screenShareContentMode: VideoContentMode.DETAIL,
      screenShareEnabled: true,
      screenShareQuality: VideoQualityProfile.P4K,
    });
    const screenBody = (await screenResponse.json()) as { state: VoiceState };
    expect(screenResponse.status).toBe(200);
    expect(screenBody.state.screenShareEnabled).toBe(true);
    expect(screenBody.state.screenShareQuality).toBe(VideoQualityProfile.P4K);
    expect(screenBody.state.screenShareContentMode).toBe(VideoContentMode.DETAIL);
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

async function joinVoice(app: TestApp, session: TestSession, channelId: string): Promise<Response> {
  return app.handler(
    jsonRequest(
      `/api/v1/channels/${channelId}/voice/join`,
      { audioMode: AudioMode.VOICE, selfDeafened: false, selfMuted: false },
      authHeaders(session),
    ),
  );
}

async function patchVoiceState(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handler(
    new Request(`http://local.test/api/v1/workspaces/${workspaceId}/voice/state`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...authHeaders(session),
      },
      method: "PATCH",
    }),
  );
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
