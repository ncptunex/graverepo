// State-layer tests for the ritual session (tasks 10.1–10.4; design 9.2–9.4).
// Covers: U14, U16, U18, P11, P15, I1, I2, I3, I5, I6, I7, I9, I10, I11, I12.
// Data comes from test builders and the TEST-ONLY demo loader. No test reaches GitHub:
// the global `fetch` is replaced by one that fails the test if it is called.
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeError } from '../../src/data/github';
import type { DataResult, RepositoryDetail } from '../../src/data/github/types';
import { createProgressStore, progressKey, type ProgressStorage } from '../../src/state/progress-store';
import { createRitualSession, readDisplayContext, type RitualState } from '../../src/state/ritual-session';
import { REF, buildDetail, buildDetailWithTwoSteps, available } from './builders';
import { TEST_DEMO_CAPTURED_AT, createFakeRitualDataLayer, liveResult } from './test-demo';

class FakeStorage implements ProgressStorage {
  readonly items = new Map<string, string>();
  failWrites = false;
  writes = 0;
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
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.writes += 1;
    this.items.set(key, value);
  }
}

const fetchSpy = vi.fn(() => Promise.reject(new Error('GitHub must not be called')));
beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

/** A clock that moves forward one minute on every read. */
function ticking(start = '2026-11-22T14:00:00.000Z') {
  let time = Date.parse(start);
  return () => {
    time += 60_000;
    return new Date(time);
  };
}

function setup(options: { storage?: FakeStorage; live?: Parameters<typeof createFakeRitualDataLayer>[0] } = {}) {
  const storage = options.storage ?? new FakeStorage();
  const dataLayer = createFakeRitualDataLayer(options.live);
  const store = createProgressStore({ storage, now: ticking() });
  const session = createRitualSession({
    dataLayer,
    store,
    now: ticking('2026-11-22T15:00:00.000Z'),
    displayContext: { locale: 'en', timeZone: 'UTC' },
  });
  return { storage, dataLayer, store, session };
}

type Open = Extract<RitualState, { status: 'open' }>;
function opened(session: { getState(): RitualState }): Open {
  const state = session.getState();
  if (state.status !== 'open') throw new Error(`Expected an open ritual, got ${state.status}`);
  return state;
}

const TWO_STEPS = { owner: 'test-owner', repo: 'test-two-steps' };
const HEALTHY = { owner: 'test-owner', repo: 'test-healthy' };
const ARCHIVED = { owner: 'test-owner', repo: 'test-archived' };

describe('opening a demo repository (test-only demo data)', () => {
  it('opens at Necropsy from the demo graveyard, with demo provenance, and writes and requests nothing', async () => {
    const { session, storage, dataLayer } = setup();
    await session.openRitual(TWO_STEPS, 'demo');

    const state = opened(session);
    expect(state.stage).toBe('necropsy');
    expect(state.progress).toBeNull();
    expect(state.provenance).toEqual({ source: 'demo', route: 'bundled', fetchedAt: TEST_DEMO_CAPTURED_AT, stale: false });
    // The reference time is the demo's capture date.
    expect(state.analysis.referenceTime).toBe(TEST_DEMO_CAPTURED_AT);
    expect(state.analysis.plan.items.map((item) => item.id)).toEqual(['add-readme', 'review-latest-commit']);
    expect(dataLayer.liveCalls).toHaveLength(0);
    expect(dataLayer.demoLoads()).toBe(1);
    expect(storage.writes).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports repo-not-found for a repository that is not in the demo, and creates no progress', async () => {
    const { session, storage } = setup();
    await session.openRitual({ owner: 'test-owner', repo: 'nope' }, 'demo');
    const state = session.getState();
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error.kind).toBe('repo-not-found');
    expect(storage.writes).toBe(0);
  });

  it('keeps one session at a time: opening another repository leaves the first one saved', async () => {
    const { session, store } = setup();
    await session.openRitual(TWO_STEPS, 'demo');
    session.applyStageChange('plan');
    await session.openRitual(HEALTHY, 'demo');
    expect(opened(session).detail.core.name).toBe('test-healthy');
    expect(store.read({ source: 'demo', owner: 'test-owner', repo: 'test-two-steps' })?.stage).toBe('plan');
  });
});

