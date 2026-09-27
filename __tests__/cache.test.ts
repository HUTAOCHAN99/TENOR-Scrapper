import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("TenorCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns a cached value before TTL expiry", async () => {
    const { tenorSearchCache, cacheKeyForQuery } = await import("@/lib/tenor/cache");
    const key = cacheKeyForQuery("kucing");
    tenorSearchCache.set(key, ["a"], 1000);
    expect(tenorSearchCache.get(key)).toEqual(["a"]);
  });

  it("expires a value after TTL", async () => {
    const { tenorSearchCache, cacheKeyForQuery } = await import("@/lib/tenor/cache");
    const key = cacheKeyForQuery("expiring");
    tenorSearchCache.set(key, ["a"], 1000);
    vi.advanceTimersByTime(1001);
    expect(tenorSearchCache.get(key)).toBeUndefined();
  });

  it("cacheKeyForQuery produces the documented key format", async () => {
    const { cacheKeyForQuery } = await import("@/lib/tenor/cache");
    expect(cacheKeyForQuery("anime")).toBe("tenor:anime");
  });
});
