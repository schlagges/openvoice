import { rateLimited } from "../http/errors.js";

export interface RateLimitRule {
  readonly capacity: number;
  readonly refillAmount: number;
  readonly refillIntervalMs: number;
}

export interface RateLimiterOptions {
  readonly enabled?: boolean | undefined;
}

interface BucketState {
  readonly resetAt: number;
  readonly tokens: number;
  readonly updatedAt: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly enabled: boolean;

  public constructor(options: RateLimiterOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  public assertAllowed(key: string, rule: RateLimitRule, now = Date.now()): void {
    if (!this.enabled) {
      return;
    }

    const current = this.buckets.get(key) ?? {
      resetAt: now + rule.refillIntervalMs,
      tokens: rule.capacity,
      updatedAt: now,
    };
    const elapsedIntervals = Math.floor((now - current.updatedAt) / rule.refillIntervalMs);
    const tokens = Math.min(
      rule.capacity,
      current.tokens + Math.max(0, elapsedIntervals) * rule.refillAmount,
    );
    const updatedAt =
      elapsedIntervals > 0
        ? current.updatedAt + elapsedIntervals * rule.refillIntervalMs
        : current.updatedAt;

    if (tokens <= 0) {
      throw rateLimited("Rate limit exceeded.", {
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      });
    }

    this.buckets.set(key, {
      resetAt: updatedAt + rule.refillIntervalMs,
      tokens: tokens - 1,
      updatedAt,
    });
  }
}
