// Cache tests with fake timers (task 8.4, design 8.6; Req 7, 9.7, 10.3), plus the freshness
// property test (design 8.9). Nothing here touches the network or the real `localStorage`.
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_AND_LIST_FRESHNESS_MS } from '../../shared/github-endpoints/catalogue';
import {
  repositoryDetailSchema,
  repositoryListSchema,
  userProfileSchema,
} from '../../src/data/cache/payload-schemas';
import {
  CACHE_KEY_PREFIX,
  createGitHubCache,
  isFresh,
  type StorageLike,
} from '../../src/data/cache/github-cache';
import {
  createCachedFetcher,
  isCacheableRepositoryList,
  type FetchOutcome,
} from '../../src/data/cache/cached-fetch';
import { createInFlight } from '../../src/data/cache/in-flight';
import { adaptRepositoryPage } from '../../src/data/github/adapters/repository';
import { adaptUser } from '../../src/data/github/adapters/user';
import { assembleDetail, activityWindowStart } from '../../src/data/github/detail-assembly';
import { makeError } from '../../src/data/github/errors/error-kinds';
import type { RateLimitStatus, RepositoryDetail, RepositoryList, UserProfile } from '../../src/data/github/types';
import { capturedResponse, loadCaptured } from './helpers/fixtures';

const START = new Date('2026-11-22T13:00:00.000Z');
const MINUTE = 60_000;

/** A fake `localStorage` that can be told to fail on writes. */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWrites = false;
  setItemCalls = 0;
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.setItemCalls += 1;
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  keys() {
    return [...this.items.keys()];
  }
}

function makeUser(): UserProfile {
  const result = adaptUser(loadCaptured('user.ncptunex.json').body);
  if (!result.ok) throw new Error('fixture should convert');
  return result.value;
}

function makeList(overrides: Partial<RepositoryList> = {}): RepositoryList {
  const page = adaptRepositoryPage(loadCaptured('user-repos.ncptunex.json').body);
  if (!page.ok) throw new Error('fixture should convert');
  return {
    owner: makeUser(),
    repositories: page.value.repositories,
    retrievedCount: page.value.repositories.length,
    totalPublicCount: page.value.repositories.length,
    truncated: false,
    partial: false,
    droppedInvalidCount: 0,
    droppedPrivateCount: 0,
    ...overrides,
  };
}

function makeDetail(): RepositoryDetail {
  const result = assembleDetail(
    {
      repo: capturedResponse('repo.ncptunex.foodstarter.json'),
      readme: capturedResponse('readme.dubzzz.fast-check.json'),
      latestCommit: capturedResponse('commits-latest.dubzzz.fast-check.json'),
      issues: capturedResponse('issues.dubzzz.fast-check.json'),
      branches: capturedResponse('branches.dubzzz.fast-check.json'),
      ci: capturedResponse('workflow-runs.dubzzz.fast-check.json'),
      rootContents: capturedResponse('root-contents.ncptunex.foodstarter.json'),
      recentAuthors: capturedResponse('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json'),
      manifestCommit: capturedResponse('commits-manifest.ncptunex.foodstarter.json'),
    },
    activityWindowStart(START),
  );
  if (!result.ok) throw new Error('fixtures should assemble');
  return result.value;
}