describe('the complete demo ritual with GitHub blocked (I1, I10)', () => {
  it('opens, skips to Rising, ticks every step, marks as revived, and lists it in The Living', async () => {
    const { session, storage, dataLayer } = setup();
    await session.openRitual(TWO_STEPS, 'demo');

    // Skip the Plan stage (O19).
    expect(session.applyStageChange('rising')).toEqual({ ok: true, saved: true });
    expect(opened(session).stage).toBe('rising');

    // Locked until every step is ticked.
    expect(session.markRevived()).toEqual({ ok: false, reason: 'gate-closed' });
    session.toggleItem('add-readme');
    expect(session.markRevived()).toEqual({ ok: false, reason: 'gate-closed' });
    session.toggleItem('review-latest-commit');

    const writesBeforeRevive = storage.writes;
    const calls = { live: dataLayer.liveCalls.length, demo: dataLayer.demoLoads() };
    expect(session.markRevived()).toEqual({ ok: true, saved: true });

    const state = opened(session);
    expect(state.stage).toBe('living');
    expect(state.progress?.revived).toMatchObject({
      owner: 'test-owner',
      repo: 'test-two-steps',
      source: 'demo',
      wasArchived: false,
      requiredCount: 2,
      evidenceFetchedAt: TEST_DEMO_CAPTURED_AT,
    });
    expect(session.listRevived().map((item) => item.repo)).toEqual(['test-two-steps']);

    // Revival is local: one write, no data-layer call, no fetch, only progress keys (I10).
    expect(storage.writes).toBe(writesBeforeRevive + 1);
    expect(dataLayer.liveCalls).toHaveLength(calls.live);
    expect(dataLayer.demoLoads()).toBe(calls.demo);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect([...storage.items.keys()].every((key) => key.startsWith('graverepo-progress:'))).toBe(true);
  });

  it('lets a plan with no steps be marked as revived straight away, with a null progress', async () => {
    const { session } = setup();
    await session.openRitual(HEALTHY, 'demo');
    expect(opened(session).analysis.plan.items).toEqual([]);
    expect(session.markRevived()).toEqual({ ok: true, saved: true });
    expect(opened(session).progress?.revived).toMatchObject({ requiredCount: 0 });
  });

  it('records an archived repository as archived, never as active', async () => {
    const { session } = setup();
    await session.openRitual(ARCHIVED, 'demo');
    const state = opened(session);
    expect(state.analysis.condition.id).toBe('archived');
    expect(state.analysis.plan.isArchived).toBe(true);
    for (const item of state.analysis.plan.items) session.toggleItem(item.id);
    session.markRevived();
    expect(session.listRevived()[0]).toMatchObject({ wasArchived: true });
  });
});

describe('stage rules in state (U14)', () => {
  it('moves freely among the first three stages, forward, backward and skipping', async () => {
    const { session } = setup();
    await session.openRitual(TWO_STEPS, 'demo');
    for (const target of ['rising', 'necropsy', 'plan', 'rising', 'plan'] as const) {
      expect(session.applyStageChange(target).ok).toBe(true);
      expect(opened(session).stage).toBe(target);
    }
  });

  it('refuses The Living before revival and changes and writes nothing', async () => {
    const { session, storage } = setup();
    await session.openRitual(TWO_STEPS, 'demo');
    expect(session.applyStageChange('living')).toEqual({ ok: false, reason: 'stage-not-allowed' });
    expect(opened(session).stage).toBe('necropsy');
    expect(storage.writes).toBe(0);
  });

  it('writes nothing when the visitor enters the stage they are already on', async () => {
    const { session, storage } = setup();
    await session.openRitual(TWO_STEPS, 'demo');
    expect(session.applyStageChange('necropsy').ok).toBe(true);
    expect(storage.writes).toBe(0);
    session.applyStageChange('plan');
    const writes = storage.writes;
    session.applyStageChange('plan');
    expect(storage.writes).toBe(writes);
  });

  it('refuses an item that is not in the plan, and every action when no ritual is open', async () => {
    const { session } = setup();
    expect(session.applyStageChange('plan')).toEqual({ ok: false, reason: 'not-open' });
    expect(session.toggleItem('add-readme')).toEqual({ ok: false, reason: 'not-open' });
    expect(session.markRevived()).toEqual({ ok: false, reason: 'not-open' });
    await session.openRitual(TWO_STEPS, 'demo');
    expect(session.toggleItem('check-dependencies')).toEqual({ ok: false, reason: 'unknown-item' });
  });

  it('unticks an item, and progress goes back down', async () => {
    const { session } = setup();
    await session.openRitual(TWO_STEPS, 'demo');
    session.toggleItem('add-readme');
    session.toggleItem('add-readme');
    expect(opened(session).progress?.tickedItemIds).toEqual([]);
  });
});

