import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";

import type { ApiConfig } from "../../config/env.js";
import { getClientAddressFromIncoming } from "../../http/client-ip.js";
import { isTrustedHttpOrigin } from "../../http/security.js";
import { readRequestToken } from "../../security/request-auth.js";
import { InMemoryRateLimiter } from "../../security/rate-limit.js";
import type { AuthService } from "../auth/service.js";
import type { InMemoryMessageEventHub } from "./events.js";
import type { MessageService } from "./service.js";

const MESSAGE_SOCKET_HEARTBEAT_MS = 30_000;

export interface MessageWebSocketOptions {
  readonly authService: AuthService;
  readonly config: Pick<ApiConfig, "corsAllowedOrigins" | "sessionCookieName"> & {
    readonly rateLimitsEnabled?: boolean | undefined;
    readonly trustedProxyIps?: readonly string[];
  };
  readonly eventHub: InMemoryMessageEventHub;
  readonly messageService: MessageService;
}

export interface MessageWebSocketUpgradeHandler {
  canHandle(incoming: IncomingMessage): boolean;
  handle(incoming: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export function installMessageWebSocketServer(
  server: Server,
  options: MessageWebSocketOptions,
): void {
  const handler = createMessageWebSocketUpgradeHandler(options);
  server.on("upgrade", (incoming, socket, head) => {
    if (!handler.canHandle(incoming)) {
      rejectUpgrade(socket, 404);
      return;
    }

    handler.handle(incoming, socket, head);
  });
}

export function createMessageWebSocketUpgradeHandler(
  options: MessageWebSocketOptions,
): MessageWebSocketUpgradeHandler {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const rateLimiter = new InMemoryRateLimiter({ enabled: options.config.rateLimitsEnabled });

  return {
    canHandle: (incoming) => matchMessageSocketPath(readPathname(incoming)) !== null,
    handle: (incoming, socket, head) => {
      void handleMessageSocketUpgrade(
        webSocketServer,
        options,
        rateLimiter,
        incoming,
        socket,
        head,
      );
    },
  };
}

async function handleMessageSocketUpgrade(
  webSocketServer: WebSocketServer,
  options: MessageWebSocketOptions,
  rateLimiter: InMemoryRateLimiter,
  incoming: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const channelId = matchMessageSocketPath(readPathname(incoming));
  if (!channelId) {
    rejectUpgrade(socket, 404);
    return;
  }

  if (!isTrustedWebSocketOrigin(incoming, options.config)) {
    rejectUpgrade(socket, 403);
    return;
  }

  try {
    rateLimiter.assertAllowed(
      `message-ws:upgrade:${getClientAddressFromIncoming(incoming, options.config)}`,
      {
        capacity: 60,
        refillAmount: 60,
        refillIntervalMs: 60_000,
      },
    );
  } catch {
    rejectUpgrade(socket, 429);
    return;
  }

  const userId = await authenticateUpgrade(incoming, options).catch(() => null);
  if (!userId || !(await options.messageService.canReceiveMessageEvents(channelId, userId))) {
    rejectUpgrade(socket, 401);
    return;
  }

  webSocketServer.handleUpgrade(incoming, socket, head, (webSocket) => {
    let alive = true;
    const unsubscribe = options.eventHub.subscribe({
      canReceive: () => options.messageService.canReceiveMessageEvents(channelId, userId),
      channelId,
      send: (envelope) => {
        if (webSocket.readyState === WebSocket.OPEN) {
          webSocket.send(JSON.stringify(envelope));
        }
      },
    });

    const heartbeat = setInterval(() => {
      if (!alive) {
        webSocket.terminate();
        return;
      }

      alive = false;
      webSocket.ping();
    }, MESSAGE_SOCKET_HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    webSocket.on("pong", () => {
      alive = true;
    });
    webSocket.on("close", cleanup);
    webSocket.on("error", cleanup);
  });
}

async function authenticateUpgrade(
  incoming: IncomingMessage,
  options: MessageWebSocketOptions,
): Promise<string | null> {
  const request = new Request(
    `http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
    {
      headers: incoming.headers as HeadersInit,
      method: "GET",
    },
  );
  const token = readRequestToken(request, options.config.sessionCookieName);
  if (!token) {
    return null;
  }

  const authResult = await options.authService.authenticate(token.token);
  return authResult?.user.id ?? null;
}

function matchMessageSocketPath(pathname: string): string | null {
  const match = /^\/api\/v1\/channels\/([^/]+)\/messages\/ws$/.exec(pathname);
  const channelId = match?.[1];
  if (!channelId || !isUuid(channelId)) {
    return null;
  }

  return channelId;
}

function readPathname(incoming: IncomingMessage): string {
  const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`);
  return url.pathname;
}

function rejectUpgrade(socket: Duplex, statusCode: 401 | 403 | 404 | 429): void {
  const reason =
    statusCode === 401
      ? "Unauthorized"
      : statusCode === 403
        ? "Forbidden"
        : statusCode === 429
          ? "Too Many Requests"
          : "Not Found";
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\n\r\n`);
  socket.destroy();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTrustedWebSocketOrigin(
  incoming: IncomingMessage,
  config: Pick<ApiConfig, "corsAllowedOrigins" | "sessionCookieName">,
): boolean {
  const origin = readHeader(incoming, "origin");
  if (origin) {
    return isTrustedHttpOrigin(origin, config);
  }

  return !hasCookieAuth(incoming, config.sessionCookieName);
}

function hasCookieAuth(incoming: IncomingMessage, cookieName: string): boolean {
  const cookie = readHeader(incoming, "cookie");
  return Boolean(cookie?.split(";").some((part) => part.trim().startsWith(`${cookieName}=`)));
}

function readHeader(incoming: IncomingMessage, name: string): string | null {
  const value = incoming.headers[name];
  return typeof value === "string" ? value : null;
}
