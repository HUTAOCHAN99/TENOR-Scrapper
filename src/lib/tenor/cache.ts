/**
 * Minimal in-memory TTL cache.
 *
 * This is intentionally a small, swappable interface: to move to
 * Redis/Upstash later, implement the same get/set/has methods against
 * that store and swap the export below. Nothing else in the codebase
 * needs to change.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TenorCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs: number): void;
  has(key: string): boolean;
}

class InMemoryTtlCache<T> implements TenorCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}

// Single shared instance for the search-results cache.
// NOTE: this resets on server restart / per-instance in serverless
// deployments. That's acceptable for this feature (cache is a courtesy to
// Tenor, not a correctness requirement) but is the first thing to swap for
// Redis/Upstash in a multi-instance production deployment.
export const tenorSearchCache: TenorCache<unknown> = new InMemoryTtlCache();

export function cacheKeyForQuery(normalizedQuery: string): string {
  return `tenor:${normalizedQuery}`;
}
