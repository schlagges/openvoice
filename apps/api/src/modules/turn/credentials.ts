import { createHmac } from "node:crypto";

import type { IceServersResponse } from "@openvoice/shared";

export interface TurnCredentialOptions {
  readonly realm: string;
  readonly sharedSecret: string;
  readonly ttlSeconds: number;
  readonly turnHost: string;
}

export interface TurnCredentialInput {
  readonly now?: Date;
  readonly userId: string;
}

export class TurnCredentialService {
  private readonly options: TurnCredentialOptions;

  public constructor(options: TurnCredentialOptions) {
    this.options = options;
  }

  public createIceServers(input: TurnCredentialInput): IceServersResponse {
    const now = input.now ?? new Date();
    const expiresUnix = Math.floor(now.getTime() / 1000) + this.options.ttlSeconds;
    const username = `${expiresUnix}:${input.userId}`;
    const credential = createHmac("sha1", this.options.sharedSecret)
      .update(username)
      .digest("base64");
    const host = normalizeTurnHost(this.options.turnHost);

    return {
      expiresAt: new Date(expiresUnix * 1000).toISOString(),
      iceServers: [
        { urls: [`stun:${host}:3478`] },
        {
          credential,
          urls: [`turn:${host}:3478?transport=udp`],
          username,
        },
        {
          credential,
          urls: [`turn:${host}:3478?transport=tcp`],
          username,
        },
        {
          credential,
          urls: [`turns:${host}:5349?transport=tcp`],
          username,
        },
      ],
    };
  }

  public get realm(): string {
    return this.options.realm;
  }
}

function normalizeTurnHost(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^turns?:\/\//, "")
    .replace(/^stuns?:\/\//, "");
  const withoutPath = trimmed.split("/")[0] ?? "";
  const withoutPort = withoutPath.replace(/:\d+$/, "");

  if (withoutPort.length === 0) {
    throw new Error("TURN_URL must contain a host.");
  }

  return withoutPort;
}