describe('after revival (U18)', () => {
  async function revived() {
    const context = setup();
    await context.session.openRitual(TWO_STEPS, 'demo');
    context.session.toggleItem('add-readme');
    context.session.toggleItem('review-latest-commit');
    context.session.markRevived();
    return context;
  }

  it('refuses ticking, a second revival and a gate-open check, and leaves the record alone', async () => {
    const { session } = await revived();
    const record = opened(session).progress?.revived;
    expect(session.toggleItem('add-readme')).toEqual({ ok: false, reason: 'locked' });
    expect(session.markRevived()).toEqual({ ok: false, reason: 'already-revived' });
    expect(opened(session).progress?.revived).toEqual(record);
    expect(opened(session).progress?.tickedItemIds).toEqual(['add-readme', 'review-latest-commit']);
  });

  it('lets the visitor view earlier stages and return to The Living, writing only stage and updatedAt', async () => {
    const { session } = await revived();
    const before = opened(session).progress;
    for (const target of ['necropsy', 'plan', 'rising', 'living'] as const) {
      expect(session.applyStageChange(target).ok).toBe(true);
    }
    const after = opened(session).progress;
    expect(after?.stage).toBe('living');
    expect(after?.revived).toEqual(before?.revived);
    expect(after?.tickedItemIds).toEqual(before?.tickedItemIds);
    expect(after?.evidenceFetchedAt).toBe(before?.evidenceFetchedAt);
    expect(after?.startedAt).toBe(before?.startedAt);
  });

  it('keeps the revival when the repository is reopened with a different plan', async () => {
    // A live repository, revived with a two-step plan.
    const storage = new FakeStorage();
    const detailA = buildDetailWithTwoSteps(REF);
    const first = setup({ storage, live: async () => liveResult(detailA, REF) });
    await first.session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    first.session.toggleItem('add-readme');
    first.session.toggleItem('review-latest-commit');
    first.session.markRevived();
    const record = opened(first.session).progress?.revived;
    expect(record).toBeTruthy();

    // Newer data for the same repository has a different (empty) plan.
    const newer = '2026-12-05T00:00:00.000Z';
    const next = setup({ storage, live: async () => liveResult(buildDetail({ reference: newer }), newer) });
    await next.session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    const state = opened(next.session);
    expect(state.analysis.plan.items).toEqual([]);
    expect(state.progress?.revived).toEqual(record);
    expect(state.progress?.evidenceFetchedAt).toBe(REF);
    expect(state.stage).toBe('living');
    expect(state.planChanged).toBe(false);
    expect(next.session.toggleItem('add-readme')).toEqual({ ok: false, reason: 'locked' });
    expect(next.session.markRevived()).toEqual({ ok: false, reason: 'already-revived' });
  });
});

describe('reload (I2, I11)', () => {
  it('restores the stage and ticks when the same repository is reopened in a new session', async () => {
    const first = setup();
    await first.session.openRitual(TWO_STEPS, 'demo');
    first.session.applyStageChange('rising');
    first.session.toggleItem('add-readme');

    // A new store and session over the same storage, as after a page reload.
    const reloaded = setup({ storage: first.storage });
    expect(reloaded.session.getState().status).toBe('idle');
    await reloaded.session.openRitual(TWO_STEPS, 'demo');

    const state = opened(reloaded.session);
    expect(state.stage).toBe('rising');
    expect(state.progress?.tickedItemIds).toEqual(['add-readme']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reloaded.dataLayer.liveCalls).toHaveLength(0);
  });

  it('restores a revived repository as The Living with ticks locked, and lists it', async () => {
    const first = setup();
    await first.session.openRitual(TWO_STEPS, 'demo');
    first.session.toggleItem('add-readme');
    first.session.toggleItem('review-latest-commit');
    first.session.markRevived();
    const record = opened(first.session).progress?.revived;

    const reloaded = setup({ storage: first.storage });
    expect(reloaded.session.listRevived()).toEqual([record]);
    await reloaded.session.openRitual(TWO_STEPS, 'demo');
    expect(opened(reloaded.session).stage).toBe('living');
    expect(opened(reloaded.session).progress?.revived).toEqual(record);
    expect(reloaded.session.toggleItem('add-readme')).toEqual({ ok: false, reason: 'locked' });
  });

  it('shows nothing in The Living after a reload when the revival could not be saved', async () => {
    const storage = new FakeStorage();
    const first = setup({ storage });
    await first.session.openRitual(HEALTHY, 'demo');
    storage.failWrites = true;
    const result = first.session.markRevived();
    expect(result).toEqual({ ok: true, saved: false });
    expect(opened(first.session).saveProblem).toBe(true);
    expect(first.session.listRevived()).toHaveLength(1);

    const reloaded = setup({ storage });
    expect(reloaded.session.listRevived()).toEqual([]);
  });
});

