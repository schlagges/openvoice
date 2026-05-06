export interface ApiConfig {
  readonly auditIpHashSecret: string;
  readonly apiPort: number;
  readonly corsAllowedOrigins: readonly string[];
  readonly csrfSecret: string;
  readonly databaseUrl: string;
  readonly enableHsts: boolean;
  readonly livekitApiKey: string;
  readonly livekitApiSecret: string;
  readonly livekitInternalUrl: string;
  readonly livekitTokenTtlSeconds: number;
  readonly livekitUrl: string;
  readonly localPasswordAuthEnabled: boolean;
  readonly mediaProvider: "livekit";
  readonly oidcAudience: string;
  readonly oidcClientId: string;
  readonly oidcIssuerUrl: string;
  readonly inviteTtlSeconds: number;
  readonly passwordPepper: string;
  readonly rateLimitsEnabled: boolean;
  readonly redisUrl: string;
  readonly sessionCookieName: string;
  readonly sessionCookieSecure: boolean;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly turnRealm: string;
  readonly turnPort: number;
  readonly turnSharedSecret: string;
  readonly turnTtlSeconds: number;
  readonly turnsPort: number;
  readonly turnUrl: string;
  readonly trustedProxyIps: readonly string[];
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    apiPort: readInteger(env.API_PORT, 3000),
    auditIpHashSecret: readRequired(env.AUDIT_IP_HASH_SECRET, "AUDIT_IP_HASH_SECRET"),
    corsAllowedOrigins: readAllowedOrigins(env),
    csrfSecret: readRequired(env.CSRF_SECRET, "CSRF_SECRET"),
    databaseUrl: readRequired(env.DATABASE_URL, "DATABASE_URL"),
    enableHsts: readBoolean(env.ENABLE_HSTS, env.NODE_ENV === "production"),
    livekitApiKey: readRequired(env.LIVEKIT_API_KEY, "LIVEKIT_API_KEY"),
    livekitApiSecret: readRequired(env.LIVEKIT_API_SECRET, "LIVEKIT_API_SECRET"),
    livekitInternalUrl: env.LIVEKIT_INTERNAL_URL ?? readRequired(env.LIVEKIT_URL, "LIVEKIT_URL"),
    livekitTokenTtlSeconds: readInteger(env.LIVEKIT_TOKEN_TTL_SECONDS, 60 * 10),
    livekitUrl: readRequired(env.LIVEKIT_URL, "LIVEKIT_URL"),
    localPasswordAuthEnabled: readBoolean(
      env.LOCAL_PASSWORD_AUTH_ENABLED,
      env.NODE_ENV !== "production",
    ),
    mediaProvider: readMediaProvider(env.MEDIA_PROVIDER),
    oidcAudience: env.OIDC_AUDIENCE ?? env.OIDC_CLIENT_ID ?? "openvoice-web",
    oidcClientId: env.OIDC_CLIENT_ID ?? "openvoice-web",
    oidcIssuerUrl:
      env.OIDC_ISSUER_URL ?? "https://auth.schnick-schnack.info/realms/schnick-schnack",
    inviteTtlSeconds: readInteger(env.INVITE_TTL_SECONDS, 60 * 5),
    passwordPepper: readRequired(env.PASSWORD_PEPPER, "PASSWORD_PEPPER"),
    rateLimitsEnabled: readBoolean(env.RATE_LIMITS_ENABLED, true),
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "openvoice_session",
    sessionCookieSecure: readBoolean(env.SESSION_COOKIE_SECURE, env.NODE_ENV === "production"),
    sessionSecret: readRequired(env.SESSION_SECRET, "SESSION_SECRET"),
    sessionTtlSeconds: readInteger(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    turnRealm: readRequired(env.TURN_REALM, "TURN_REALM"),
    turnPort: readInteger(env.TURN_PORT, 3478),
    turnSharedSecret: readRequired(env.TURN_SHARED_SECRET, "TURN_SHARED_SECRET"),
    turnTtlSeconds: readInteger(env.TURN_TTL_SECONDS, 60 * 20),
    turnsPort: readInteger(env.TURNS_PORT, 5349),
    turnUrl: readRequired(env.TURN_URL, "TURN_URL"),
    trustedProxyIps: readList(env.TRUSTED_PROXY_IPS),
  };
}

function readAllowedOrigins(env: NodeJS.ProcessEnv): readonly string[] {
  const explicit = env.CORS_ALLOWED_ORIGINS;
  const values =
    explicit && explicit.trim().length > 0
      ? explicit.split(",")
      : [env.APP_PUBLIC_URL, env.API_PUBLIC_URL].filter((value): value is string => Boolean(value));
  const origins = new Set<string>();

  for (const value of values) {
    const origin = readOrigin(value.trim());
    if (origin) {
      origins.add(origin);
    }
  }

  return [...origins].sort();
}

function readOrigin(value: string): string | null {
  if (value.length === 0) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Expected origin URL but received ${value}.`);
  }
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

function readList(value: string | undefined): readonly string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readMediaProvider(value: string | undefined): "livekit" {
  const provider = value ?? "livekit";
  if (provider === "livekit") {
    return provider;
  }

  throw new Error(`Unsupported MEDIA_PROVIDER ${provider}.`);
}
