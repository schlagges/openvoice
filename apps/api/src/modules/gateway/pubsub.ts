import { randomUUID } from "node:crypto";
import { Socket, connect as connectTcp } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

import type { GatewayEvent, GatewayEventPubSub, PublishGatewayEventInput } from "./events.js";

type RedisSocket = Socket | TLSSocket;
type RedisResponse = Error | RedisResponse[] | null | number | string;

const GATEWAY_EVENT_CHANNEL = "openvoice:gateway:events";

export class InMemoryGatewayPubSub implements GatewayEventPubSub {
  private readonly handlers = new Set<(event: GatewayEvent) => Promise<void> | void>();

  public async publish(input: PublishGatewayEventInput): Promise<void> {
    const event = toGatewayEvent(input);
    await Promise.all(Array.from(this.handlers).map((handler) => handler(event)));
  }

  public subscribe(handler: (event: GatewayEvent) => Promise<void> | void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export class RedisGatewayPubSub implements GatewayEventPubSub {
  private readonly handlers = new Set<(event: GatewayEvent) => Promise<void> | void>();
  private readonly publisher: RedisCommandConnection;
  private subscriber: RedisSubscriptionConnection | null = null;
  private subscribed = false;
  private readonly url: string;

  public constructor(redisUrl: string) {
    this.url = redisUrl;
    this.publisher = new RedisCommandConnection(redisUrl);
  }

  public async publish(input: PublishGatewayEventInput): Promise<void> {
    await this.publisher.command([
      "PUBLISH",
      GATEWAY_EVENT_CHANNEL,
      JSON.stringify(toGatewayEvent(input)),
    ]);
  }

  public subscribe(handler: (event: GatewayEvent) => Promise<void> | void): () => void {
    this.handlers.add(handler);
    this.ensureSubscribed();

    return () => {
      this.handlers.delete(handler);
    };
  }

  private ensureSubscribed(): void {
    if (this.subscribed) {
      return;
    }

    this.subscribed = true;
    this.subscriber = new RedisSubscriptionConnection(this.url);
    void this.subscriber
      .subscribe(GATEWAY_EVENT_CHANNEL, (payload) => {
        const event = parseGatewayEvent(payload);
        if (!event) {
          return;
        }

        for (const handler of this.handlers) {
          void handler(event);
        }
      })
      .catch((error: unknown) => {
        process.stderr.write(`Gateway Redis PubSub subscribe failed: ${String(error)}\n`);
      });
  }
}

export class RedisCommandConnection {
  private buffer = Buffer.alloc(0);
  private connectPromise: Promise<void> | null = null;
  private readonly pending: Array<{
    readonly reject: (error: Error) => void;
    readonly resolve: (response: RedisResponse) => void;
  }> = [];
  private socket: RedisSocket | null = null;
  private readonly url: URL;

  public constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  public async command(parts: readonly string[]): Promise<RedisResponse> {
    await this.ensureConnected();

    const socket = this.socket;
    if (!socket) {
      throw new Error("Redis connection is not available.");
    }

    return new Promise<RedisResponse>((resolve, reject) => {
      this.pending.push({ reject, resolve });
      socket.write(encodeRedisCommand(parts));
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    this.connectPromise ??= this.connect();
    await this.connectPromise;
  }

  private async connect(): Promise<void> {
    const socket = createRedisSocket(this.url);
    this.socket = socket;

    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushResponses();
    });
    socket.on("error", (error) => {
      while (this.pending.length > 0) {
        this.pending.shift()?.reject(error);
      }
    });
    socket.on("close", () => {
      this.socket = null;
      this.connectPromise = null;
    });

    await waitForConnect(socket);
    await authenticateRedisConnection(this, this.url);
  }

  private flushResponses(): void {
    while (this.pending.length > 0) {
      const parsed = parseRedisResponse(this.buffer);
      if (!parsed) {
        return;
      }

      this.buffer = this.buffer.subarray(parsed.bytes);
      const pending = this.pending.shift();
      if (!pending) {
        return;
      }

      if (parsed.value instanceof Error) {
        pending.reject(parsed.value);
      } else {
        pending.resolve(parsed.value);
      }
    }
  }
}

class RedisSubscriptionConnection {
  private buffer = Buffer.alloc(0);
  private readonly url: URL;

  public constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  public async subscribe(channel: string, onMessage: (payload: string) => void): Promise<void> {
    const socket = createRedisSocket(this.url);
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushMessages(onMessage);
    });
    await waitForConnect(socket);

    const auth = createRedisAuthCommands(this.url);
    for (const command of auth) {
      socket.write(encodeRedisCommand(command));
    }
    socket.write(encodeRedisCommand(["SUBSCRIBE", channel]));
  }

