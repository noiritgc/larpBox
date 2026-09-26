import type { Clock } from '../game/clock.js';

export type RateResult = { ok: true } | { ok: false; retryAfterMs: number };

export interface BucketOptions {
  /** Burst size. */
  capacity: number;
  /** Sustained tokens per second. */
  refillPerSecond: number;
}

/**
 * Token buckets keyed by IP, session or assignment. Buckets that have been idle long enough to be
 * full again are purged, so limits never turn into a permanent blocklist.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly options: BucketOptions,
    private readonly clock: Clock,
  ) {}

  take(key: string, cost = 1): RateResult {
    const now = this.clock.nowMonotonicMs();
    const { capacity, refillPerSecond } = this.options;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    } else {
      const refill = ((now - bucket.updatedAt) / 1000) * refillPerSecond;
      bucket.tokens = Math.min(capacity, bucket.tokens + refill);
      bucket.updatedAt = now;
    }
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil(((cost - bucket.tokens) / refillPerSecond) * 1000) };
  }

  purge(): void {
    const now = this.clock.nowMonotonicMs();
    const fullAfterMs = (this.options.capacity / this.options.refillPerSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt >= fullAfterMs) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export interface RateLimiters {
  create: TokenBucketLimiter;
  join: TokenBucketLimiter;
  preview: TokenBucketLimiter;
  auth: TokenBucketLimiter;
  command: TokenBucketLimiter;
  draft: TokenBucketLimiter;
  stateRequest: TokenBucketLimiter;
  clockPing: TokenBucketLimiter;
}

/**
 * Suggested limits from the spec. Per-IP budgets scale with RATE_LIMIT_MULTIPLIER (for local load
 * tests and shared-NAT events); per-session budgets do not.
 */
export function createRateLimiters(clock: Clock, multiplier = 1): RateLimiters {
  const perIp = (capacity: number, perSecond: number) =>
    new TokenBucketLimiter({ capacity: capacity * multiplier, refillPerSecond: perSecond * multiplier }, clock);
  return {
    create: perIp(5, 20 / 3600),
    join: perIp(20, 120 / 60),
    preview: perIp(20, 120 / 60),
    auth: perIp(20, 60 / 60),
    command: new TokenBucketLimiter({ capacity: 40, refillPerSecond: 30 }, clock),
    draft: new TokenBucketLimiter({ capacity: 10, refillPerSecond: 5 }, clock),
    stateRequest: new TokenBucketLimiter({ capacity: 4, refillPerSecond: 2 }, clock),
    clockPing: new TokenBucketLimiter({ capacity: 4, refillPerSecond: 0.1 }, clock),
  };
}

export function purgeLimiters(limiters: RateLimiters): void {
  for (const limiter of Object.values(limiters)) limiter.purge();
}
