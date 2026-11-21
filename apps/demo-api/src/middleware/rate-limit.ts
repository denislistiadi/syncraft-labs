import type { MiddlewareHandler } from "hono";

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Maximum requests allowed per key inside one window. */
  readonly max: number;
  /** Requests with a different key are counted separately. */
  readonly key: (c: Parameters<MiddlewareHandler>[0]) => string;
  /** Return true to bypass the limiter for a request. */
  readonly skip?: (c: Parameters<MiddlewareHandler>[0]) => boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;

function cleanup(buckets: Map<string, Bucket>, now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * Fixed-window, in-memory rate limiter.
 *
 * Good enough for a single-instance reference deployment. A multi-instance
 * deployment should move this to a shared store (Redis/Upstash).
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    if (options.skip?.(c)) {
      await next();
      return undefined;
    }

    const now = Date.now();
    cleanup(buckets, now);

    const bucketKey = options.key(c);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(bucketKey, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    c.header("X-RateLimit-Limit", String(options.max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: "rate_limited",
          message: `Too many writes. Retry in ${retryAfter}s.`,
        },
        429,
      );
    }

    await next();
    return undefined;
  };
}

export function clientKey(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") ?? "local";
}
