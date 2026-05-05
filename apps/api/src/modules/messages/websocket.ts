import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";

import type { ApiConfig } from "../../config/env.js";
import { readRequestToken } from "../../security/request-auth.js";
import type { AuthService } from "../auth/service.js";
import type { InMemoryMessageEventHub } from "./events.js";
import type { MessageService } from "./service.js";

export interface MessageWebSocketOptions {
  readonly authService: AuthService;
  readonly config: Pick<ApiConfig, "sessionCookieName">;
  readonly eventHub: InMemoryMessageEventHub;
  readonly messageService: MessageService;
}

export function installMessageWebSocketServer(
  server: Server,
  options: MessageWebSocketOptions,
): void {
  const webSocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (incoming, socket, head) => {
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`);
    const channelId = matchMessageSocketPath(url.pathname);
    if (!channelId) {
      rejectUpgrade(socket, 404);
      return;
    }

    const userId = await authenticateUpgrade(incoming, options).catch(() => null);
    if (!userId || !(await options.messageService.canReceiveMessageEvents(channelId, userId))) {
      rejectUpgrade(socket, 401);
      return;
    }

    webSocketServer.handleUpgrade(incoming, socket, head, (webSocket) => {
      const unsubscribe = options.eventHub.subscribe({
        canReceive: () => options.messageService.canReceiveMessageEvents(channelId, userId),
        channelId,
        send: (envelope) => {
          if (webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(JSON.stringify(envelope));
          }
        },
      });

      webSocket.on("close", unsubscribe);
      webSocket.on("error", unsubscribe);
    });
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

function rejectUpgrade(socket: Duplex, statusCode: 401 | 404): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusCode === 401 ? "Unauthorized" : "Not Found"}\r\n\r\n`,
  );
  socket.destroy();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
