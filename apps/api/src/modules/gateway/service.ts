import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import {
  ClientGatewayEventType,
  GatewayOp,
  isPresenceStatus,
  Permission,
  PresenceStatus,
  ServerGatewayEventType,
  type GatewayEnvelope,
  type GatewayErrorPayload,
  type GatewayIdentifyPayload,
  type GatewayReadyPayload,
  type PresenceUpdatePayload,
} from "@openvoice/shared";
import { WebSocket } from "ws";

import type { ApiConfig } from "../../config/env.js";
import { readRequestToken } from "../../security/request-auth.js";
import { AuthService, toPublicUser } from "../auth/service.js";
import type { ChannelService } from "../channels/service.js";
import type { OpenVoiceMetrics } from "../observability/metrics.js";
import type { WorkspaceService } from "../workspaces/service.js";
import type { GatewayEvent, GatewayEventPubSub } from "./events.js";
import type { PresenceStore } from "./presence.js";

export interface GatewayServiceOptions {
  readonly authService: AuthService;
  readonly channelService: ChannelService;
  readonly config: Pick<ApiConfig, "sessionCookieName">;
  readonly heartbeatIntervalMs?: number;
  readonly metrics?: OpenVoiceMetrics;
  readonly presenceStore: PresenceStore;
  readonly pubSub: GatewayEventPubSub;
  readonly resumeTimeoutMs?: number;
  readonly workspaceService: WorkspaceService;
}

interface GatewayConnection {
  readonly connectionId: string;
  readonly initialToken: string | null;
  readonly webSocket: WebSocket;
  heartbeatTimer: NodeJS.Timeout | null;
  identified: boolean;
  lastHeartbeatAt: number;
  resumeToken: string | null;
  sequence: number;
  status: PresenceStatus;
  userId: string | null;
  workspaceIds: readonly string[];
}

interface ResumeSession {
  readonly expiresAt: number;
  readonly resumeToken: string;
  readonly sequence: number;
  readonly status: PresenceStatus;
  readonly userId: string;
  readonly workspaceIds: readonly string[];
}

export class GatewayService {
  private readonly authService: AuthService;
  private readonly channelService: ChannelService;
  private readonly config: Pick<ApiConfig, "sessionCookieName">;
  private readonly connections = new Map<string, GatewayConnection>();
  private readonly heartbeatIntervalMs: number;
  private readonly metrics: OpenVoiceMetrics | null;
  private readonly presenceStore: PresenceStore;
  private readonly pubSub: GatewayEventPubSub;
  private readonly resumeSessions = new Map<string, ResumeSession>();
  private readonly resumeTimeoutMs: number;
  private readonly workspaceService: WorkspaceService;

  public constructor(options: GatewayServiceOptions) {
    this.authService = options.authService;
    this.channelService = options.channelService;
    this.config = options.config;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25_000;
    this.metrics = options.metrics ?? null;
    this.presenceStore = options.presenceStore;
    this.pubSub = options.pubSub;
    this.resumeTimeoutMs = options.resumeTimeoutMs ?? 60_000;
    this.workspaceService = options.workspaceService;
    this.pubSub.subscribe((event) => this.dispatchGatewayEvent(event));
  }

  public accept(webSocket: WebSocket, incoming: IncomingMessage): void {
    const connection: GatewayConnection = {
      connectionId: randomUUID(),
      heartbeatTimer: null,
      identified: false,
      initialToken: readInitialToken(incoming, this.config.sessionCookieName),
      lastHeartbeatAt: Date.now(),
      resumeToken: null,
      sequence: 0,
      status: PresenceStatus.ONLINE,
      userId: null,
      webSocket,
      workspaceIds: [],
    };
    this.connections.set(connection.connectionId, connection);
    this.metrics?.recordGatewayConnectionCount(this.connections.size);

    this.send(connection, {
      d: {
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        resumeTimeoutMs: this.resumeTimeoutMs,
      },
      op: GatewayOp.HELLO,
    });

    const identifyTimer = setTimeout(() => {
      if (!connection.identified) {
        this.sendError(connection, "IDENTIFY_TIMEOUT", "Gateway identify timed out.");
        webSocket.close(4001, "identify timeout");
      }
    }, this.heartbeatIntervalMs);

    webSocket.on("message", (data) => {
      void this.handleIncomingMessage(connection, data.toString());
    });
    webSocket.on("close", () => {
      clearTimeout(identifyTimer);
      void this.disconnect(connection);
    });
    webSocket.on("error", () => {
      clearTimeout(identifyTimer);
      void this.disconnect(connection);
    });
  }

  public get activeConnectionCount(): number {
    return this.connections.size;
  }

