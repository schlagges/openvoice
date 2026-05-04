import { createHmac, randomBytes } from "node:crypto";

export interface SessionTokenPair {
  readonly rawToken: string;
  readonly tokenHash: string;
}

export function createSecretToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function createSessionToken(secret: string): SessionTokenPair {
  const rawToken = createSecretToken();

  return {
    rawToken,
    tokenHash: hashToken(rawToken, secret),
  };
}

export function hashToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
