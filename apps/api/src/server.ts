import { createServer } from "node:http";
import { Readable } from "node:stream";

import { readApiConfig } from "./config/env.js";
import { createPostgresPool } from "./db/pool.js";
import { PostgresOpenVoiceRepository } from "./db/postgres-repository.js";
import { createApiHandler } from "./http/app.js";
import { AuthService } from "./modules/auth/service.js";
import { ChannelService } from "./modules/channels/service.js";
import { InMemoryMessageEventHub } from "./modules/messages/events.js";
import { MessageService } from "./modules/messages/service.js";
import { installMessageWebSocketServer } from "./modules/messages/websocket.js";
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
  const channelService = new ChannelService({ repository });
  const messageEventHub = new InMemoryMessageEventHub();
  const messageService = new MessageService({
    channelService,
    eventPublisher: messageEventHub,
    repository,
  });
  const workspaceService = new WorkspaceService({ repository });
  const handler = createApiHandler({
    authService,
    channelService,
    config,
    messageService,
    workspaceService,
  });

  const server = createServer(async (incoming, outgoing) => {
    const request = new Request(
      `http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
      {
        body:
          incoming.method === "GET" || incoming.method === "HEAD"
            ? undefined
            : (Readable.toWeb(incoming) as BodyInit),
        duplex: "half",
        headers: incoming.headers as HeadersInit,
        method: incoming.method,
      } as RequestInit,
    );
    const response = await handler(request);

    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const body = await response.arrayBuffer();
    outgoing.end(Buffer.from(body));
  });
  installMessageWebSocketServer(server, {
    authService,
    config,
    eventHub: messageEventHub,
    messageService,
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