  private flushMessages(onMessage: (payload: string) => void): void {
    while (this.buffer.length > 0) {
      const parsed = parseRedisResponse(this.buffer);
      if (!parsed) {
        return;
      }

      this.buffer = this.buffer.subarray(parsed.bytes);
      if (Array.isArray(parsed.value) && parsed.value[0] === "message") {
        const payload = parsed.value[2];
        if (typeof payload === "string") {
          onMessage(payload);
        }
      }
    }
  }
}

function toGatewayEvent(input: PublishGatewayEventInput): GatewayEvent {
  return {
    ...(input.channelId ? { channelId: input.channelId } : {}),
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    payload: input.payload,
    type: input.type,
    workspaceId: input.workspaceId,
  };
}

function parseGatewayEvent(payload: string): GatewayEvent | null {
  const parsed: unknown = safeJsonParse(payload);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const event = parsed as Partial<GatewayEvent>;
  if (
    typeof event.id !== "string" ||
    typeof event.createdAt !== "string" ||
    typeof event.type !== "string" ||
    typeof event.workspaceId !== "string" ||
    event.payload === undefined
  ) {
    return null;
  }

  return event as GatewayEvent;
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function createRedisSocket(url: URL): RedisSocket {
  const port = Number.parseInt(url.port || "6379", 10);
  const host = url.hostname || "localhost";

  return url.protocol === "rediss:" ? connectTls(port, host) : connectTcp(port, host);
}

function waitForConnect(socket: RedisSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
}

async function authenticateRedisConnection(
  connection: RedisCommandConnection,
  url: URL,
): Promise<void> {
  for (const command of createRedisAuthCommands(url)) {
    await connection.command(command);
  }
}

function createRedisAuthCommands(url: URL): string[][] {
  const commands: string[][] = [];

  if (url.password) {
    commands.push(url.username ? ["AUTH", url.username, url.password] : ["AUTH", url.password]);
  }

  const database = url.pathname.replace("/", "");
  if (database.length > 0) {
    commands.push(["SELECT", database]);
  }

  return commands;
}

function encodeRedisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function parseRedisResponse(
  buffer: Buffer,
): { readonly bytes: number; readonly value: RedisResponse } | null {
  if (buffer.length === 0) {
    return null;
  }

  const firstByte = buffer[0];
  if (firstByte === undefined) {
    return null;
  }

  const type = String.fromCharCode(firstByte);
  const lineEnd = buffer.indexOf("\r\n");
  if (lineEnd === -1) {
    return null;
  }

  const header = buffer.subarray(1, lineEnd).toString("utf8");
  if (type === "+") {
    return { bytes: lineEnd + 2, value: header };
  }
  if (type === "-") {
    return { bytes: lineEnd + 2, value: new Error(header) };
  }
  if (type === ":") {
    return { bytes: lineEnd + 2, value: Number.parseInt(header, 10) };
  }
  if (type === "$") {
    const length = Number.parseInt(header, 10);
    if (length === -1) {
      return { bytes: lineEnd + 2, value: null };
    }

    const start = lineEnd + 2;
    const end = start + length;
    if (buffer.length < end + 2) {
      return null;
    }

    return {
      bytes: end + 2,
      value: buffer.subarray(start, end).toString("utf8"),
    };
  }
  if (type === "*") {
    const count = Number.parseInt(header, 10);
    let offset = lineEnd + 2;
    const values: RedisResponse[] = [];

    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisResponse(buffer.subarray(offset));
      if (!parsed) {
        return null;
      }

      values.push(parsed.value);
      offset += parsed.bytes;
    }

    return { bytes: offset, value: values };
  }

  return { bytes: lineEnd + 2, value: new Error(`Unsupported Redis response type ${type}.`) };
}
