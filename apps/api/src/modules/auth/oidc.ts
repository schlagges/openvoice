import { createHash, createHmac, randomBytes, timingSafeEqual, webcrypto } from "node:crypto";

import { forbidden, unauthorized } from "../../http/errors.js";

const STATE_COOKIE_NAME = "openvoice_oidc_state";
const STATE_TTL_SECONDS = 10 * 60;

export interface OidcConfig {
  readonly audience: string;
  readonly callbackUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly enabled: boolean;
  readonly issuerUrl: string;
  readonly requiredClientRole: string;
  readonly sessionCookieSecure: boolean;
  readonly csrfSecret: string;
}

export interface OidcLoginStart {
  readonly headers: HeadersInit;
  readonly status: number;
}

export interface OidcUserIdentity {
  readonly displayName: string;
  readonly email: string;
  readonly subject: string;
}

interface OidcDiscovery {
  readonly authorization_endpoint: string;
  readonly issuer: string;
  readonly jwks_uri: string;
  readonly token_endpoint: string;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly id_token?: string;
}

type OidcJwk = JsonWebKey & { readonly kid?: string };

interface JwksResponse {
  readonly keys: readonly OidcJwk[];
}

interface JwtHeader {
  readonly alg?: string;
  readonly kid?: string;
}

interface JwtClaims {
  readonly aud?: string | readonly string[];
  readonly azp?: string;
  readonly email?: string;
  readonly exp?: number;
  readonly iat?: number;
  readonly iss?: string;
  readonly name?: string;
  readonly preferred_username?: string;
  readonly resource_access?: Record<string, { readonly roles?: readonly string[] }>;
  readonly sub?: string;
}

interface StatePayload {
  readonly codeVerifier: string;
  readonly linkUserId?: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly state: string;
  readonly timestamp: number;
}

export class OidcAuthService {
  private readonly config: OidcConfig;

  public constructor(config: OidcConfig) {
    this.config = config;
  }

  public createLoginRedirect(returnTo = "/", linkUserId?: string): OidcLoginStart {
    this.assertEnabled();
    const codeVerifier = randomBase64Url(64);
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const payload: StatePayload = {
      codeVerifier,
      ...(linkUserId ? { linkUserId } : {}),
      nonce,
      returnTo: normalizeReturnTo(returnTo),
      state,
      timestamp: Date.now(),
    };
    const authorizationUrl = new URL(`${this.config.issuerUrl}/protocol/openid-connect/auth`);
    authorizationUrl.searchParams.set("client_id", this.config.clientId);
    authorizationUrl.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("redirect_uri", this.config.callbackUrl);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);

