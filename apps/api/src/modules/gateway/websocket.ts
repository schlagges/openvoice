import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocketServer } from "ws";

import type { ApiConfig } from "../../config/env.js";
import { getClientAddressFromIncoming } from "../../http/client-ip.js";
import { isTrustedHttpOrigin } from "../../http/security.js";
import { InMemoryRateLimiter } from "../../security/rate-limit.js";
import type { GatewayService } from "./service.js";

export interface GatewayWebSocketUpgradeHandler {
  canHandle(incoming: IncomingMessage): boolean;
  handle(incoming: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export function createGatewayWebSocketUpgradeHandler(
  gatewayService: GatewayService,
  config: Pick<ApiConfig, "corsAllowedOrigins" | "sessionCookieName"> & {
    readonly trustedProxyIps?: readonly string[];
  },
): GatewayWebSocketUpgradeHandler {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const rateLimiter = new InMemoryRateLimiter();

  return {
    canHandle: (incoming) => matchGatewayPath(incoming),
    handle: (incoming, socket, head) => {
      if (!isTrustedWebSocketOrigin(incoming, config)) {
        rejectUpgrade(socket, 403);
        return;
      }

      try {
        rateLimiter.assertAllowed(
          `gateway:upgrade:${getClientAddressFromIncoming(incoming, config)}`,
          {
            capacity: 30,
            refillAmount: 30,
            refillIntervalMs: 60_000,
          },
        );
      } catch {
        rejectUpgrade(socket, 429);
        return;
      }

      webSocketServer.handleUpgrade(incoming, socket, head, (webSocket) => {
        gatewayService.accept(webSocket, incoming);
      });
    },
  };
}

function matchGatewayPath(incoming: IncomingMessage): boolean {
  const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`);
  return url.pathname === "/api/v1/gateway";
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

function rejectUpgrade(socket: Duplex, statusCode: 403 | 429): void {
  const reason = statusCode === 403 ? "Forbidden" : "Too Many Requests";
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\n\r\n`);
  socket.destroy();
}
