/**
 * Minimal fixed-window rate limiter, keyed by an arbitrary string (typically
 * client IP). Designed to be swapped for a Redis/Upstash-backed
 * implementation later without changing call sites — just implement the
 * same `check(key)` method against that store.
 */

export interface RateLimiter {
  /** Returns true if the request is allowed, false if it should be rejected. */
  check(key: string): boolean;
}

class InMemoryFixedWindowRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.max) {
      return false;
    }

    entry.count += 1;
    return true;
  }
}

const MAX_REQUESTS = Number(process.env.TENOR_RATE_LIMIT_MAX ?? 10);
const WINDOW_MS = Number(process.env.TENOR_RATE_LIMIT_WINDOW_MS ?? 60000);

export const searchRateLimiter: RateLimiter = new InMemoryFixedWindowRateLimiter(
  MAX_REQUESTS,
  WINDOW_MS
);

/** Best-effort client IP extraction from standard proxy headers. */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
