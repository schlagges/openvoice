import { createServer } from "node:http";
import { Readable } from "node:stream";

import { readApiConfig } from "./config/env.js";
import { createPostgresPool } from "./db/pool.js";
import { PostgresOpenVoiceRepository } from "./db/postgres-repository.js";
import { createApiHandler } from "./http/app.js";
import { INTERNAL_REMOTE_ADDRESS_HEADER } from "./http/client-ip.js";
import { AuthService } from "./modules/auth/service.js";
import { ChannelService } from "./modules/channels/service.js";
import {
  CompositeMessageEventPublisher,
  GatewayMessageEventPublisher,
} from "./modules/gateway/events.js";
import { RedisPresenceStore } from "./modules/gateway/presence.js";
import { RedisGatewayPubSub } from "./modules/gateway/pubsub.js";
import { GatewayService } from "./modules/gateway/service.js";
import { createGatewayWebSocketUpgradeHandler } from "./modules/gateway/websocket.js";
import { LiveKitMediaProvider } from "./modules/media/livekit-provider.js";
import { InMemoryMessageEventHub } from "./modules/messages/events.js";
import { MessageService } from "./modules/messages/service.js";
import { ModerationService } from "./modules/moderation/service.js";
import { createTcpReadinessCheck, HealthService } from "./modules/observability/health.js";
import { OpenVoiceMetrics } from "./modules/observability/metrics.js";
import { ObservabilityService } from "./modules/observability/service.js";
import { TurnCredentialService } from "./modules/turn/credentials.js";
import { VoiceService } from "./modules/voice/service.js";
import { createMessageWebSocketUpgradeHandler } from "./modules/messages/websocket.js";
import { WorkspaceService } from "./modules/workspaces/service.js";
import { Argon2idPasswordHasher } from "./security/password.js";

export function createOpenVoiceApiServer() {
  const config = readApiConfig();
  const pool = createPostgresPool(config.databaseUrl);
  const repository = new PostgresOpenVoiceRepository(pool);
  const authService = new AuthService({
    csrfSecret: config.csrfSecret,
    passwordHasher: new Argon2idPasswordHasher(config.passwordPepper),
    repository,
    sessionSecret: config.sessionSecret,
    sessionTtlSeconds: config.sessionTtlSeconds,
  });
  const messageEventHub = new InMemoryMessageEventHub();
  const gatewayPubSub = new RedisGatewayPubSub(config.redisUrl);
  const gatewayEventPublisher = gatewayPubSub;
  const metrics = new OpenVoiceMetrics();
  const mediaProvider = new LiveKitMediaProvider({
    apiKey: config.livekitApiKey,
    apiSecret: config.livekitApiSecret,
    serverUrl: config.livekitInternalUrl,
    tokenTtlSeconds: config.livekitTokenTtlSeconds,
  });
  const turnCredentialService = new TurnCredentialService({
    realm: config.turnRealm,
    sharedSecret: config.turnSharedSecret,
    ttlSeconds: config.turnTtlSeconds,
    turnHost: config.turnUrl,
    turnPort: config.turnPort,
    turnsPort: config.turnsPort,
  });
  const channelService = new ChannelService({
    eventPublisher: gatewayEventPublisher,
    repository,
  });
  const workspaceService = new WorkspaceService({
    eventPublisher: gatewayEventPublisher,
    repository,
  });
  const messageService = new MessageService({
    channelService,
    eventPublisher: new CompositeMessageEventPublisher([
      messageEventHub,
      new GatewayMessageEventPublisher(gatewayEventPublisher),
    ]),
    metrics,
    repository,
  });
  const voiceService = new VoiceService({
    channelService,
    eventPublisher: gatewayEventPublisher,
    livekitUrl: config.livekitUrl,
    mediaProvider,
    metrics,
    repository,
    turnCredentialService,
  });
  const moderationService = new ModerationService({
    channelService,
    eventPublisher: gatewayEventPublisher,
    mediaProvider,
    repository,
  });
  const gatewayService = new GatewayService({
    authService,
    channelService,
    config,
    metrics,
    presenceStore: new RedisPresenceStore(config.redisUrl),
    pubSub: gatewayPubSub,
    workspaceService,
  });
  const healthService = new HealthService([
    {
      name: "postgres",
      run: async () => {
        await pool.query("SELECT 1");
      },
    },
    createTcpReadinessCheck({ name: "valkey", url: config.redisUrl }),
    {
      name: "livekit",
      run: async () => {
        await mediaProvider.getStats();
      },
    },
  ]);
  const observabilityService = new ObservabilityService({
    channelService,
    healthService,
    mediaProvider,
    metrics,
  });
  const handler = createApiHandler({
    authService,
    channelService,
    config,
    messageService,
    moderationService,
    observabilityService,
    voiceService,
    workspaceService,
  });

  const server = createServer(async (incoming, outgoing) => {
    const headers = new Headers(incoming.headers as HeadersInit);
    headers.set(INTERNAL_REMOTE_ADDRESS_HEADER, incoming.socket.remoteAddress ?? "");
    const request = new Request(
      `http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
      {
        body:
          incoming.method === "GET" || incoming.method === "HEAD"
            ? undefined
            : (Readable.toWeb(incoming) as BodyInit),
        duplex: "half",
        headers,
        method: incoming.method,
      } as RequestInit,
    );
    const response = await handler(request);

    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const body = await response.arrayBuffer();
    outgoing.end(Buffer.from(body));
  });
  const gatewayUpgradeHandler = createGatewayWebSocketUpgradeHandler(gatewayService, config);
  const messageUpgradeHandler = createMessageWebSocketUpgradeHandler({
    authService,
    config,
    eventHub: messageEventHub,
    messageService,
  });
  server.on("upgrade", (incoming, socket, head) => {
    if (gatewayUpgradeHandler.canHandle(incoming)) {
      gatewayUpgradeHandler.handle(incoming, socket, head);
      return;
    }

    if (messageUpgradeHandler.canHandle(incoming)) {
      messageUpgradeHandler.handle(incoming, socket, head);
      return;
    }

    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = readApiConfig();
  const server = createOpenVoiceApiServer();

  server.listen(config.apiPort, () => {
    process.stdout.write(`OpenVoice API listening on port ${config.apiPort}\n`);
  });
}