describe('invalid entries (I3)', () => {
  it('ignores an invalid entry for its repository, leaves it in storage, and does not touch others', async () => {
    const storage = new FakeStorage();
    const key = progressKey({ source: 'demo', owner: 'test-owner', repo: 'test-two-steps' });
    storage.items.set(key, JSON.stringify({ schemaVersion: 1, stage: 'rising', extra: true }));
    const otherKey = progressKey({ source: 'demo', owner: 'test-owner', repo: 'test-healthy' });
    storage.items.set(
      otherKey,
      JSON.stringify({
        schemaVersion: 1,
        stage: 'plan',
        tickedItemIds: [],
        evidenceFetchedAt: REF,
        startedAt: REF,
        updatedAt: REF,
        revived: null,
      }),
    );
    const { session } = setup({ storage });
    const invalidText = storage.items.get(key);

    await session.openRitual(TWO_STEPS, 'demo');
    expect(opened(session).progress).toBeNull();
    expect(opened(session).stage).toBe('necropsy');
    expect(storage.items.get(key)).toBe(invalidText);
    expect(session.listRevived()).toEqual([]);

    await session.openRitual(HEALTHY, 'demo');
    expect(opened(session).stage).toBe('plan');

    // The next valid write for the same key replaces the invalid entry.
    await session.openRitual(TWO_STEPS, 'demo');
    session.applyStageChange('plan');
    expect(storage.items.get(key)).not.toBe(invalidText);
  });
});

