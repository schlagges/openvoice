import { randomUUID } from "node:crypto";

import {
  MessageEventType,
  Permission,
  serializePermissionMask,
  type GatewayDispatchEnvelope,
  type Message,
} from "@openvoice/shared";
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
  public async hashPassword(password: string): Promise<string> {
    return `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }

  public async verifyPassword(hash: string, password: string): Promise<boolean> {
    return hash === `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }
}

interface TestApp {
  readonly eventHub: InMemoryMessageEventHub;
  readonly handler: (request: Request) => Promise<Response>;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

describe("Phase 3 message API", () => {
  it("creates, lists, edits, soft-deletes, de-duplicates, and dispatches message events", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const channel = await createChannel(app, owner, workspace.id, {
      name: "General",
      type: "text",
    });
    const events: Array<GatewayDispatchEnvelope<Message>> = [];
    const unsubscribe = app.eventHub.subscribe({
      canReceive: async () => true,
      channelId: channel.id,
      send: (event) => events.push(event),
    });

    const createResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: `**hi** <script>alert(1)</script> [ok](https://example.com)`,
        },
        authHeaders(owner),
      ),
    );
    const createBody = (await createResponse.json()) as {
      duplicate: boolean;
      message: Message;
    };

    expect(createResponse.status).toBe(201);
    expect(createBody.duplicate).toBe(false);
    expect(createBody.message.content).toContain("&lt;script&gt;");
    expect(events.map((event) => event.t)).toEqual([MessageEventType.CREATE]);

    const duplicateResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/messages`,
        {
          clientMessageId: createBody.message.clientMessageId,
          content: "duplicate",
        },
        authHeaders(owner),
      ),
    );
    const duplicateBody = (await duplicateResponse.json()) as { duplicate: boolean };
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateBody.duplicate).toBe(true);
    expect(app.repository.messages).toHaveLength(1);

    const historyResponse = await app.handler(
      new Request(`http://local.test/api/v1/channels/${channel.id}/messages?limit=1`, {
        headers: {
          cookie: owner.cookie,
        },
      }),
    );
    const historyBody = (await historyResponse.json()) as { messages: Message[] };
    expect(historyResponse.status).toBe(200);
    expect(historyBody.messages.map((message) => message.id)).toEqual([createBody.message.id]);

    const updateResponse = await app.handler(
      patchRequest(
        `/api/v1/messages/${createBody.message.id}`,
        { content: "`edited`", contentFormat: "markdown" },
        authHeaders(owner),
      ),
    );
    const updateBody = (await updateResponse.json()) as { message: Message };
    expect(updateResponse.status).toBe(200);
    expect(updateBody.message.editedAt).toBeTruthy();
    expect(events.map((event) => event.t)).toContain(MessageEventType.UPDATE);

    const deleteResponse = await app.handler(
      new Request(`http://local.test/api/v1/messages/${createBody.message.id}`, {
        headers: authHeaders(owner),
        method: "DELETE",
      }),
    );
    const deleteBody = (await deleteResponse.json()) as { message: Message };
    expect(deleteResponse.status).toBe(200);
    expect(deleteBody.message.deletedAt).toBeTruthy();
    expect(deleteBody.message.content).toBe("");
    expect(app.repository.auditLogEntries.map((entry) => entry.event)).toContain("MESSAGE_DELETE");
    expect(events.map((event) => event.t)).toContain(MessageEventType.DELETE);

    unsubscribe();
  });

  it("lets an invite guest use chat in the invited workspace", async () => {
    const app = createTestApp();
    const owner = await register(app, "invite-chat-owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const channel = await createChannel(app, owner, workspace.id, {
      name: "Windfang",
      type: "combined",
    });
    const invite = await createInvite(app, owner, workspace.id);
    const guestJoinResponse = await app.handler(
      jsonRequest(`/api/v1/invites/${invite.code}/guest-join`, {
        displayName: "Guest Chat",
      }),
    );
    const guestJoinBody = (await guestJoinResponse.json()) as { accessToken: string };

    expect(guestJoinResponse.status).toBe(200);
    expect(guestJoinBody.accessToken).toBeTruthy();

    const createResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${channel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: "guest can chat from invite link",
        },
        { Authorization: `Bearer ${guestJoinBody.accessToken}` },
      ),
    );
    const createBody = (await createResponse.json()) as { message: Message };

    expect(createResponse.status).toBe(201);
    expect(createBody.message.content).toBe("guest can chat from invite link");

    const historyResponse = await app.handler(
      new Request(`http://local.test/api/v1/channels/${channel.id}/messages`, {
        headers: { Authorization: `Bearer ${guestJoinBody.accessToken}` },
      }),
    );
    const historyBody = (await historyResponse.json()) as { messages: Message[] };

    expect(historyResponse.status).toBe(200);
    expect(historyBody.messages.map((message) => message.content)).toContain(
      "guest can chat from invite link",
    );
  });

  it("enforces channel type, message permissions, and send rate limits", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const textChannel = await createChannel(app, owner, workspace.id, {
      name: "General",
      type: "text",
    });
    const voiceChannel = await createChannel(app, owner, workspace.id, {
      name: "Voice",
      type: "voice",
    });
    const member = await register(app, "member@example.com");
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    const invalidChannelResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${voiceChannel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: "no chat here",
        },
        authHeaders(owner),
      ),
    );
    expect(invalidChannelResponse.status).toBe(400);

    await putOverride(app, owner, textChannel.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY),
    });

    const sendDeniedResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${textChannel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: "blocked",
        },
        authHeaders(member),
      ),
    );
    expect(sendDeniedResponse.status).toBe(403);

    const historyDeniedResponse = await app.handler(
      new Request(`http://local.test/api/v1/channels/${textChannel.id}/messages`, {
        headers: {
          cookie: member.cookie,
        },
      }),
    );
    expect(historyDeniedResponse.status).toBe(403);

    const created = await createMessage(app, owner, textChannel.id, "owner message");
    const deleteDeniedResponse = await app.handler(
      new Request(`http://local.test/api/v1/messages/${created.id}`, {
        headers: authHeaders(member),
        method: "DELETE",
      }),
    );
    expect(deleteDeniedResponse.status).toBe(403);

    const rateChannel = await createChannel(app, owner, workspace.id, {
      name: "Rate Limit",
      type: "text",
    });
    for (let index = 0; index < 10; index += 1) {
      const response = await app.handler(
        jsonRequest(
          `/api/v1/channels/${rateChannel.id}/messages`,
          {
            clientMessageId: randomUUID(),
            content: `message ${index}`,
          },
          authHeaders(owner),
        ),
      );
      expect(response.status).toBe(201);
    }

    const limitedResponse = await app.handler(
      jsonRequest(
        `/api/v1/channels/${rateChannel.id}/messages`,
        {
          clientMessageId: randomUUID(),
          content: "limited",
        },
        authHeaders(owner),
      ),
    );
    expect(limitedResponse.status).toBe(429);
  });

  it("rejects edits when a channel override removes VIEW_CHANNEL", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const channel = await createChannel(app, owner, workspace.id, {
      name: "Private Later",
      type: "text",
    });
    const member = await register(app, "member@example.com");
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const message = await createMessage(app, member, channel.id, "visible before override");

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.VIEW_CHANNEL),
    });

    const editResponse = await app.handler(
      patchRequest(
        `/api/v1/messages/${message.id}`,
        { content: "edited after hidden", contentFormat: "markdown" },
        authHeaders(member),
      ),
    );
    expect(editResponse.status).toBe(403);
  });
});