const RATE_LIMIT: RateLimitStatus = {
  route: 'direct',
  limit: 60,
  remaining: 50,
  resetAt: null,
  tokenUsed: false,
  blockedUntil: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('payload schemas accept what the adapters produce', () => {
  it('for a user, a repository list and a repository detail, after a JSON round trip', () => {
    expect(userProfileSchema.safeParse(JSON.parse(JSON.stringify(makeUser()))).success).toBe(true);
    expect(repositoryListSchema.safeParse(JSON.parse(JSON.stringify(makeList()))).success).toBe(true);
    expect(repositoryDetailSchema.safeParse(JSON.parse(JSON.stringify(makeDetail()))).success).toBe(true);
  });

  it('and reject a value of the wrong shape', () => {
    expect(userProfileSchema.safeParse({ login: 5 }).success).toBe(false);
    expect(repositoryDetailSchema.safeParse({ core: {} }).success).toBe(false);
  });
});

describe('browser cache storage', () => {
  it('uses the key format graverepo:v1:{type}:{lowercase identifiers}', () => {
    const storage = new FakeStorage();
    createGitHubCache(storage).write('detail', 'ncptunex/FoodStarter', makeDetail(), START.toISOString(), 'direct');
    expect(storage.keys()).toEqual(['graverepo:v1:detail:ncptunex/foodstarter']);
  });

  it('stores the schema version, fetch time and route, and reads the value back from storage', () => {
    const storage = new FakeStorage();
    createGitHubCache(storage).write('user', 'ncptunex', makeUser(), START.toISOString(), 'direct');
    const stored = JSON.parse(storage.getItem('graverepo:v1:user:ncptunex') ?? '{}');
    expect(stored).toMatchObject({ schemaVersion: 1, fetchedAt: START.toISOString(), route: 'direct' });

    // A new cache object has no memory, so this read comes from storage.
    const hit = createGitHubCache(storage).read('user', 'NCPTUNEX', userProfileSchema);
    expect(hit?.data).toEqual(makeUser());
    expect(hit?.fetchedAt).toBe(START.toISOString());
  });

  it('deletes an entry with another schema version and treats it as missing', () => {
    const storage = new FakeStorage();
    const key = 'graverepo:v1:user:ncptunex';
    storage.setItem(key, JSON.stringify({ schemaVersion: 99, fetchedAt: START.toISOString(), route: 'direct', data: makeUser() }));
    expect(createGitHubCache(storage).read('user', 'ncptunex', userProfileSchema)).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('deletes unreadable entries: broken JSON, and data that does not match its schema', () => {
    const storage = new FakeStorage();
    storage.setItem('graverepo:v1:user:one', '{not json');
    storage.setItem(
      'graverepo:v1:user:two',
      JSON.stringify({ schemaVersion: 1, fetchedAt: START.toISOString(), route: 'direct', data: { login: 5 } }),
    );
    const cache = createGitHubCache(storage);
    expect(cache.read('user', 'one', userProfileSchema)).toBeNull();
    expect(cache.read('user', 'two', userProfileSchema)).toBeNull();
    expect(storage.keys()).toEqual([]);
  });

  it('removes entries written under an older key version when it starts, and leaves progress keys alone', () => {
    const storage = new FakeStorage();
    storage.setItem('graverepo:v0:user:old', '{}');
    storage.setItem('graverepo-progress:v1:ncptunex/foodstarter', '{"ticked":[1]}');
    createGitHubCache(storage);
    expect(storage.keys()).toEqual(['graverepo-progress:v1:ncptunex/foodstarter']);
  });

  it('on a storage write error, removes only graverepo: keys and carries on in memory', () => {
    const storage = new FakeStorage();
    const cache = createGitHubCache(storage);
    cache.write('user', 'first', makeUser(), START.toISOString(), 'direct');
    storage.setItem('graverepo-progress:v1:ncptunex/foodstarter', '{"ticked":[1,2]}');
    storage.setItem('unrelated-app-key', 'keep');

    storage.failWrites = true;
    cache.write('user', 'second', makeUser(), START.toISOString(), 'direct');

    expect(cache.isMemoryOnly()).toBe(true);
    expect(storage.keys().sort()).toEqual(['graverepo-progress:v1:ncptunex/foodstarter', 'unrelated-app-key']);
    expect(storage.getItem('graverepo-progress:v1:ncptunex/foodstarter')).toBe('{"ticked":[1,2]}');
    // Both values are still served from memory for the rest of the session.
    expect(cache.read('user', 'first', userProfileSchema)?.data).toEqual(makeUser());
    expect(cache.read('user', 'second', userProfileSchema)?.data).toEqual(makeUser());

    // Later writes no longer touch storage.
    const callsBefore = storage.setItemCalls;
    cache.write('user', 'third', makeUser(), START.toISOString(), 'direct');
    expect(storage.setItemCalls).toBe(callsBefore);
  });

  it('works in memory only when there is no storage at all', () => {
    const cache = createGitHubCache(null);
    cache.write('user', 'ncptunex', makeUser(), START.toISOString(), 'direct');
    expect(cache.isMemoryOnly()).toBe(true);
    expect(cache.read('user', 'ncptunex', userProfileSchema)?.data).toEqual(makeUser());
  });

  it('only ever uses the graverepo: prefix', () => {
    expect(CACHE_KEY_PREFIX).toBe('graverepo:');
    expect('graverepo-progress:v1:x'.startsWith(CACHE_KEY_PREFIX)).toBe(false);
  });
});

describe('freshness', () => {
  it('is fresh while the entry is younger than the window, and stale at the window', () => {
    const fetchedAt = START.toISOString();
    const at = (ms: number) => START.getTime() + ms;
    expect(isFresh(fetchedAt, at(0), 10 * MINUTE)).toBe(true);
    expect(isFresh(fetchedAt, at(10 * MINUTE - 1), 10 * MINUTE)).toBe(true);
    expect(isFresh(fetchedAt, at(10 * MINUTE), 10 * MINUTE)).toBe(false);
  });

  it('property: for any fetch time and current time, an entry is fresh exactly when its age is under the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        (fetchTime, age, window) => {
          const fetchedAt = new Date(fetchTime).toISOString();
          expect(isFresh(fetchedAt, fetchTime + age, window)).toBe(age < window);
        },
      ),
      { numRuns: 200 },
    );
  });
});

