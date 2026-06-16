/** Short-lived in-memory cache for expensive Firestore stats queries (per server instance). */

export const STATS_QUERY_CACHE_TTL_MS = 15_000;
const DEFAULT_TTL_MS = STATS_QUERY_CACHE_TTL_MS;
const MAX_ENTRIES = 128;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const cache = new Map<string, CacheEntry>();

export function getStatsQueryCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setStatsQueryCached(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export async function withStatsQueryCache<T>(
  key: string,
  loader: () => Promise<T>,
  opts?: { bypass?: boolean; ttlMs?: number }
): Promise<T> {
  if (!opts?.bypass) {
    const cached = getStatsQueryCached<T>(key);
    if (cached !== undefined) return cached;
  }
  const value = await loader();
  setStatsQueryCached(key, value, opts?.ttlMs);
  return value;
}

/** Drop cached stats for a user after new telemetry is written so dashboards update quickly. */
export function invalidateStatsQueryCacheForUid(uid: string): void {
  const normalized = String(uid || "").trim();
  if (!normalized) return;
  const prefixes = [
    `ide-events:${normalized}:`,
    `host-events:${normalized}:`,
    `optimize-events:${normalized}:`
  ];
  for (const key of [...cache.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      cache.delete(key);
    }
  }
}
