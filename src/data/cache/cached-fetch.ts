// Cache-first fetching with freshness, stale fallback and forced refresh
// (task 8.2, design 3.1 and 4.7; Req 7.2–7.9, 9.7, 10.3).
//
// 1. A fresh cached entry is returned with no request (source `cache`).
// 2. A stale or missing entry is fetched. A successful fetch replaces the entry (source `live`).
// 3. If the fetch fails and a stale entry exists, the stale entry is returned, marked stale,
//    with the error that stopped the refresh. This also covers a route blocked by a primary
//    rate limit (the route selector's error reaches this code as a failed fetch).
// 4. `forceRefresh` skips the cache completely for that call: no fresh hit and no stale fallback.
// 5. Results that must not be cached (a partial list) are returned but not stored.
//
// A cancelled caller gets a `cancelled` error and no data. Identical concurrent calls share
// one fetch through `InFlight`.
import type { z } from 'zod';
import { makeError, type DataError } from '../github/errors/error-kinds';
import type { Route } from '../github/transport/types';
import type { DataResult, RateLimitStatus, RepositoryList, Warning } from '../github/types';
import { isFresh, type CacheDataType, type GitHubCache } from './github-cache';
import type { InFlight } from './in-flight';

export type FetchOutcome<T> =
  | {
      readonly ok: true;
      readonly data: T;
      /** When GitHub was contacted (ISO UTC). */
      readonly fetchedAt: string;
      readonly route: Route;
      readonly warnings?: readonly Warning[];
      /** False for a result that must not be cached, such as a partial list. Defaults to true. */
      readonly cacheable?: boolean;
    }
  | { readonly ok: false; readonly error: DataError };

export type CachedFetchOptions<T> = {
  readonly dataType: CacheDataType;
  /** Official identifiers, for example `octocat` or `octocat/hello-world`. Lowercased for the key. */
  readonly id: string;
  readonly schema: z.ZodType<T>;
  readonly freshnessMs: number;
  readonly forceRefresh?: boolean;
  readonly signal?: AbortSignal;
  /** Performs the network work. It must not depend on this caller's signal (D21). */
  readonly fetcher: () => Promise<FetchOutcome<T>>;
};

export type CachedFetcher = {
  fetch<T>(options: CachedFetchOptions<T>): Promise<DataResult<T>>;
};

/** A partial list is not cached. A list truncated at the cap is, because the cap is on purpose (Req 7.8, 7.9). */
export function isCacheableRepositoryList(list: RepositoryList): boolean {
  return !list.partial;
}

export function createCachedFetcher(dependencies: {
  readonly cache: GitHubCache;
  readonly inFlight: InFlight;
  readonly now: () => Date;
  /** The latest rate-limit status, read when each result is built. */
  readonly rateLimit: () => RateLimitStatus;
}): CachedFetcher {
  const { cache, inFlight, now } = dependencies;

  return {
    async fetch<T>(options: CachedFetchOptions<T>): Promise<DataResult<T>> {
      const failed = (error: DataError): DataResult<T> => ({
        ok: false,
        error,
        rateLimit: dependencies.rateLimit(),
      });
      if (options.signal?.aborted) return failed(makeError('cancelled'));

      const forced = options.forceRefresh === true;
      const cached = forced ? null : cache.read(options.dataType, options.id, options.schema);

      if (cached !== null && isFresh(cached.fetchedAt, now().getTime(), options.freshnessMs)) {
        return {
          ok: true,
          data: cached.data,
          provenance: { source: 'cache', route: cached.route, fetchedAt: cached.fetchedAt, stale: false },
          warnings: [],
          rateLimit: dependencies.rateLimit(),
        };
      }

      const key = `${options.dataType}:${options.id.toLowerCase()}:${forced ? 'forced' : 'normal'}`;
      const shared = await inFlight.run(
        key,
        async () => {
          const outcome = await options.fetcher();
          if (outcome.ok && outcome.cacheable !== false) {
            cache.write(options.dataType, options.id, outcome.data, outcome.fetchedAt, outcome.route);
          }
          return outcome;
        },
        options.signal,
      );
      if (shared.cancelled) return failed(makeError('cancelled'));

      const outcome = shared.value;
      if (outcome.ok) {
        return {
          ok: true,
          data: outcome.data,
          provenance: { source: 'live', route: outcome.route, fetchedAt: outcome.fetchedAt, stale: false },
          warnings: outcome.warnings ?? [],
          rateLimit: dependencies.rateLimit(),
        };
      }

      // The refresh failed. A stale copy is better than nothing, unless the caller cancelled.
      if (cached !== null && outcome.error.kind !== 'cancelled') {
        return {
          ok: true,
          data: cached.data,
          provenance: { source: 'cache', route: cached.route, fetchedAt: cached.fetchedAt, stale: true },
          warnings: [
            {
              kind: 'stale-data',
              ageMs: now().getTime() - Date.parse(cached.fetchedAt),
              refreshErrorKind: outcome.error.kind,
            },
          ],
          rateLimit: dependencies.rateLimit(),
          refreshError: outcome.error,
        };
      }
      return failed(outcome.error);
    },
  };
}
