// State tests for the dashboard session (graveyard-dashboard task 3.4: D-S1 to D-S7, D-I2).
// Uses a fake data layer and a fake ritual. The demo comes from the test-only loader, never
// from production data. No test reaches GitHub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeError, type DataError, type DataResult, type RepositoryList } from '../../src/data/github';
import {
  createDashboardSession,
  SLOW_AFTER_MS,
  type DashboardDataLayer,
  type DashboardRitual,
} from '../../src/state/dashboard-session';
import { DEFAULT_FILTERS } from '../../src/state/graveyard-filters';
import type { RevivedRecord } from '../../src/ritual/types';
import { buildSummary } from '../ritual/builders';
import { loadTestOnlyDemoGraveyard } from '../ritual/test-demo';

const NO_LIMIT = { route: 'direct', limit: null, remaining: null, resetAt: null, tokenUsed: false, blockedUntil: null } as const;

function listResult(login: string, overrides: Partial<Extract<DataResult<RepositoryList>, { ok: true }>> = {}): DataResult<RepositoryList> {
  return {
    ok: true,
    data: {
      owner: { login, displayName: null, avatarUrl: null, profileUrl: `https://github.com/${login}`, accountType: 'user', publicRepoCount: 1 },
      repositories: [buildSummary({ owner: login, name: 'one', fullName: `${login}/one` })],
      retrievedCount: 1,
      totalPublicCount: 1,
      truncated: false,
      partial: false,
      droppedInvalidCount: 0,
      droppedPrivateCount: 0,
    },
    provenance: { source: 'live', route: 'direct', fetchedAt: '2026-11-23T10:00:00.000Z', stale: false },
    warnings: [],
    rateLimit: NO_LIMIT,
    ...overrides,
  };
}

function failure(error: DataError): DataResult<RepositoryList> {
  return { ok: false, error, rateLimit: NO_LIMIT };
}

type Deferred = { promise: Promise<DataResult<RepositoryList>>; resolve: (value: DataResult<RepositoryList>) => void };
function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  const promise = new Promise<DataResult<RepositoryList>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(listImpl?: (username: string, signal: AbortSignal | undefined) => Promise<DataResult<RepositoryList>>) {
  const listCalls: { username: string; signal: AbortSignal | undefined }[] = [];
  let demoLoads = 0;
  const dataLayer: DashboardDataLayer = {
    listRepositories(username, options) {
      listCalls.push({ username, signal: options?.signal });
      return (listImpl ?? (async (name) => listResult(name)))(username, options?.signal);
    },
    loadDemoGraveyard() {
      demoLoads += 1;
      return loadTestOnlyDemoGraveyard();
    },
  };
  const revived: RevivedRecord[] = [];
  const ritual = {
    openRitual: vi.fn(async () => {}),
    closeRitual: vi.fn(),
    listRevived: vi.fn(() => revived),
  } satisfies DashboardRitual;
  const session = createDashboardSession({ dataLayer, ritual });
  return { session, ritual, listCalls, demoLoads: () => demoLoads, revived };
}

function record(owner: string, repo: string): RevivedRecord {
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    wasArchived: false,
    source: 'demo',
    evidenceFetchedAt: '2026-11-20T00:00:00.000Z',
    requiredCount: 1,
    revivedAt: '2026-11-22T00:00:00.000Z',
  };
}

