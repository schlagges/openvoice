export interface ApiConfig {
  readonly apiPort: number;
  readonly csrfSecret: string;
  readonly databaseUrl: string;
  readonly livekitApiKey: string;
  readonly livekitApiSecret: string;
  readonly livekitInternalUrl: string;
  readonly livekitTokenTtlSeconds: number;
  readonly livekitUrl: string;
  readonly mediaProvider: "livekit";
  readonly passwordPepper: string;
  readonly redisUrl: string;
  readonly sessionCookieName: string;
  readonly sessionCookieSecure: boolean;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly turnRealm: string;
  readonly turnSharedSecret: string;
  readonly turnTtlSeconds: number;
  readonly turnUrl: string;
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    apiPort: readInteger(env.API_PORT, 3000),
    csrfSecret: readRequired(env.CSRF_SECRET, "CSRF_SECRET"),
    databaseUrl: readRequired(env.DATABASE_URL, "DATABASE_URL"),
    livekitApiKey: readRequired(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    livekitApiSecret: readRequired(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    livekitInternalUrl: env.LIVEKIT_INTERNAL_URL ?? readRequired(env.LIVEKIT_URL, "LIVEKIT_URL"),
    livekitTokenTtlSeconds: readInteger(env.LIVEKIT_TOKEN_TTL_SECONDS, 60 * 10),
    livekitUrl: readRequired(env.LIVEKIT_URL, "LIVEKIT_URL"),
    mediaProvider: readMediaProvider(env.MEDIA_PROVIDER),
    passwordPepper: readRequired(env.PASSWORD_PEPPER, "PASSWORD_PEPPER"),
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "openvoice_session",
    sessionCookieSecure: readBoolean(env.SESSION_COOKIE_SECURE, env.NODE_ENV === "production"),
    sessionSecret: readRequired(env.SESSION_SECRET, "SESSION_SECRET"),
    sessionTtlSeconds: readInteger(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    turnRealm: readRequired(env.TURN_REALM, "TURN_REALM"),
    turnSharedSecret: readRequired(env.TURN_SHARED_SECRET, "TURN_SHARED_SECRET"),
    turnTtlSeconds: readInteger(env.TURN_TTL_SECONDS, 60 * 20),
    turnUrl: readRequired(env.TURN_URL, "TURN_URL"),
  };
}

function readRequired(value: string | undefined, key: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function readInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer but received ${value}.`);
  }

  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Expected boolean string but received ${value}.`);
}

function readMediaProvider(value: string | undefined): "livekit" {
  const provider = value ?? "livekit";
  if (provider === "livekit") {
    return provider;
  }

  throw new Error(`Unsupported MEDIA_PROVIDER ${provider}.`);
}