    return {
      headers: {
        location: authorizationUrl.toString(),
        "set-cookie": createStateCookie(signState(payload, this.config.csrfSecret), {
          maxAgeSeconds: STATE_TTL_SECONDS,
          secure: this.config.sessionCookieSecure,
        }),
      },
      status: 302,
    };
  }

  public async completeCallback(input: {
    readonly code: string | null;
    readonly cookieHeader: string | null;
    readonly state: string | null;
  }): Promise<{
    readonly identity: OidcUserIdentity;
    readonly linkUserId?: string;
    readonly returnTo: string;
  }> {
    this.assertEnabled();
    if (!input.code || !input.state) {
      throw unauthorized("OIDC callback is missing code or state.");
    }

    const stateCookie = parseCookie(input.cookieHeader).get(STATE_COOKIE_NAME);
    if (!stateCookie) {
      throw unauthorized("OIDC state cookie missing.");
    }

    const statePayload = verifyState(stateCookie, this.config.csrfSecret);
    if (statePayload.state !== input.state) {
      throw unauthorized("OIDC state mismatch.");
    }
    if (Date.now() - statePayload.timestamp > STATE_TTL_SECONDS * 1000) {
      throw unauthorized("OIDC state expired.");
    }

    const discovery = await this.fetchDiscovery();
    const tokenResponse = await this.exchangeCode(input.code, statePayload.codeVerifier, discovery);
    const token = tokenResponse.access_token ?? tokenResponse.id_token;
    if (!token) {
      throw unauthorized("OIDC token response did not include a token.");
    }

    const claims = await this.verifyJwt(token, discovery);
    this.assertRole(claims);

    return {
      identity: {
        displayName:
          claims.name ?? claims.preferred_username ?? claims.email ?? claims.sub ?? "User",
        email: requireStringClaim(claims.email, "email"),
        subject: requireStringClaim(claims.sub, "sub"),
      },
      ...(statePayload.linkUserId ? { linkUserId: statePayload.linkUserId } : {}),
      returnTo: statePayload.returnTo,
    };
  }

  public createStateClearingCookie(): string {
    return createStateCookie("", { maxAgeSeconds: 0, secure: this.config.sessionCookieSecure });
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw forbidden("OIDC authentication is disabled.");
    }
    if (!this.config.clientSecret) {
      throw forbidden("OIDC client secret is not configured.");
    }
    if (!this.config.csrfSecret) {
      throw forbidden("OIDC state secret is not configured.");
    }
  }

  private async fetchDiscovery(): Promise<OidcDiscovery> {
    const response = await fetch(`${this.config.issuerUrl}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw unauthorized("OIDC discovery failed.");
    }
    const body = (await response.json()) as Partial<OidcDiscovery>;
    if (
      body.issuer !== this.config.issuerUrl ||
      !body.authorization_endpoint ||
      !body.token_endpoint ||
      !body.jwks_uri
    ) {
      throw unauthorized("OIDC discovery metadata is invalid.");
    }

    return body as OidcDiscovery;
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
    discovery: OidcDiscovery,
  ): Promise<TokenResponse> {
    const response = await fetch(discovery.token_endpoint, {
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: this.config.callbackUrl,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!response.ok) {
      throw unauthorized("OIDC token exchange failed.");
    }

    return (await response.json()) as TokenResponse;
  }

  private async verifyJwt(token: string, discovery: OidcDiscovery): Promise<JwtClaims> {
    const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw unauthorized("OIDC token is malformed.");
    }

    const header = parseBase64UrlJson<JwtHeader>(encodedHeader);
    if (header.alg !== "RS256" || !header.kid) {
      throw unauthorized("OIDC token uses an unsupported signature.");
    }

    const jwksResponse = await fetch(discovery.jwks_uri);
    if (!jwksResponse.ok) {
      throw unauthorized("OIDC JWKS fetch failed.");
    }
    const jwks = (await jwksResponse.json()) as JwksResponse;
    const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) {
      throw unauthorized("OIDC signing key not found.");
    }

    const key = await webcrypto.subtle.importKey(
      "jwk",
      jwk,
      { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
      false,
      ["verify"],
    );
    const verified = await webcrypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBuffer(encodedSignature),
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
    );
    if (!verified) {
      throw unauthorized("OIDC token signature is invalid.");
    }

    const claims = parseBase64UrlJson<JwtClaims>(encodedClaims);
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== discovery.issuer || !claims.exp || claims.exp <= now) {
      throw unauthorized("OIDC token claims are invalid.");
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (
      !audiences.includes(this.config.audience) &&
      !audiences.includes(this.config.clientId) &&
      claims.azp !== this.config.clientId
    ) {
      throw unauthorized("OIDC token audience is invalid.");
    }

    return claims;
  }

  private assertRole(claims: JwtClaims): void {
    const roles = claims.resource_access?.[this.config.clientId]?.roles ?? [];
    if (!roles.includes(this.config.requiredClientRole)) {
      throw forbidden("Missing required Openvoice role.");
    }
  }
}

function signState(payload: StatePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyState(value: string, secret: string): StatePayload {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    throw unauthorized("OIDC state cookie is invalid.");
  }
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) {
    throw unauthorized("OIDC state cookie signature is invalid.");
  }

  return parseBase64UrlJson<StatePayload>(encoded);
}

function createStateCookie(
  value: string,
  options: { readonly maxAgeSeconds: number; readonly secure: boolean },
): string {
  const parts = [
    `${STATE_COOKIE_NAME}=${value}`,
    "HttpOnly",
    `Max-Age=${options.maxAgeSeconds}`,
    "Path=/api/v1/auth/oidc",
    "SameSite=Lax",
  ];
  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseCookie(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=");
    if (name && value.length > 0) {
      cookies.set(name, value.join("="));
    }
  }
  return cookies;
}

function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireStringClaim(value: unknown, claim: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw unauthorized(`OIDC token is missing ${claim}.`);
  }
  return value;
}

function normalizeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
