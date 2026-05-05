import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocketServer } from "ws";

import type { GatewayService } from "./service.js";

export interface GatewayWebSocketUpgradeHandler {
  canHandle(incoming: IncomingMessage): boolean;
  handle(incoming: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export function createGatewayWebSocketUpgradeHandler(
  gatewayService: GatewayService,
): GatewayWebSocketUpgradeHandler {
  const webSocketServer = new WebSocketServer({ noServer: true });

  return {
    canHandle: (incoming) => matchGatewayPath(incoming),
    handle: (incoming, socket, head) => {
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