describe('plan-changed note (I7, O23)', () => {
  const OLD = '2026-11-01T00:00:00.000Z';
  const NEW = '2026-11-22T13:00:00.000Z';

  function savedEntry(ticked: string[], evidenceFetchedAt: string) {
    return JSON.stringify({
      schemaVersion: 1,
      stage: 'rising',
      tickedItemIds: ticked,
      evidenceFetchedAt,
      startedAt: OLD,
      updatedAt: OLD,
      revived: null,
    });
  }
  const key = progressKey({ source: 'live', owner: 'test-owner', repo: 'test-repo' });

  async function openLive(storage: FakeStorage, detail: RepositoryDetail, fetchedAt: string) {
    const context = setup({ storage, live: async () => liveResult(detail, fetchedAt) });
    await context.session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    return context;
  }

  it('shows when the reference time differs and a saved ticked ID is no longer in the plan', async () => {
    const storage = new FakeStorage();
    storage.items.set(key, savedEntry(['add-readme', 'check-workflow-run'], OLD));
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    const state = opened(session);
    expect(state.planChanged).toBe(true);
    // Ticked IDs are kept and progress counts only the current plan.
    expect(state.progress?.tickedItemIds).toEqual(['add-readme', 'check-workflow-run']);
  });

  it('does not show when the reference times match', async () => {
    const storage = new FakeStorage();
    storage.items.set(key, savedEntry(['add-readme', 'check-workflow-run'], NEW));
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    expect(opened(session).planChanged).toBe(false);
  });

  it('does not show merely because the data was refreshed, when every saved tick is still in the plan', async () => {
    const storage = new FakeStorage();
    storage.items.set(key, savedEntry(['add-readme'], OLD));
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    expect(opened(session).planChanged).toBe(false);
  });

  it('does not show when the plan only gained items', async () => {
    const storage = new FakeStorage();
    storage.items.set(key, savedEntry([], OLD));
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    expect(opened(session).planChanged).toBe(false);
  });

  it('does not show without saved progress, and reads the stored value before the first write', async () => {
    const storage = new FakeStorage();
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    expect(opened(session).planChanged).toBe(false);
    expect(storage.writes).toBe(0);
  });

  it('stores no plan field in the progress entry', async () => {
    const storage = new FakeStorage();
    const { session } = await openLive(storage, buildDetailWithTwoSteps(NEW), NEW);
    session.toggleItem('add-readme');
    const stored = JSON.parse(storage.items.get(key) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(
      ['evidenceFetchedAt', 'revived', 'schemaVersion', 'stage', 'startedAt', 'tickedItemIds', 'updatedAt'].sort(),
    );
  });
});

describe('live path with a fake data layer (I5, I6, I9, I12)', () => {
  it('calls getRepositoryDetail with the default options plus a signal, never forceRefresh (I9)', async () => {
    const { session, dataLayer } = setup({ live: async () => liveResult(buildDetail(), REF) });
    await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    expect(dataLayer.liveCalls).toHaveLength(1);
    const options = dataLayer.liveCalls[0]?.options as Record<string, unknown>;
    expect(options.forceRefresh).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(dataLayer.demoLoads()).toBe(0);
    expect(opened(session).provenance.source).toBe('live');
  });

  it('shows data-layer errors, offers the demo only when allowed, and creates no progress (I5)', async () => {
    for (const kind of ['network', 'rate-limited', 'repo-not-found'] as const) {
      const error = makeError(kind, kind === 'rate-limited' ? { limitType: 'primary', resetAt: REF } : {});
      const { session, storage } = setup({
        live: async () => ({ ok: false, error, rateLimit: liveResultRateLimit() }),
      });
      await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
      const state = session.getState();
      expect(state.status).toBe('error');
      if (state.status !== 'error') return;
      expect(state.error.kind).toBe(kind);
      expect(state.error.demoAvailable).toBe(kind !== 'repo-not-found');
      expect(storage.writes).toBe(0);
    }
  });

  it('does not open, and leaves saved progress untouched, when the detail cannot be loaded', async () => {
    const storage = new FakeStorage();
    const key = progressKey({ source: 'live', owner: 'test-owner', repo: 'test-repo' });
    const text = JSON.stringify({
      schemaVersion: 1,
      stage: 'rising',
      tickedItemIds: ['add-readme'],
      evidenceFetchedAt: REF,
      startedAt: REF,
      updatedAt: REF,
      revived: null,
    });
    storage.items.set(key, text);
    const { session } = setup({
      storage,
      live: async () => ({ ok: false, error: makeError('network'), rateLimit: liveResultRateLimit() }),
    });
    await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    expect(session.getState().status).toBe('error');
    expect(storage.items.get(key)).toBe(text);
    expect(storage.writes).toBe(0);
  });

  it('keeps the request estimate while pending, then shows the result warnings once (Req 10.9)', async () => {
    let release: (result: DataResult<RepositoryDetail>) => void = () => undefined;
    const pending = new Promise<DataResult<RepositoryDetail>>((resolve) => {
      release = resolve;
    });
    const { session, dataLayer } = setup({ live: () => pending });
    const summary = buildDetail().core;
    dataLayer.estimateDetailRequests = () => ({ requests: 9, budget: 4, resetAt: REF, mayNotComplete: true });

    const opening = session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live', { summary });
    const loading = session.getState();
    expect(loading.status).toBe('loading');
    expect(loading.status === 'loading' && loading.estimate).toEqual({
      requests: 9,
      budget: 4,
      resetAt: REF,
      mayNotComplete: true,
    });

    release(
      liveResult(buildDetail(), REF, {
        warnings: [{ kind: 'may-not-complete', estimate: 9, budget: 4, resetAt: REF }],
      }),
    );
    await opening;
    const state = opened(session);
    expect(state.warnings.filter((warning) => warning.kind === 'may-not-complete')).toHaveLength(1);
    // The pending estimate is gone from the open state, so the note can't show twice.
    expect('estimate' in state).toBe(false);
  });

  it('skips the estimate for demo repositories and when no summary is known', async () => {
    const { session, dataLayer } = setup({ live: async () => liveResult(buildDetail(), REF) });
    const estimate = vi.spyOn(dataLayer, 'estimateDetailRequests');
    await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    await session.openRitual(TWO_STEPS, 'demo', { summary: buildDetail().core });
    expect(estimate).not.toHaveBeenCalled();
  });

  it('aborts the first request when a second one starts, and drops the late first result (I6)', async () => {
    const resolvers: Record<string, (result: DataResult<RepositoryDetail>) => void> = {};
    const signals: Record<string, AbortSignal | undefined> = {};
    const { session, storage } = setup({
      live: (_owner, repo, signal) =>
        new Promise((resolve) => {
          resolvers[repo] = resolve;
          signals[repo] = signal;
        }),
    });
    const first = session.openRitual({ owner: 'test-owner', repo: 'first' }, 'live');
    const second = session.openRitual({ owner: 'test-owner', repo: 'second' }, 'live');
    expect(signals.first?.aborted).toBe(true);
    expect(signals.second?.aborted).toBe(false);

    resolvers.second?.(liveResult(buildDetail({ core: { name: 'second', fullName: 'test-owner/second' } }), REF));
    await second;
    expect(opened(session).detail.core.name).toBe('second');

    // The first request answers late. It must change nothing.
    resolvers.first?.(liveResult(buildDetail({ core: { name: 'first', fullName: 'test-owner/first' } }), REF));
    await first;
    expect(opened(session).detail.core.name).toBe('second');
    expect(storage.writes).toBe(0);
  });

  it('ignores a cancelled result and creates no progress', async () => {
    const { session, storage } = setup({
      live: async () => ({ ok: false, error: makeError('cancelled'), rateLimit: liveResultRateLimit() }),
    });
    await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    expect(session.getState().status).toBe('loading');
    expect(storage.writes).toBe(0);
  });

  it('closing the ritual aborts the request, and a late result is dropped', async () => {
    let release: (result: DataResult<RepositoryDetail>) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const { session } = setup({
      live: (_owner, _repo, given) =>
        new Promise((resolve) => {
          release = resolve;
          signal = given;
        }),
    });
    const opening = session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    session.closeRitual();
    expect(signal?.aborted).toBe(true);
    release(liveResult(buildDetail(), REF));
    await opening;
    expect(session.getState().status).toBe('idle');
  });

  it('uses the official name for progress, and only calls getRepositoryDetail (I12)', async () => {
    const renamed = buildDetail({ renamedFrom: 'Test-Owner/Old-Name', core: { name: 'New-Name', fullName: 'test-owner/New-Name' } });
    const { session, storage, dataLayer } = setup({ live: async () => liveResult(renamed, REF) });
    await session.openRitual({ owner: 'test-owner', repo: 'Old-Name' }, 'live');

    const state = opened(session);
    expect(state.analysis.findings.find((finding) => finding.id === 'renamed')).toBeDefined();
    expect(state.detail.renamedFrom).toBe('Test-Owner/Old-Name');
    session.applyStageChange('plan');
    expect([...storage.items.keys()]).toEqual(['graverepo-progress:v1:live:test-owner/new-name']);
    expect(dataLayer.liveCalls).toHaveLength(1);
    expect(dataLayer.demoLoads()).toBe(0);
  });

  it('marks a live repository as revived with no data-layer call and no fetch (I10)', async () => {
    const healthy = buildDetail();
    const { session, dataLayer } = setup({ live: async () => liveResult(healthy, REF) });
    await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
    const calls = dataLayer.liveCalls.length;
    expect(session.markRevived()).toEqual({ ok: true, saved: true });
    expect(dataLayer.liveCalls).toHaveLength(calls);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(opened(session).progress?.revived).toMatchObject({ source: 'live' });
  });
});

function liveResultRateLimit() {
  return { route: 'direct' as const, limit: null, remaining: null, resetAt: null, tokenUsed: false, blockedUntil: null };
}

describe('storage full during the ritual (U17, O22)', () => {
  it('keeps ticks in memory, flags the problem, and saves them again on the next change', async () => {
    const storage = new FakeStorage();
    const { session } = setup({ storage });
    await session.openRitual(TWO_STEPS, 'demo');
    storage.failWrites = true;
    expect(session.toggleItem('add-readme')).toEqual({ ok: true, saved: false });
    expect(opened(session).saveProblem).toBe(true);
    expect(opened(session).progress?.tickedItemIds).toEqual(['add-readme']);
    expect(storage.items.size).toBe(0);

    storage.failWrites = false;
    expect(session.toggleItem('review-latest-commit')).toEqual({ ok: true, saved: true });
    expect(opened(session).saveProblem).toBe(false);
    const stored = JSON.parse([...storage.items.values()][0] ?? '{}') as { tickedItemIds: string[] };
    expect(stored.tickedItemIds).toEqual(['add-readme', 'review-latest-commit']);
  });
});

describe('P11: provenance parity through the state layer', () => {
  it('gives identical findings, condition and plan for different provenance with the same fetchedAt', async () => {
    const detail = buildDetailWithTwoSteps();
    const variants = [
      { source: 'live', route: 'direct', stale: false },
      { source: 'cache', route: 'direct', stale: true },
      { source: 'cache', route: 'proxy', stale: false },
      { source: 'demo', route: 'bundled', stale: false },
    ] as const;
    const analyses = [];
    for (const variant of variants) {
      const { session } = setup({
        live: async () => liveResult(detail, REF, { provenance: { ...variant, fetchedAt: REF } }),
      });
      await session.openRitual({ owner: 'test-owner', repo: 'test-repo' }, 'live');
      analyses.push(opened(session).analysis);
    }
    for (const analysis of analyses) expect(analysis).toEqual(analyses[0]);
  });
});

describe('P15: stage safety under random actions', () => {
  type Action =
    | { kind: 'stage'; target: 'necropsy' | 'plan' | 'rising' | 'living' }
    | { kind: 'toggle'; id: string }
    | { kind: 'revive' };

  const arbAction: fc.Arbitrary<Action> = fc.oneof(
    fc.constantFrom('necropsy', 'plan', 'rising', 'living').map((target): Action => ({ kind: 'stage', target })),
    fc.constantFrom('add-readme', 'review-latest-commit', 'unknown-id').map((id): Action => ({ kind: 'toggle', id })),
    fc.constant<Action>({ kind: 'revive' }),
  );

  it('The Living only after a revival that passed the gate, and ticks never change after revival', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbAction, { maxLength: 25 }), async (actions) => {
        const { session } = setup();
        await session.openRitual(TWO_STEPS, 'demo');

        // The model: the ticks, whether revival happened, and the stage.
        const ticks = new Set<string>();
        let revived = false;
        let stage: string = 'necropsy';
        let ticksAtRevival: string[] | null = null;

        for (const action of actions) {
          if (action.kind === 'stage') {
            const result = session.applyStageChange(action.target);
            const allowed = action.target !== 'living' || revived;
            expect(result.ok).toBe(allowed);
            if (allowed) stage = action.target;
          } else if (action.kind === 'toggle') {
            const result = session.toggleItem(action.id);
            const known = action.id !== 'unknown-id';
            expect(result.ok).toBe(known && !revived);
            if (known && !revived) {
              if (ticks.has(action.id)) ticks.delete(action.id);
              else ticks.add(action.id);
            }
          } else {
            const gate = ticks.has('add-readme') && ticks.has('review-latest-commit');
            const result = session.markRevived();
            expect(result.ok).toBe(gate && !revived);
            if (gate && !revived) {
              revived = true;
              stage = 'living';
              ticksAtRevival = [...ticks];
            }
          }

          const state = opened(session);
          expect(state.stage).toBe(stage);
          // The Living is the stage only when a revived record exists.
          if (state.stage === 'living') expect(state.progress?.revived).not.toBeNull();
          expect(state.progress?.revived != null).toBe(revived);
          // Ticks never change after revival.
          if (ticksAtRevival !== null) expect([...(state.progress?.tickedItemIds ?? [])].sort()).toEqual([...ticksAtRevival].sort());
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe('display context (O21)', () => {
  it('is injected, and falls back to en and UTC when the browser gives nothing', () => {
    const { session } = setup();
    expect(session.displayContext).toEqual({ locale: 'en', timeZone: 'UTC' });

    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(readDisplayContext()).toEqual({ locale: 'en', timeZone: 'UTC' });
    spy.mockRestore();
    expect(readDisplayContext().locale.length).toBeGreaterThan(0);
  });
});

describe('a healthy detail written through available()', () => {
  it('builds with every section available (guards the builders)', () => {
    expect(buildDetail().sections.readme).toEqual(available({ found: true, url: 'https://github.com/test-owner/test-repo#readme' }));
  });
});