function createTestApp(): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
  const eventHub = new InMemoryMessageEventHub();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher: new TestPasswordHasher(),
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const channelService = new ChannelService({ repository });
  const messageService = new MessageService({
    channelService,
    eventPublisher: eventHub,
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

  return { eventHub, handler, repository };
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

  return body.workspace;
}

async function createChannel(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  body: { readonly name: string; readonly type: string },
): Promise<{ readonly id: string }> {
  const response = await app.handler(
    jsonRequest(`/api/v1/workspaces/${workspaceId}/channels`, body, authHeaders(session)),
  );
  const responseBody = (await response.json()) as { channel: { id: string } };

  expect(response.status).toBe(201);
  return responseBody.channel;
}

async function createInvite(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
): Promise<{ readonly code: string }> {
  const response = await app.handler(
    jsonRequest(`/api/v1/workspaces/${workspaceId}/invites`, {}, authHeaders(session)),
  );
  const body = (await response.json()) as { code: string };

  expect(response.status).toBe(201);
  return body;
}

async function createMessage(
  app: TestApp,
  session: TestSession,
  channelId: string,
  content: string,
): Promise<Message> {
  const response = await app.handler(
    jsonRequest(
      `/api/v1/channels/${channelId}/messages`,
      {
        clientMessageId: randomUUID(),
        content,
      },
      authHeaders(session),
    ),
  );
  const body = (await response.json()) as { message: Message };

  expect(response.status).toBe(201);
  return body.message;
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

function patchRequest(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`http://local.test${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "PATCH",
  });
}