function setup(storage: StorageLike | null = new FakeStorage()) {
  const cache = createGitHubCache(storage);
  const fetcher = createCachedFetcher({
    cache,
    inFlight: createInFlight(),
    now: () => new Date(),
    rateLimit: () => RATE_LIMIT,
  });
  return { cache, fetcher };
}

function liveOutcome<T>(data: T, extra: Partial<Extract<FetchOutcome<T>, { ok: true }>> = {}): FetchOutcome<T> {
  return { ok: true, data, fetchedAt: new Date().toISOString(), route: 'direct', ...extra };
}

function userOptions(fetch: () => Promise<FetchOutcome<UserProfile>>, extra: object = {}) {
  return {
    dataType: 'user' as const,
    id: 'ncptunex',
    schema: userProfileSchema,
    freshnessMs: PROFILE_AND_LIST_FRESHNESS_MS,
    fetcher: fetch,
    ...extra,
  };
}

describe('cache-first fetching', () => {
  it('fetches on a miss, labels the result live, and stores it', async () => {
    const { fetcher } = setup();
    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    const result = await fetcher.fetch(userOptions(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.ok && result.provenance).toEqual({
      source: 'live',
      route: 'direct',
      fetchedAt: START.toISOString(),
      stale: false,
    });
  });

  it('serves a fresh entry with no request, keeping the original fetch time', async () => {
    const { fetcher } = setup();
    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    await fetcher.fetch(userOptions(fetch));

    vi.setSystemTime(new Date(START.getTime() + 9 * MINUTE));
    const second = await fetcher.fetch(userOptions(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.ok && second.provenance).toEqual({
      source: 'cache',
      route: 'direct',
      fetchedAt: START.toISOString(),
      stale: false,
    });
  });

  it('sends a request after the window, and a successful one replaces the entry', async () => {
    const { fetcher } = setup();
    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    await fetcher.fetch(userOptions(fetch));

    vi.setSystemTime(new Date(START.getTime() + 10 * MINUTE));
    const second = await fetcher.fetch(userOptions(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second.ok && second.provenance.source).toBe('live');
    expect(second.ok && second.provenance.fetchedAt).toBe(new Date(START.getTime() + 10 * MINUTE).toISOString());

    // The replaced entry is fresh again.
    const third = await fetcher.fetch(userOptions(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(third.ok && third.provenance.source).toBe('cache');
  });

  it('serves the stale entry with the refresh error when the refresh fails', async () => {
    const { fetcher } = setup();
    await fetcher.fetch(userOptions(async () => liveOutcome(makeUser())));

    vi.setSystemTime(new Date(START.getTime() + 25 * MINUTE));
    const error = makeError('network');
    const result = await fetcher.fetch(userOptions(async () => ({ ok: false, error })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance).toEqual({ source: 'cache', route: 'direct', fetchedAt: START.toISOString(), stale: true });
    expect(result.refreshError).toEqual(error);
    expect(result.warnings).toEqual([{ kind: 'stale-data', ageMs: 25 * MINUTE, refreshErrorKind: 'network' }]);
    expect(result.data).toEqual(makeUser());
  });

  it('returns the error when the fetch fails and there is no entry', async () => {
    const { fetcher } = setup();
    const result = await fetcher.fetch(userOptions(async () => ({ ok: false, error: makeError('timeout') })));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('timeout');
  });

  it('serves cached data while a primary limit blocks the route, without sending a request', async () => {
    const { fetcher } = setup();
    await fetcher.fetch(userOptions(async () => liveOutcome(makeUser())));
    const blocked = makeError('rate-limited', { limitType: 'primary', resetAt: new Date(START.getTime() + 50 * MINUTE).toISOString() });

    // Fresh: no fetch attempt at all.
    const fetch = vi.fn(async () => ({ ok: false as const, error: blocked }));
    const fresh = await fetcher.fetch(userOptions(fetch));
    expect(fetch).not.toHaveBeenCalled();
    expect(fresh.ok && fresh.provenance.source).toBe('cache');

    // Stale: the refresh is refused and the saved copy is shown with the reason.
    vi.setSystemTime(new Date(START.getTime() + 40 * MINUTE));
    const stale = await fetcher.fetch(userOptions(fetch));
    expect(stale.ok && stale.provenance.stale).toBe(true);
    expect(stale.ok && stale.refreshError?.kind).toBe('rate-limited');
  });

  it('skips the cache completely on a forced refresh, including the stale fallback', async () => {
    const { fetcher } = setup();
    await fetcher.fetch(userOptions(async () => liveOutcome(makeUser())));

    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    const forced = await fetcher.fetch(userOptions(fetch, { forceRefresh: true }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(forced.ok && forced.provenance.source).toBe('live');

    const failing = await fetcher.fetch(
      userOptions(async () => ({ ok: false, error: makeError('network') }), { forceRefresh: true }),
    );
    expect(failing.ok).toBe(false);
  });

  it('includes the rate-limit status in every result, success or error', async () => {
    const { fetcher } = setup();
    const ok = await fetcher.fetch(userOptions(async () => liveOutcome(makeUser())));
    const failed = await fetcher.fetch({ ...userOptions(async () => ({ ok: false, error: makeError('network') })), id: 'someone-else' });
    expect(ok.rateLimit).toEqual(RATE_LIMIT);
    expect(failed.rateLimit).toEqual(RATE_LIMIT);
  });

  it('does not cache a partial list, but caches a list truncated at the cap', async () => {
    const partial = makeList({ partial: true });
    const truncated = makeList({ truncated: true, totalPublicCount: 500 });
    expect(isCacheableRepositoryList(partial)).toBe(false);
    expect(isCacheableRepositoryList(truncated)).toBe(true);

    const { fetcher, cache } = setup();
    const options = (list: RepositoryList, id: string) => ({
      dataType: 'list' as const,
      id,
      schema: repositoryListSchema,
      freshnessMs: PROFILE_AND_LIST_FRESHNESS_MS,
      fetcher: async () => liveOutcome(list, { cacheable: isCacheableRepositoryList(list) }),
    });
    const first = await fetcher.fetch(options(partial, 'partial-user'));
    const second = await fetcher.fetch(options(truncated, 'truncated-user'));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(cache.read('list', 'partial-user', repositoryListSchema)).toBeNull();
    expect(cache.read('list', 'truncated-user', repositoryListSchema)).not.toBeNull();
  });

  it('property: a result built from the cache is never labelled live', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 120 * MINUTE }), fc.boolean(), async (elapsed, refreshFails) => {
        vi.setSystemTime(START);
        const { fetcher } = setup(null);
        await fetcher.fetch(userOptions(async () => liveOutcome(makeUser())));
        vi.setSystemTime(new Date(START.getTime() + elapsed));
        const result = await fetcher.fetch(
          userOptions(async () => (refreshFails ? { ok: false, error: makeError('network') } : liveOutcome(makeUser()))),
        );
        if (result.ok && result.provenance.source === 'live') {
          // Only a real fetch after the window can be live.
          expect(elapsed).toBeGreaterThanOrEqual(PROFILE_AND_LIST_FRESHNESS_MS);
          expect(refreshFails).toBe(false);
        }
        if (result.ok && result.provenance.stale) expect(result.provenance.source).toBe('cache');
      }),
      { numRuns: 60 },
    );
  });
});

describe('shared in-flight requests', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('sends one request for two identical concurrent calls and gives both the same result', async () => {
    const { fetcher } = setup();
    const gate = deferred<FetchOutcome<UserProfile>>();
    const fetch = vi.fn(() => gate.promise);

    const first = fetcher.fetch(userOptions(fetch));
    const second = fetcher.fetch(userOptions(fetch));
    gate.resolve(liveOutcome(makeUser()));
    const [a, b] = await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a.ok && a.provenance.source).toBe('live');
  });

  it('stops delivering to a caller that cancels, without affecting the other caller or the request', async () => {
    const { fetcher, cache } = setup();
    const gate = deferred<FetchOutcome<UserProfile>>();
    const fetch = vi.fn(() => gate.promise);
    const controller = new AbortController();

    const cancelling = fetcher.fetch(userOptions(fetch, { signal: controller.signal }));
    const staying = fetcher.fetch(userOptions(fetch));
    controller.abort();
    const cancelledResult = await cancelling;
    expect(cancelledResult.ok).toBe(false);
    expect(!cancelledResult.ok && cancelledResult.error.kind).toBe('cancelled');

    // The shared request was not aborted: it still finishes, and the other caller gets the data.
    gate.resolve(liveOutcome(makeUser()));
    const stayingResult = await staying;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stayingResult.ok).toBe(true);
    expect(cache.read('user', 'ncptunex', userProfileSchema)).not.toBeNull();
  });

  it('does not start a request for a caller that has already cancelled', async () => {
    const { fetcher } = setup();
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    const result = await fetcher.fetch(userOptions(fetch, { signal: controller.signal }));
    expect(fetch).not.toHaveBeenCalled();
    expect(!result.ok && result.error.kind).toBe('cancelled');
  });

  it('starts a new request once the shared one has finished', async () => {
    const { fetcher } = setup(null);
    const fetch = vi.fn(async () => liveOutcome(makeUser()));
    await fetcher.fetch(userOptions(fetch, { forceRefresh: true }));
    await fetcher.fetch(userOptions(fetch, { forceRefresh: true }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
