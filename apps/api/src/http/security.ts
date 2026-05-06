import { ApiError } from "./errors.js";

export interface HttpSecurityConfig {
  readonly corsAllowedOrigins: readonly string[];
  readonly enableHsts: boolean;
}

const CORS_ALLOWED_METHODS = "GET,POST,PATCH,PUT,DELETE,OPTIONS";
const CORS_ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-openvoice-csrf-token",
  "x-request-id",
].join(",");

export function applyHttpSecurityHeaders(
  response: Response,
  request: Request,
  config: HttpSecurityConfig,
): Response {
  setSecurityHeaders(response.headers, config);
  applyCorsHeaders(response.headers, request, config);
  return response;
}

export function createCorsPreflightResponse(
  request: Request,
  config: HttpSecurityConfig,
  requestId: string,
): Response {
  const response = new Response(null, {
    headers: {
      "x-request-id": requestId,
    },
    status: 204,
  });
  setSecurityHeaders(response.headers, config);
  applyCorsHeaders(response.headers, request, config);

  if (!isAllowedOrigin(request.headers.get("origin"), config)) {
    throw new ApiError(403, "FORBIDDEN", "CORS origin is not allowed.");
  }

  response.headers.set("access-control-allow-methods", CORS_ALLOWED_METHODS);
  response.headers.set("access-control-allow-headers", CORS_ALLOWED_HEADERS);
  response.headers.set("access-control-max-age", "600");
  return response;
}

export function assertTrustedCsrfOrigin(request: Request, config: HttpSecurityConfig): void {
  const origin = request.headers.get("origin") ?? readRefererOrigin(request);
  if (!origin) {
    return;
  }

  if (!isAllowedOrigin(origin, config)) {
    throw new ApiError(403, "FORBIDDEN", "Untrusted CSRF origin.");
  }
}

export function isTrustedHttpOrigin(
  origin: string | null,
  config: Pick<HttpSecurityConfig, "corsAllowedOrigins">,
): boolean {
  return isAllowedOrigin(origin, config);
}

function setSecurityHeaders(headers: Headers, config: HttpSecurityConfig): void {
  headers.set("content-security-policy", createContentSecurityPolicy(config));
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set(
    "permissions-policy",
    "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
  );
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");

  if (config.enableHsts) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

function applyCorsHeaders(headers: Headers, request: Request, config: HttpSecurityConfig): void {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, config)) {
    return;
  }

  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  appendVary(headers, "Origin");
}

function createContentSecurityPolicy(config: HttpSecurityConfig): string {
  const connectSources = ["'self'", "ws:", "wss:", ...config.corsAllowedOrigins];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "form-action 'self'",
  ].join("; ");
}

function isAllowedOrigin(
  origin: string | null,
  config: Pick<HttpSecurityConfig, "corsAllowedOrigins">,
): origin is string {
  return Boolean(origin && config.corsAllowedOrigins.includes(origin));
}

function readRefererOrigin(request: Request): string | null {
  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("vary");
  if (!current) {
    headers.set("vary", value);
    return;
  }

  const parts = current.split(",").map((part) => part.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase())) {
    headers.set("vary", `${current}, ${value}`);
  }
}
