import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";

import {
  GatewayOp,
  Permission,
  PresenceStatus,
  serializePermissionMask,
  ServerGatewayEventType,
  type GatewayEnvelope,
} from "@openvoice/shared";
import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import {
  CompositeMessageEventPublisher,
  GatewayMessageEventPublisher,
} from "../src/modules/gateway/events.js";
import { InMemoryPresenceStore } from "../src/modules/gateway/presence.js";
import { InMemoryGatewayPubSub } from "../src/modules/gateway/pubsub.js";
import { GatewayService } from "../src/modules/gateway/service.js";
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
  readonly gatewayService: GatewayService;
  readonly handler: (request: Request) => Promise<Response>;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

type GatewaySocket = TestWebSocket & { ready: ExtractReadyPayload };

const sockets: TestWebSocket[] = [];

afterEach(async () => {
  await Promise.all(sockets.splice(0).map((socket) => closeSocket(socket)));
});

describe("Phase 4 gateway and presence", () => {
  it("dispatches channel and message events only to visible channel viewers", async () => {
    const app = await createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const member = await register(app, "member@example.com");
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const ownerGateway = await connectGateway(app, owner);
    const memberGateway = await connectGateway(app, member);

    const channel = await createChannel(app, owner, workspace.id, {
      name: "General",
      type: "text",
    });
    const ownerChannel = await waitForDispatch(ownerGateway, ServerGatewayEventType.CHANNEL_CREATE);
    const memberChannel = await waitForDispatch(
      memberGateway,
      ServerGatewayEventType.CHANNEL_CREATE,
    );
    expect(ownerChannel.d).toMatchObject({ channel: { id: channel.id } });
    expect(memberChannel.d).toMatchObject({ channel: { id: channel.id } });

    await createMessage(app, owner, channel.id, "hello everyone");
    expect(
      (await waitForDispatch(ownerGateway, ServerGatewayEventType.MESSAGE_CREATE)).d,
    ).toMatchObject({
      channelId: channel.id,
    });
    expect(
      (await waitForDispatch(memberGateway, ServerGatewayEventType.MESSAGE_CREATE)).d,
    ).toMatchObject({
      channelId: channel.id,
    });

    await putOverride(app, owner, channel.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.VIEW_CHANNEL),
    });
    await waitForDispatch(memberGateway, ServerGatewayEventType.PERMISSION_UPDATE);

    await createMessage(app, owner, channel.id, "hidden");
    await waitForDispatch(ownerGateway, ServerGatewayEventType.MESSAGE_CREATE);
    await expectNoDispatch(memberGateway, ServerGatewayEventType.MESSAGE_CREATE, 150);
  });

  it("sends HELLO, READY, heartbeat acknowledgements, and offline presence on timeout", async () => {
    const app = await createTestApp({ heartbeatIntervalMs: 30 });
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const member = await register(app, "member@example.com");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");
    const ownerGateway = await connectGateway(app, owner);
    const stopOwnerHeartbeat = startHeartbeat(ownerGateway);

    ownerGateway.clientSend({ op: GatewayOp.HEARTBEAT });
    expect((await waitForOp(ownerGateway, GatewayOp.HEARTBEAT_ACK)).op).toBe(
      GatewayOp.HEARTBEAT_ACK,
    );

    const memberGateway = await connectGateway(app, member);
    expect(memberGateway.ready.resumeToken).toBeTruthy();
    expect(memberGateway.ready.workspaces.map((candidate) => candidate.id)).toEqual([workspace.id]);
    expect(
      (await waitForPresence(ownerGateway, member.user.id, PresenceStatus.ONLINE)).d,
    ).toMatchObject({ status: PresenceStatus.ONLINE, userId: member.user.id });

    await waitForClose(memberGateway);
    expect(
      (await waitForPresence(ownerGateway, member.user.id, PresenceStatus.OFFLINE)).d,
    ).toMatchObject({ status: PresenceStatus.OFFLINE, userId: member.user.id });

    stopOwnerHeartbeat();
  });
});

async function createTestApp(
  options: { readonly heartbeatIntervalMs?: number } = {},
): Promise<TestApp> {
  const repository = new InMemoryOpenVoiceRepository();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher: new TestPasswordHasher(),
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const pubSub = new InMemoryGatewayPubSub();
  const channelService = new ChannelService({ eventPublisher: pubSub, repository });
  const workspaceService = new WorkspaceService({ eventPublisher: pubSub, repository });
  const messageEventHub = new InMemoryMessageEventHub();
  const messageService = new MessageService({
    channelService,
    eventPublisher: new CompositeMessageEventPublisher([
      messageEventHub,
      new GatewayMessageEventPublisher(pubSub),
    ]),
    repository,
  });
  const handler = createApiHandler({
    authService,
    channelService,
    config: {
      sessionCookieName: "openvoice_session",
      sessionCookieSecure: false,
      sessionTtlSeconds: 3600,
    },
    messageService,
    workspaceService,
  });
  const gatewayService = new GatewayService({
    authService,
    channelService,
    config: { sessionCookieName: "openvoice_session" },
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    presenceStore: new InMemoryPresenceStore(),
    pubSub,
    workspaceService,
  });
  return { gatewayService, handler, repository };
}

