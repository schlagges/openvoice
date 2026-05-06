import { randomUUID } from "node:crypto";

import {
  AudioMode,
  ChannelType,
  MessageContentFormat,
  Permission,
  type PublicAuditLogEntry,
  serializePermissionMask,
  type VoiceJoinResponse,
} from "@openvoice/shared";
import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMediaProvider } from "../src/modules/media/provider.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
import { ModerationService } from "../src/modules/moderation/service.js";
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

describe("Phase 7 moderation API", () => {
  it("kicks members, protects the owner, and writes audit logs", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, moderator.user.id, "moderator");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    const kickResponse = await postMemberModeration(
      app,
      moderator,
      workspace.id,
      member.user.id,
      "kick",
      { reason: "spam" },
    );
    expect(kickResponse.status).toBe(200);
    expect(await app.repository.findWorkspaceMember(workspace.id, member.user.id)).toBeNull();
    expect(app.repository.auditLogEntries.at(-1)).toMatchObject({
      event: "MEMBER_KICK",
      reason: "spam",
      targetId: member.user.id,
    });

    const ownerKickResponse = await postMemberModeration(
      app,
      moderator,
      workspace.id,
      owner.user.id,
      "kick",
      {},
    );
    expect(ownerKickResponse.status).toBe(403);
  });

  it("blocks equal-role moderation through hierarchy checks", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const targetModerator = await register(app, "target-moderator@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, moderator.user.id, "moderator");
    addWorkspaceMember(app.repository, workspace.id, targetModerator.user.id, "moderator");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);
    expect(await joinVoice(app, targetModerator, channel.id)).toHaveProperty("status", 200);

    const denied = await postVoiceModeration(app, moderator, workspace.id, "server-mute", {
      enabled: true,
      targetUserId: targetModerator.user.id,
    });
    expect(denied.status).toBe(403);

    const allowed = await postVoiceModeration(app, owner, workspace.id, "server-mute", {
      enabled: true,
      targetUserId: targetModerator.user.id,
    });
    expect(allowed.status).toBe(200);
  });

  it("bans, unbans, and rejects access while an active ban exists", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    const banResponse = await postMemberModeration(
      app,
      owner,
      workspace.id,
      member.user.id,
      "ban",
      { reason: "abuse" },
    );
    expect(banResponse.status).toBe(200);
    expect(
      await app.repository.findActiveWorkspaceBan(workspace.id, member.user.id),
    ).not.toBeNull();
    expect(await app.repository.findWorkspaceMember(workspace.id, member.user.id)).toBeNull();
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("MEMBER_BAN");

    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const bannedTreeResponse = await app.handler(
      new Request(`http://local.test/api/v1/workspaces/${workspace.id}/tree`, {
        headers: { cookie: member.cookie },
      }),
    );
    expect(bannedTreeResponse.status).toBe(403);

    const unbanResponse = await postMemberModeration(
      app,
      owner,
      workspace.id,
      member.user.id,
      "unban",
      { reason: "appeal accepted" },
    );
    expect(unbanResponse.status).toBe(200);
    expect(await app.repository.findActiveWorkspaceBan(workspace.id, member.user.id)).toBeNull();
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("MEMBER_UNBAN");
  });

  it("applies timeouts to chat and audio publishing", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, moderator.user.id, "moderator");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const textChannel = await createChannel(app, owner, workspace.id, ChannelType.TEXT);
    const voiceChannel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    const timeoutResponse = await postMemberModeration(
      app,
      moderator,
      workspace.id,
      member.user.id,
      "timeout",
      { durationSeconds: 300, reason: "cooldown" },
    );
    expect(timeoutResponse.status).toBe(200);
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("MEMBER_TIMEOUT");

    const messageResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${textChannel.id}/messages`,
        {
          clientMessageId: "timeout-message",
          content: "hello",
          contentFormat: MessageContentFormat.MARKDOWN,
        },
        authHeaders(member),
      ),
    );
    expect(messageResponse.status).toBe(403);

    const joinResponse = await joinVoice(app, member, voiceChannel.id);
    const joinBody = (await joinResponse.json()) as VoiceJoinResponse;
    expect(joinResponse.status).toBe(200);
    expect(joinBody.permissions.canPublishAudio).toBe(false);
    expect(app.mediaProvider.issuedTokens.at(-1)?.canPublishAudio).toBe(false);
  });

  it("moves and disconnects voice members with media enforcement and audit logs", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, moderator.user.id, "moderator");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const sourceChannel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);
    const targetChannel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    expect(await joinVoice(app, member, sourceChannel.id)).toHaveProperty("status", 200);

    const moveResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/voice/move`,
        {
          channelId: targetChannel.id,
          reason: "wrong room",
          targetUserId: member.user.id,
        },
        authHeaders(moderator),
      ),
    );
    expect(moveResponse.status).toBe(200);
    expect(app.repository.voiceStates[0]?.channelId).toBe(targetChannel.id);
    expect(app.mediaProvider.movedParticipants.at(-1)).toMatchObject({
      userId: member.user.id,
    });
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("VOICE_MOVE");

    const disconnectResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/voice/disconnect`,
        { reason: "done", targetUserId: member.user.id },
        authHeaders(moderator),
      ),
    );
    expect(disconnectResponse.status).toBe(200);
    expect(app.repository.voiceStates).toHaveLength(0);
    expect(app.mediaProvider.disconnectedParticipants.at(-1)).toMatchObject({
      userId: member.user.id,
    });
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain(
      "VOICE_DISCONNECT",
    );
  });

  it("rejects voice moderation when channel overrides remove actor visibility", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    const moderatorRole = addWorkspaceMember(
      app.repository,
      workspace.id,
      moderator.user.id,
      "moderator",
    );
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const channel = await createChannel(app, owner, workspace.id, ChannelType.VOICE);

    expect(await joinVoice(app, member, channel.id)).toHaveProperty("status", 200);
    await putOverride(app, owner, channel.id, "role", moderatorRole.id, {
      allow: serializePermissionMask(Permission.MUTE_MEMBERS, Permission.DISCONNECT_MEMBERS),
      deny: serializePermissionMask(Permission.VIEW_CHANNEL),
    });

    const muteDenied = await postVoiceModeration(app, moderator, workspace.id, "server-mute", {
      enabled: true,
      targetUserId: member.user.id,
    });
    expect(muteDenied.status).toBe(403);

    const disconnectDenied = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/voice/disconnect`,
        { reason: "hidden", targetUserId: member.user.id },
        authHeaders(moderator),
      ),
    );
    expect(disconnectDenied.status).toBe(403);
  });

  it("lists audit log entries for users with VIEW_AUDIT_LOG", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const moderator = await register(app, "moderator@example.com");
    const member = await register(app, "member@example.com");
    const workspace = await createWorkspace(app, owner);
    addWorkspaceMember(app.repository, workspace.id, moderator.user.id, "moderator");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    await postMemberModeration(app, moderator, workspace.id, member.user.id, "kick", {});
    const response = await app.handler(
      new Request(`http://local.test/api/v1/workspaces/${workspace.id}/audit-log?limit=10`, {
        headers: { cookie: moderator.cookie },
      }),
    );
    const body = (await response.json()) as { entries: PublicAuditLogEntry[] };

    expect(response.status).toBe(200);
    expect(body.entries.some((entry) => entry.event === "MEMBER_KICK")).toBe(true);
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
  const moderationService = new ModerationService({
    channelService,
    mediaProvider,
    repository,
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
    moderationService,
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

async function postMemberModeration(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  targetUserId: string,
  action: "ban" | "kick" | "timeout" | "unban",
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handler(
    jsonRequest(
      `/api/v1/workspaces/${workspaceId}/members/${targetUserId}/${action}`,
      body,
      authHeaders(session),
    ),
  );
}

async function postVoiceModeration(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  action: "server-deafen" | "server-mute",
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handler(
    jsonRequest(`/api/v1/workspaces/${workspaceId}/voice/${action}`, body, authHeaders(session)),
  );
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
