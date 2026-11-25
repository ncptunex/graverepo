// The browser cache for normalised GitHub data (task 8.1, design 4.7; Req 7.1, 7.10, 7.11).
// Two tiers: an in-memory map in front of `localStorage`.
//
// Key format:  graverepo:v{schemaVersion}:{dataType}:{identifiers in lowercase}
// Ritual progress uses the separate `graverepo-progress:` prefix. This module only ever reads,
// writes or removes keys that start with `graverepo:` and never touches progress keys.
import { z } from 'zod';
import type { Route } from '../github/transport/types';

export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_KEY_PREFIX = 'graverepo:';

export type CacheDataType = 'user' | 'list' | 'detail';

/** The part of `Storage` the cache uses. Tests pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export type CacheHit<T> = {
  readonly data: T;
  /** When GitHub was originally contacted (ISO UTC). */
  readonly fetchedAt: string;
  readonly route: Route;
};

const entrySchema = z.object({
  schemaVersion: z.literal(CACHE_SCHEMA_VERSION),
  fetchedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date'),
  route: z.enum(['direct', 'proxy']),
  data: z.unknown(),
});

/** An entry is fresh exactly while its age is under the window (Req 7.2–7.4). */
export function isFresh(fetchedAt: string, nowMs: number, windowMs: number): boolean {
  return nowMs - Date.parse(fetchedAt) < windowMs;
}

/** `localStorage`, or null when the browser does not allow it (for example, private mode). */
export function getDefaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export type GitHubCache = {
  /** The stored value, or null when missing, unreadable or of another schema version. */
  read<T>(dataType: CacheDataType, id: string, schema: z.ZodType<T>): CacheHit<T> | null;
  write<T>(dataType: CacheDataType, id: string, data: T, fetchedAt: string, route: Route): void;
  remove(dataType: CacheDataType, id: string): void;
  /** True once a storage failure has switched the cache to memory only. */
  isMemoryOnly(): boolean;
};

export function createGitHubCache(storage: StorageLike | null = getDefaultStorage()): GitHubCache {
  const memory = new Map<string, CacheHit<unknown>>();
  let memoryOnly = storage === null;

  const keyFor = (dataType: CacheDataType, id: string) =>
    `${CACHE_KEY_PREFIX}v${CACHE_SCHEMA_VERSION}:${dataType}:${id.toLowerCase()}`;

  /** Every GitHub cache key currently in storage. Progress keys never match. */
  function listCacheKeys(): string[] {
    if (storage === null) return [];
    const keys: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null && key.startsWith(CACHE_KEY_PREFIX)) keys.push(key);
      }
    } catch {
      return [];
    }
    return keys;
  }

  function removeStoredKey(key: string): void {
    try {
      storage?.removeItem(key);
    } catch {
      // Nothing more can be done. The entry is ignored in memory either way.
    }
  }

  /** Entries written by another schema version are deleted (Req 7.10). */
  const currentPrefix = `${CACHE_KEY_PREFIX}v${CACHE_SCHEMA_VERSION}:`;
  for (const key of listCacheKeys()) {
    if (!key.startsWith(currentPrefix)) removeStoredKey(key);
  }

  /** Storage is full or failing: drop the GitHub cache keys and continue in memory (Req 7.11). */
  function switchToMemoryOnly(): void {
    for (const key of listCacheKeys()) removeStoredKey(key);
    memoryOnly = true;
  }

  return {
    read<T>(dataType: CacheDataType, id: string, schema: z.ZodType<T>): CacheHit<T> | null {
      const key = keyFor(dataType, id);
      const inMemory = memory.get(key);
      if (inMemory !== undefined) return inMemory as CacheHit<T>;
      if (memoryOnly || storage === null) return null;

      let text: string | null;
      try {
        text = storage.getItem(key);
      } catch {
        return null;
      }
      if (text === null) return null;

      let parsedEntry: z.infer<typeof entrySchema> | null = null;
      let data: T | null = null;
      try {
        const envelope = entrySchema.safeParse(JSON.parse(text));
        if (envelope.success) {
          parsedEntry = envelope.data;
          const payload = schema.safeParse(envelope.data.data);
          data = payload.success ? payload.data : null;
        }
      } catch {
        // Not valid JSON.
      }
      if (parsedEntry === null || data === null) {
        // Unreadable or wrong version: delete it and treat it as missing.
        removeStoredKey(key);
        return null;
      }
      const hit: CacheHit<T> = { data, fetchedAt: parsedEntry.fetchedAt, route: parsedEntry.route };
      memory.set(key, hit);
      return hit;
    },

    write<T>(dataType: CacheDataType, id: string, data: T, fetchedAt: string, route: Route): void {
      const key = keyFor(dataType, id);
      memory.set(key, { data, fetchedAt, route });
      if (memoryOnly || storage === null) return;
      try {
        storage.setItem(key, JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION, fetchedAt, route, data }));
      } catch {
        switchToMemoryOnly();
      }
    },

    remove(dataType: CacheDataType, id: string): void {
      const key = keyFor(dataType, id);
      memory.delete(key);
      removeStoredKey(key);
    },

    isMemoryOnly: () => memoryOnly,
  };
}