describe('startup (D-S5)', () => {
  it('calls no data-layer function and no fetch when created', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { listCalls, demoLoads, session } = setup();
    expect(session.getState()).toMatchObject({ view: 'landing', graveyard: { status: 'idle' }, revivedCount: 0 });
    expect(listCalls).toHaveLength(0);
    expect(demoLoads()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('search paths (D-S1)', () => {
  it('sets loading, then ready with the result as returned', async () => {
    const { session, listCalls } = setup();
    const pending = session.searchAccount('  octocat ');
    expect(session.getState().graveyard).toMatchObject({ status: 'loading', source: 'live', name: 'octocat', isSlow: false });
    expect(session.getState().view).toBe('graveyard');
    await pending;
    const { graveyard } = session.getState();
    expect(graveyard.status).toBe('ready');
    if (graveyard.status === 'ready') {
      expect(graveyard.source).toBe('live');
      expect(graveyard.result.provenance.source).toBe('live');
    }
    expect(listCalls[0]?.username).toBe('octocat');
    expect(listCalls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps provenance, warnings and refreshError as returned', async () => {
    const refreshError = makeError('network');
    const result = listResult('o', {
      provenance: { source: 'cache', route: 'direct', fetchedAt: '2026-11-23T08:00:00.000Z', stale: true },
      warnings: [{ kind: 'stale-data', ageMs: 1, refreshErrorKind: 'network' }],
      refreshError,
    });
    const { session } = setup(async () => result);
    await session.searchAccount('o');
    const { graveyard } = session.getState();
    expect(graveyard.status === 'ready' && graveyard.result).toBe(result);
  });

  it('accepts an empty list', async () => {
    const full = listResult('o');
    const empty: DataResult<RepositoryList> = full.ok ? { ...full, data: { ...full.data, repositories: [], retrievedCount: 0 } } : full;
    const { session } = setup(async () => empty);
    await session.searchAccount('o');
    expect(session.getState().graveyard.status).toBe('ready');
  });

  it('sets error, keeps the query and clears the previous graveyard, for each failing kind', async () => {
    for (const kind of ['rate-limited', 'network', 'user-not-found', 'invalid-username', 'timeout'] as const) {
      const error = makeError(kind, { username: 'who' });
      const { session } = setup(async (name) => (name === 'ok' ? listResult('ok') : failure(error)));
      await session.searchAccount('ok');
      await session.searchAccount(' Who ');
      const { graveyard } = session.getState();
      expect(graveyard).toEqual({ status: 'error', error, query: ' Who ' });
    }
  });

  it('turns an unexpected throw into an error result', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session } = setup(async () => {
      throw new Error('boom');
    });
    await session.searchAccount('x');
    expect(session.getState().graveyard).toMatchObject({ status: 'error', error: { kind: 'unexpected-response' } });
    consoleSpy.mockRestore();
  });

  it('resets the filters for a new graveyard', async () => {
    const { session } = setup();
    await session.searchAccount('a');
    session.setFilters({ text: 'zzz', includeForks: false });
    expect(session.getState().filters).toEqual({ text: 'zzz', includeForks: false, includeArchived: true });
    await session.searchAccount('b');
    expect(session.getState().filters).toEqual(DEFAULT_FILTERS);
  });

  it('clears filters without any request', async () => {
    const { session, listCalls } = setup();
    await session.searchAccount('a');
    session.setFilters({ text: 'q' });
    session.clearFilters();
    expect(session.getState().filters).toEqual(DEFAULT_FILTERS);
    expect(listCalls).toHaveLength(1);
  });
});

describe('demo offers after a search failure (D-I2)', () => {
  it('records demoAvailable as the data layer reported it', async () => {
    for (const [kind, expected] of [['rate-limited', true], ['network', true], ['user-not-found', false]] as const) {
      const { session } = setup(async () => failure(makeError(kind)));
      await session.searchAccount('x');
      const { graveyard } = session.getState();
      expect(graveyard.status === 'error' && graveyard.error.demoAvailable).toBe(expected);
    }
  });

  it('can open the demo after a failed search', async () => {
    const { session } = setup(async () => failure(makeError('rate-limited')));
    await session.searchAccount('x');
    await session.openDemo();
    expect(session.getState().graveyard).toMatchObject({ status: 'ready', source: 'demo' });
  });
});

describe('cancellation (D-S2)', () => {
  it('aborts the first search when a second starts, and drops the late first result', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const { session, listCalls } = setup(() => queue.shift()!.promise);
    const one = session.searchAccount('first');
    const two = session.searchAccount('second');
    expect(listCalls[0]?.signal?.aborted).toBe(true);
    expect(listCalls[1]?.signal?.aborted).toBe(false);
    second.resolve(listResult('second'));
    await two;
    first.resolve(listResult('first'));
    await one;
    const { graveyard } = session.getState();
    expect(graveyard.status === 'ready' && 'owner' in graveyard.result.data && graveyard.result.data.owner.login).toBe('second');
  });

  it('changes nothing when the result is cancelled', async () => {
    const gate = deferred();
    const { session } = setup(() => gate.promise);
    const pending = session.searchAccount('x');
    const before = session.getState().graveyard;
    gate.resolve(failure(makeError('cancelled')));
    await pending;
    expect(session.getState().graveyard).toEqual(before);
  });

  it('drops a late search result after the demo opened', async () => {
    const gate = deferred();
    const { session } = setup(() => gate.promise);
    const search = session.searchAccount('late');
    await session.openDemo();
    gate.resolve(listResult('late'));
    await search;
    expect(session.getState().graveyard).toMatchObject({ status: 'ready', source: 'demo' });
  });
});

describe('demo (D-S3)', () => {
  it('uses only loadDemoGraveyard, makes no fetch, and has source demo', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { session, listCalls, demoLoads } = setup();
    await session.openDemo();
    expect(demoLoads()).toBe(1);
    expect(listCalls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const { graveyard } = session.getState();
    expect(graveyard).toMatchObject({ status: 'ready', source: 'demo' });
    expect(graveyard.status === 'loading' && graveyard.name).toBeFalsy();
    vi.unstubAllGlobals();
  });

  it('replaces a live result with the demo and the reverse', async () => {
    const { session } = setup();
    await session.searchAccount('a');
    await session.openDemo();
    expect(session.getState().graveyard).toMatchObject({ status: 'ready', source: 'demo' });
    await session.searchAccount('b');
    expect(session.getState().graveyard).toMatchObject({ status: 'ready', source: 'live' });
  });

  it('sets an error without a demo offer for demo-unavailable', async () => {
    const listCalls: string[] = [];
    const session = createDashboardSession({
      dataLayer: {
        listRepositories: async (name) => {
          listCalls.push(name);
          return listResult(name);
        },
        loadDemoGraveyard: async () => ({ ok: false, error: makeError('demo-unavailable'), rateLimit: NO_LIMIT }),
      },
      ritual: { openRitual: async () => {}, closeRitual: () => {}, listRevived: () => [] },
    });
    await session.openDemo();
    const { graveyard } = session.getState();
    expect(graveyard).toMatchObject({ status: 'error', error: { kind: 'demo-unavailable', demoAvailable: false } });
  });
});

describe('hand-off (D-S4)', () => {
  it('calls openRitual once with the owner, name, summary and the graveyard source (demo)', async () => {
    const { session, ritual } = setup();
    await session.openDemo();
    await session.openTombstone('test-owner', 'test-archived');
    expect(ritual.openRitual).toHaveBeenCalledTimes(1);
    const [repository, source, options] = ritual.openRitual.mock.calls[0] as unknown as [
      { owner: string; repo: string },
      string,
      { summary: { name: string } },
    ];
    expect(repository).toEqual({ owner: 'test-owner', repo: 'test-archived' });
    expect(source).toBe('demo');
    expect(options.summary.name).toBe('test-archived');
    expect(session.getState().view).toBe('ritual');
  });

  it('uses source live for a live graveyard, matching names case-insensitively', async () => {
    const { session, ritual } = setup();
    await session.searchAccount('Octo');
    await session.openTombstone('OCTO', 'ONE');
    expect((ritual.openRitual.mock.calls[0] as unknown as unknown[])[1]).toBe('live');
  });

  it('is ignored unless the graveyard is ready, or the repository is unknown', async () => {
    const { session, ritual } = setup();
    await session.openTombstone('a', 'b');
    await session.openDemo();
    await session.openTombstone('nobody', 'nothing');
    expect(ritual.openRitual).not.toHaveBeenCalled();
    expect(session.getState().view).toBe('graveyard');
  });

  it('backToGraveyard closes the ritual and keeps the result and filters', async () => {
    const { session, ritual } = setup();
    await session.openDemo();
    session.setFilters({ text: 'test' });
    const result = session.getState().graveyard;
    await session.openTombstone('test-owner', 'test-healthy');
    session.backToGraveyard();
    expect(ritual.closeRitual).toHaveBeenCalledTimes(1);
    expect(session.getState().view).toBe('graveyard');
    expect(session.getState().graveyard).toBe(result);
    expect(session.getState().filters.text).toBe('test');
  });

  it('goHome closes an open ritual and keeps the graveyard in memory', async () => {
    const { session, ritual } = setup();
    await session.openDemo();
    await session.openTombstone('test-owner', 'test-healthy');
    session.goHome();
    expect(ritual.closeRitual).toHaveBeenCalledTimes(1);
    expect(session.getState().view).toBe('landing');
    expect(session.getState().graveyard.status).toBe('ready');
  });

  it('goHome closes nothing when no ritual is open', () => {
    const { session, ritual } = setup();
    session.goHome();
    expect(ritual.closeRitual).not.toHaveBeenCalled();
  });
});

describe('The Living (D-S6)', () => {
  it('shows what listRevived returns, in that order, with the count and no request', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { session, revived, listCalls } = setup();
    revived.push(record('a', 'newest'), record('a', 'older'), record('a', 'oldest'));
    session.showLiving();
    const state = session.getState();
    expect(state.view).toBe('living');
    expect(state.revived.map((r) => r.repo)).toEqual(['newest', 'older', 'oldest']);
    expect(state.revivedCount).toBe(3);
    expect(listCalls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('has an empty state, and refreshRevivedCount updates only the count and list', () => {
    const { session, revived } = setup();
    session.showLiving();
    expect(session.getState()).toMatchObject({ revivedCount: 0, revived: [] });
    revived.push(record('a', 'x'));
    session.goHome();
    session.refreshRevivedCount();
    expect(session.getState()).toMatchObject({ view: 'landing', revivedCount: 1 });
  });

  it('closes an open ritual when going to The Living', async () => {
    const { session, ritual } = setup();
    await session.openDemo();
    await session.openTombstone('test-owner', 'test-healthy');
    session.showLiving();
    expect(ritual.closeRitual).toHaveBeenCalledTimes(1);
  });
});

describe('storage (D-S7, storage)', () => {
  it('writes no localStorage key', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 });
    const { session } = setup();
    await session.searchAccount('a');
    await session.openDemo();
    session.setFilters({ text: 'x' });
    session.showLiving();
    session.goHome();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('slow timer (D-S7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns isSlow on after 8 seconds of a running search', async () => {
    const gate = deferred();
    const { session } = setup(() => gate.promise);
    const pending = session.searchAccount('x');
    vi.advanceTimersByTime(SLOW_AFTER_MS - 1);
    expect(session.getState().graveyard).toMatchObject({ status: 'loading', isSlow: false });
    vi.advanceTimersByTime(1);
    expect(session.getState().graveyard).toMatchObject({ status: 'loading', isSlow: true });
    gate.resolve(listResult('x'));
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer on success, error and cancelled', async () => {
    for (const result of [listResult('x'), failure(makeError('network')), failure(makeError('cancelled'))]) {
      const gate = deferred();
      const { session } = setup(() => gate.promise);
      const pending = session.searchAccount('x');
      expect(vi.getTimerCount()).toBe(1);
      gate.resolve(result);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(SLOW_AFTER_MS * 2);
      const { graveyard } = session.getState();
      expect(graveyard.status === 'loading' && graveyard.isSlow).toBeFalsy();
    }
  });

  it('clears the old timer when a newer search starts, and a stale timer never sets isSlow on search 2', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const { session } = setup(() => queue.shift()!.promise);
    const one = session.searchAccount('one');
    vi.advanceTimersByTime(SLOW_AFTER_MS - 1000);
    const two = session.searchAccount('two');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(session.getState().graveyard).toMatchObject({ status: 'loading', name: 'two', isSlow: false });
    first.resolve(listResult('one'));
    second.resolve(listResult('two'));
    await Promise.all([one, two]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the demo replaces a search, and the demo starts no timer', async () => {
    const gate = deferred();
    const { session } = setup(() => gate.promise);
    const search = session.searchAccount('x');
    expect(vi.getTimerCount()).toBe(1);
    const demo = session.openDemo();
    expect(vi.getTimerCount()).toBe(0);
    await demo;
    gate.resolve(listResult('x'));
    await search;
    vi.advanceTimersByTime(SLOW_AFTER_MS * 2);
    expect(session.getState().graveyard).toMatchObject({ status: 'ready', source: 'demo' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer and aborts on dispose', () => {
    const gate = deferred();
    const { session, listCalls } = setup(() => gate.promise);
    void session.searchAccount('x');
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(listCalls[0]?.signal?.aborted).toBe(true);
  });
});
