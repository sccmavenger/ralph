/**
 * Simple in-memory Map-based cache with configurable TTL.
 * Used by planner API routes to cache heavy MSF API responses.
 *
 * - Global game data (events, episodic details, character info, upgrade costs): 1-hour TTL
 * - Player-specific data (roster, inventory): never cached
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(): void {
  cache.clear();
}