  private async handleIncomingMessage(connection: GatewayConnection, raw: string): Promise<void> {
    const envelope = parseGatewayEnvelope(raw);
    if (!envelope) {
      this.sendError(connection, "BAD_PAYLOAD", "Gateway payload must be a JSON object.");
      return;
    }

    if (envelope.op === GatewayOp.IDENTIFY) {
      await this.identify(connection, envelope.d);
      return;
    }

    if (!connection.identified || !connection.userId) {
      this.sendError(connection, "NOT_IDENTIFIED", "Gateway connection is not identified.");
      return;
    }

    if (envelope.op === GatewayOp.HEARTBEAT) {
      connection.lastHeartbeatAt = Date.now();
      await this.refreshPresence(connection);
      this.send(connection, {
        d: { acknowledgedAt: new Date().toISOString() },
        op: GatewayOp.HEARTBEAT_ACK,
        s: connection.sequence,
      });
      return;
    }

    if (
      envelope.op === GatewayOp.DISPATCH &&
      envelope.t === ClientGatewayEventType.PRESENCE_UPDATE
    ) {
      await this.updatePresence(connection, envelope.d);
      return;
    }

    this.sendError(connection, "UNSUPPORTED_OP", "Gateway operation is not supported.");
  }

  private async identify(connection: GatewayConnection, payload: unknown): Promise<void> {
    if (connection.identified) {
      this.sendError(connection, "ALREADY_IDENTIFIED", "Gateway connection is already identified.");
      return;
    }

    const identifyPayload = parseIdentifyPayload(payload);
    const sessionToken = identifyPayload.sessionToken ?? connection.initialToken;
    if (!sessionToken) {
      this.sendError(connection, "UNAUTHORIZED", "Gateway identify requires a session token.");
      connection.webSocket.close(4003, "unauthorized");
      return;
    }

    const authResult = await this.authService.authenticate(sessionToken);
    if (!authResult) {
      this.sendError(connection, "UNAUTHORIZED", "Gateway session is invalid.");
      connection.webSocket.close(4003, "unauthorized");
      return;
    }

    const workspaces = await this.workspaceService.listWorkspacesForUser(authResult.user.id);
    const workspaceIds = workspaces.map((workspace) => workspace.id);
    const resumeSession = identifyPayload.resumeToken
      ? this.resumeSessions.get(identifyPayload.resumeToken)
      : null;
    const resumed =
      !!resumeSession &&
      resumeSession.userId === authResult.user.id &&
      resumeSession.expiresAt > Date.now();

    connection.identified = true;
    connection.userId = authResult.user.id;
    connection.workspaceIds = workspaceIds;
    connection.resumeToken = resumed && resumeSession ? resumeSession.resumeToken : randomUUID();
    connection.sequence = resumed && resumeSession ? resumeSession.sequence : 0;
    connection.status = resumed && resumeSession ? resumeSession.status : PresenceStatus.ONLINE;
    connection.lastHeartbeatAt = Date.now();
    connection.heartbeatTimer = setInterval(() => {
      void this.checkHeartbeat(connection);
    }, this.heartbeatIntervalMs);

    const presenceResult = await this.presenceStore.addConnection({
      connectionId: connection.connectionId,
      status: connection.status,
      ttlMs: this.presenceTtlMs,
      userId: authResult.user.id,
      workspaceIds,
    });

    const ready: GatewayReadyPayload = {
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      resumeToken: connection.resumeToken,
      resumed,
      user: toPublicUser(authResult.user),
      workspaces,
    };
    this.send(connection, {
      d: ready,
      op: GatewayOp.READY,
      s: connection.sequence,
    });

    await Promise.all(
      presenceResult.onlineWorkspaceIds.map((workspaceId) =>
        this.publishPresence(workspaceId, authResult.user.id, connection.status),
      ),
    );
  }

  private async updatePresence(connection: GatewayConnection, payload: unknown): Promise<void> {
    if (!connection.userId) {
      return;
    }

    const status = parsePresenceUpdatePayload(payload);
    if (!status) {
      this.sendError(connection, "BAD_PRESENCE", "Presence status is invalid.");
      return;
    }

    if (status === PresenceStatus.OFFLINE) {
      this.sendError(connection, "BAD_PRESENCE", "Clients cannot set offline presence.");
      return;
    }

    connection.status = status;
    await this.presenceStore.updateConnectionStatus({
      connectionId: connection.connectionId,
      status,
      ttlMs: this.presenceTtlMs,
      userId: connection.userId,
      workspaceIds: connection.workspaceIds,
    });
    await Promise.all(
      connection.workspaceIds.map((workspaceId) =>
        this.publishPresence(workspaceId, connection.userId ?? "", status),
      ),
    );
  }

  private async disconnect(connection: GatewayConnection): Promise<void> {
    if (!this.connections.has(connection.connectionId)) {
      return;
    }

    this.connections.delete(connection.connectionId);
    this.metrics?.recordGatewayConnectionCount(this.connections.size);
    this.metrics?.recordGatewayDisconnect();
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
    }

    if (connection.resumeToken && connection.userId) {
      this.resumeSessions.set(connection.resumeToken, {
        expiresAt: Date.now() + this.resumeTimeoutMs,
        resumeToken: connection.resumeToken,
        sequence: connection.sequence,
        status: connection.status,
        userId: connection.userId,
        workspaceIds: connection.workspaceIds,
      });
    }