async function connectGateway(app: TestApp, session: TestSession): Promise<GatewaySocket> {
  const socket = new TestWebSocket() as GatewaySocket;
  sockets.push(socket);
  app.gatewayService.accept(socket.asWebSocket(), {
    headers: {
      cookie: session.cookie,
      host: "local.test",
    },
    url: "/api/v1/gateway",
  } as IncomingMessage);

  const hello = await waitForOp(socket, GatewayOp.HELLO);
  expect(hello.d).toMatchObject({ heartbeatIntervalMs: expect.any(Number) });
  socket.clientSend({ op: GatewayOp.IDENTIFY });
  const ready = await waitForOp(socket, GatewayOp.READY);
  socket.ready = ready.d as ExtractReadyPayload;
  return socket;
}

type ExtractReadyPayload = {
  readonly resumeToken: string;
  readonly workspaces: readonly Array<{ readonly id: string }>;
};

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

async function createMessage(
  app: TestApp,
  session: TestSession,
  channelId: string,
  content: string,
): Promise<void> {
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

  expect(response.status).toBe(201);
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

async function waitForOp(socket: TestWebSocket, op: GatewayOp): Promise<GatewayEnvelope> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const message = await nextGatewayMessage(socket, deadline - Date.now());
    if (message.op === op) {
      return message;
    }
  }

  throw new Error(`Timed out waiting for ${op}.`);
}

async function waitForDispatch(
  socket: TestWebSocket,
  eventType: ServerGatewayEventType,
): Promise<GatewayEnvelope> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const message = await nextGatewayMessage(socket, deadline - Date.now());
    if (message.op === GatewayOp.DISPATCH && message.t === eventType) {
      return message;
    }
  }

  throw new Error(`Timed out waiting for ${eventType}.`);
}

async function waitForPresence(
  socket: TestWebSocket,
  userId: string,
  status: PresenceStatus,
): Promise<GatewayEnvelope> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const message = await waitForDispatch(socket, ServerGatewayEventType.PRESENCE_UPDATE);
    const payload = message.d as { readonly status?: string; readonly userId?: string };
    if (payload.userId === userId && payload.status === status) {
      return message;
    }
  }

  throw new Error(`Timed out waiting for ${status} presence.`);
}

async function expectNoDispatch(
  socket: TestWebSocket,
  eventType: ServerGatewayEventType,
  durationMs: number,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const message = await nextGatewayMessage(socket, deadline - Date.now()).catch(() => null);
    if (!message) {
      return;
    }

    if (message.op === GatewayOp.DISPATCH && message.t === eventType) {
      throw new Error(`Received unexpected ${eventType}.`);
    }
  }
}

function nextGatewayMessage(socket: TestWebSocket, timeoutMs: number): Promise<GatewayEnvelope> {
  return new Promise((resolve, reject) => {
    const queued = socket.shiftSent();
    if (queued) {
      resolve(JSON.parse(queued) as GatewayEnvelope);
      return;
    }

    const timeout = setTimeout(
      () => {
        cleanup();
        reject(new Error("Timed out waiting for gateway message."));
      },
      Math.max(1, timeoutMs),
    );
    const onSent = () => {
      const data = socket.shiftSent();
      if (!data) {
        return;
      }

      cleanup();
      resolve(JSON.parse(data) as GatewayEnvelope);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("sent", onSent);
      socket.off("error", onError);
    };

    socket.once("sent", onSent);
    socket.once("error", onError);
  });
}

function startHeartbeat(socket: TestWebSocket): () => void {
  const timer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.clientSend({ op: GatewayOp.HEARTBEAT });
    }
  }, 10);

  return () => clearInterval(timer);
}

function waitForClose(socket: TestWebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once("close", () => resolve());
  });
}

function closeSocket(socket: TestWebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
}

class TestWebSocket extends EventEmitter {
  public readyState = WebSocket.OPEN;
  private readonly sent: string[] = [];

  public asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }

  public send(data: string): void {
    this.sent.push(data);
    this.emit("sent");
  }

  public clientSend(data: GatewayEnvelope): void {
    this.emit("message", Buffer.from(JSON.stringify(data)));
  }

  public shiftSent(): string | null {
    return this.sent.shift() ?? null;
  }

  public close(): void {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}
