import { InMemoryRateLimiter } from "../security/rate-limit.js";
import type { RateLimitRule } from "../security/rate-limit.js";
import { getClientAddressFromRequest, type ClientAddressConfig } from "./client-ip.js";

const API_RATE_LIMITS = {
  authLogin: {
    capacity: 10,
    refillAmount: 10,
    refillIntervalMs: 15 * 60_000,
  },
  authRegister: {
    capacity: 5,
    refillAmount: 5,
    refillIntervalMs: 15 * 60_000,
  },
  generalRead: {
    capacity: 600,
    refillAmount: 600,
    refillIntervalMs: 60_000,
  },
  generalWrite: {
    capacity: 240,
    refillAmount: 240,
    refillIntervalMs: 60_000,
  },
  rtcStats: {
    capacity: 120,
    refillAmount: 120,
    refillIntervalMs: 60_000,
  },
  turnCredentials: {
    capacity: 30,
    refillAmount: 30,
    refillIntervalMs: 60_000,
  },
  voiceAction: {
    capacity: 120,
    refillAmount: 120,
    refillIntervalMs: 60_000,
  },
} as const satisfies Record<string, RateLimitRule>;

export class ApiRequestRateLimiter {
  private readonly config: ClientAddressConfig;
  private readonly limiter: InMemoryRateLimiter;

  public constructor(
    options: ClientAddressConfig & { readonly enabled?: boolean | undefined } = {},
    limiter = new InMemoryRateLimiter({ enabled: options.enabled }),
  ) {
    this.config = options;
    this.limiter = limiter;
  }

  public assertAllowed(request: Request, url: URL): void {
    const route = classifyRoute(request, url);
    if (!route) {
      return;
    }

    this.limiter.assertAllowed(
      `${route.name}:${getClientAddressFromRequest(request, this.config)}`,
      route.rule,
    );
  }
}

function classifyRoute(
  request: Request,
  url: URL,
): { readonly name: string; readonly rule: RateLimitRule } | null {
  if (!url.pathname.startsWith("/api/v1/")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return null;
  }

  if (url.pathname === "/api/v1/auth/register" && request.method === "POST") {
    return { name: "auth:register", rule: API_RATE_LIMITS.authRegister };
  }

  if (url.pathname === "/api/v1/auth/login" && request.method === "POST") {
    return { name: "auth:login", rule: API_RATE_LIMITS.authLogin };
  }

  if (url.pathname === "/api/v1/turn/credentials") {
    return { name: "turn:credentials", rule: API_RATE_LIMITS.turnCredentials };
  }

  if (url.pathname === "/api/v1/rtc/stats") {
    return { name: "rtc:stats", rule: API_RATE_LIMITS.rtcStats };
  }

  if (url.pathname.includes("/voice/")) {
    return { name: "voice:action", rule: API_RATE_LIMITS.voiceAction };
  }

  return request.method === "GET"
    ? { name: "api:read", rule: API_RATE_LIMITS.generalRead }
    : { name: "api:write", rule: API_RATE_LIMITS.generalWrite };
}