    if (!connection.userId) {
      return;
    }

    const presenceResult = await this.presenceStore.removeConnection({
      connectionId: connection.connectionId,
      userId: connection.userId,
      workspaceIds: connection.workspaceIds,
    });
    await Promise.all(
      presenceResult.offlineWorkspaceIds.map((workspaceId) =>
        this.publishPresence(workspaceId, connection.userId ?? "", PresenceStatus.OFFLINE),
      ),
    );
  }

  private async checkHeartbeat(connection: GatewayConnection): Promise<void> {
    if (!this.connections.has(connection.connectionId)) {
      return;
    }

    if (Date.now() - connection.lastHeartbeatAt > this.heartbeatIntervalMs * 2) {
      connection.webSocket.close(4000, "heartbeat timeout");
      await this.disconnect(connection);
      return;
    }

    await this.refreshPresence(connection);
  }

  private async refreshPresence(connection: GatewayConnection): Promise<void> {
    if (!connection.userId) {
      return;
    }

    await this.presenceStore.refreshConnection({
      connectionId: connection.connectionId,
      status: connection.status,
      ttlMs: this.presenceTtlMs,
      userId: connection.userId,
      workspaceIds: connection.workspaceIds,
    });
  }

  private async publishPresence(
    workspaceId: string,
    userId: string,
    status: PresenceStatus,
  ): Promise<void> {
    const payload: PresenceUpdatePayload = {
      status,
      updatedAt: new Date().toISOString(),
      userId,
      workspaceId,
    };

    await this.pubSub.publish({
      payload,
      type: ServerGatewayEventType.PRESENCE_UPDATE,
      workspaceId,
    });
  }

  private async dispatchGatewayEvent(event: GatewayEvent): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(async (connection) => {
        if (!connection.identified || !connection.userId) {
          return;
        }

        if (!connection.workspaceIds.includes(event.workspaceId)) {
          return;
        }

        const payload = await this.createPayloadForConnection(connection, event);
        if (!payload) {
          return;
        }

        this.send(connection, {
          d: payload,
          op: GatewayOp.DISPATCH,
          s: ++connection.sequence,
          t: event.type,
        });
      }),
    );
  }

  private async createPayloadForConnection(
    connection: GatewayConnection,
    event: GatewayEvent,
  ): Promise<GatewayEnvelope["d"] | null> {
    if (event.type === ServerGatewayEventType.CHANNEL_REORDER && connection.userId) {
      return {
        channels: await this.channelService.listVisibleTree(event.workspaceId, connection.userId),
        workspaceId: event.workspaceId,
      };
    }

    if (event.channelId && connection.userId) {
      const canView = await this.canViewChannel(event.channelId, connection.userId);
      if (!canView) {
        return null;
      }
    }

    return event.payload;
  }

  private async canViewChannel(channelId: string, userId: string): Promise<boolean> {
    try {
      await this.channelService.requireChannelPermission(
        channelId,
        userId,
        Permission.VIEW_CHANNEL,
      );
      return true;
    } catch {
      return false;
    }
  }

  private send<T>(connection: GatewayConnection, envelope: GatewayEnvelope<T>): void {
    if (connection.webSocket.readyState === WebSocket.OPEN) {
      connection.webSocket.send(JSON.stringify(envelope));
    }
  }

  private sendError(connection: GatewayConnection, code: string, message: string): void {
    const payload: GatewayErrorPayload = { code, message };
    this.send(connection, {
      d: payload,
      op: GatewayOp.ERROR,
    });
  }

  private get presenceTtlMs(): number {
    return this.heartbeatIntervalMs * 3;
  }
}

function readInitialToken(incoming: IncomingMessage, sessionCookieName: string): string | null {
  const request = new Request(
    `http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
    {
      headers: incoming.headers as HeadersInit,
      method: "GET",
    },
  );
  return readRequestToken(request, sessionCookieName)?.token ?? null;
}

function parseGatewayEnvelope(raw: string): GatewayEnvelope | null {
  const parsed: unknown = safeJsonParse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const envelope = parsed as Partial<GatewayEnvelope>;
  if (typeof envelope.op !== "string") {
    return null;
  }

  return envelope as GatewayEnvelope;
}

function parseIdentifyPayload(payload: unknown): GatewayIdentifyPayload {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }

  const raw = payload as Record<string, unknown>;
  return {
    ...(typeof raw.resumeToken === "string" ? { resumeToken: raw.resumeToken } : {}),
    ...(typeof raw.sessionToken === "string" ? { sessionToken: raw.sessionToken } : {}),
  };
}

function parsePresenceUpdatePayload(payload: unknown): PresenceStatus | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const status = (payload as { readonly status?: unknown }).status;
  if (!isPresenceStatus(status)) {
    return null;
  }

  return status;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
