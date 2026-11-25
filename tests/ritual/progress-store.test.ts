// Tests for the progress store (tasks 9.1–9.4; U11, U16, U17, P13, I4).
// A fake storage stands in for `localStorage`. Nothing touches the network.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGitHubCache } from '../../src/data/cache/github-cache';
import {
  PROGRESS_KEY_PREFIX,
  createProgressStore,
  progressEntrySchema,
  progressKey,
  type ProgressRef,
  type ProgressStorage,
} from '../../src/state/progress-store';
import type { RevivedRecord, RitualProgress } from '../../src/ritual/types';
import { REF } from './builders';

class FakeStorage implements ProgressStorage {
  readonly items = new Map<string, string>();
  failWrites = false;
  removeCalls = 0;
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
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.removeCalls += 1;
    this.items.delete(key);
  }
  keys() {
    return [...this.items.keys()];
  }
}

const T1 = '2026-11-22T14:00:00.000Z';
const T2 = '2026-11-22T15:00:00.000Z';
const T3 = '2026-11-22T16:00:00.000Z';
const ref: ProgressRef = { source: 'demo', owner: 'Test-Owner', repo: 'Test-Repo' };

function clock(...times: string[]) {
  let index = 0;
  return () => new Date(times[Math.min(index++, times.length - 1)] ?? T1);
}

const revivedRecord = (overrides: Partial<RevivedRecord> = {}): RevivedRecord => ({
  owner: 'Test-Owner',
  repo: 'Test-Repo',
  url: 'https://github.com/test-owner/test-repo',
  wasArchived: false,
  source: 'demo',
  evidenceFetchedAt: REF,
  requiredCount: 1,
  revivedAt: T3,
  ...overrides,
});

const validEntry = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  stage: 'rising',
  tickedItemIds: ['add-readme'],
  evidenceFetchedAt: REF,
  startedAt: T1,
  updatedAt: T1,
  revived: null,
  ...overrides,
});

describe('key format (U11, U16)', () => {
  it('uses the progress prefix, the version, the source and lowercase official names', () => {
    expect(progressKey(ref)).toBe('graverepo-progress:v1:demo:test-owner/test-repo');
    expect(progressKey({ ...ref, source: 'live' })).toBe('graverepo-progress:v1:live:test-owner/test-repo');
    expect(progressKey(ref).startsWith('graverepo:')).toBe(false);
  });

  it('keeps demo and live entries independent for the same repository', () => {
    const storage = new FakeStorage();
    const store = createProgressStore({ storage, now: clock(T1) });
    store.save(ref, { stage: 'rising', tickedItemIds: ['add-readme'], revived: null }, REF);
    expect(store.read({ ...ref, source: 'live' })).toBeNull();
    store.save({ ...ref, source: 'live' }, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    expect(store.read(ref)?.stage).toBe('rising');
    expect(store.read({ ...ref, source: 'live' })?.stage).toBe('plan');
    expect(storage.keys()).toHaveLength(2);
  });
});

describe('strict schema (U11)', () => {
  it('accepts a valid entry, and a valid revived entry', () => {
    expect(progressEntrySchema.safeParse(validEntry()).success).toBe(true);
    expect(
      progressEntrySchema.safeParse(validEntry({ stage: 'living', revived: revivedRecord() })).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown field', validEntry({ extra: 1 })],
    ['an unknown nested field', validEntry({ stage: 'living', revived: { ...revivedRecord(), email: 'x' } })],
    ['a nested schemaVersion', validEntry({ stage: 'living', revived: { ...revivedRecord(), schemaVersion: 1 } })],
    ['a wrong type', validEntry({ tickedItemIds: 'add-readme' })],
    ['an unsupported version', validEntry({ schemaVersion: 2 })],
    ['a missing field', (({ stage: _stage, ...rest }) => rest)(validEntry())],
    ['an unknown stage', validEntry({ stage: 'garden' })],
    ['an invalid date', validEntry({ updatedAt: 'yesterday' })],
    ['living without a revived record', validEntry({ stage: 'living', revived: null })],
    ['a malformed revived record', validEntry({ stage: 'living', revived: { owner: 'x' } })],
    ['a negative required count', validEntry({ stage: 'living', revived: revivedRecord({ requiredCount: -1 }) })],
    ['null', null],
    ['an array', []],
  ])('rejects %s, and does not strip it', (_name, value) => {
    expect(progressEntrySchema.safeParse(value).success).toBe(false);
  });
});

describe('reading (U11, I3)', () => {
  it('reads back a valid stored entry', () => {
    const storage = new FakeStorage();
    storage.items.set(progressKey(ref), JSON.stringify(validEntry()));
    expect(createProgressStore({ storage }).read(ref)).toEqual(validEntry());
  });

  it('treats an invalid entry as missing, without deleting it or touching other entries', () => {
    const storage = new FakeStorage();
    const other: ProgressRef = { source: 'demo', owner: 'o', repo: 'other' };
    storage.items.set(progressKey(ref), JSON.stringify(validEntry({ extra: true })));
    storage.items.set(progressKey(other), JSON.stringify(validEntry()));
    const store = createProgressStore({ storage });

    expect(store.read(ref)).toBeNull();
    expect(store.read(other)).not.toBeNull();
    expect(storage.items.has(progressKey(ref))).toBe(true);
    expect(storage.removeCalls).toBe(0);
  });

  it('treats corrupt text and a throwing storage as missing, without throwing', () => {
    const storage = new FakeStorage();
    storage.items.set(progressKey(ref), '{not json');
    expect(createProgressStore({ storage }).read(ref)).toBeNull();

    const broken: ProgressStorage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createProgressStore({ storage: broken });
    expect(store.read(ref)).toBeNull();
    expect(store.listRevived()).toEqual([]);
  });

  it('does not read, list or delete a key of another version', () => {
    const storage = new FakeStorage();
    const v2 = 'graverepo-progress:v2:demo:test-owner/test-repo';
    const v2Revived = 'graverepo-progress:v2:demo:o/revived';
    storage.items.set(v2, JSON.stringify(validEntry()));
    storage.items.set(v2Revived, JSON.stringify(validEntry({ stage: 'living', revived: revivedRecord() })));
    const store = createProgressStore({ storage });

    expect(store.read(ref)).toBeNull();
    expect(store.listRevived()).toEqual([]);
    expect(storage.items.has(v2)).toBe(true);
    expect(storage.items.has(v2Revived)).toBe(true);
    expect(storage.removeCalls).toBe(0);
  });

  it('rejects an entry whose schemaVersion differs from the version in its key', () => {
    const storage = new FakeStorage();
    storage.items.set(progressKey(ref), JSON.stringify(validEntry({ schemaVersion: 2 })));
    expect(createProgressStore({ storage }).read(ref)).toBeNull();
  });
});

describe('writing and times (U11, design 7.3)', () => {
  it('sets all three times on the first write', () => {
    const store = createProgressStore({ storage: new FakeStorage(), now: clock(T1) });
    const { progress, saved } = store.save(ref, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    expect(saved).toBe(true);
    expect(progress).toMatchObject({ evidenceFetchedAt: REF, startedAt: T1, updatedAt: T1, stage: 'plan' });
  });

  it('on a later write keeps startedAt, moves updatedAt, and records the session reference time again', () => {
    const store = createProgressStore({ storage: new FakeStorage(), now: clock(T1, T2) });
    store.save(ref, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    const newer = '2026-11-22T13:30:00.000Z';
    const { progress } = store.save(ref, { stage: 'rising', tickedItemIds: ['a'], revived: null }, newer);
    expect(progress).toMatchObject({ startedAt: T1, updatedAt: T2, evidenceFetchedAt: newer, tickedItemIds: ['a'] });
  });

  it('writes nothing on read', () => {
    const storage = new FakeStorage();
    createProgressStore({ storage }).read(ref);
    expect(storage.items.size).toBe(0);
  });

  it('replaces an invalid entry as a first write', () => {
    const storage = new FakeStorage();
    storage.items.set(progressKey(ref), JSON.stringify(validEntry({ extra: 1, startedAt: '2000-01-01T00:00:00.000Z' })));
    const store = createProgressStore({ storage, now: clock(T2) });
    const { progress } = store.save(ref, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    expect(progress.startedAt).toBe(T2);
    expect(progressEntrySchema.safeParse(JSON.parse(storage.items.get(progressKey(ref)) ?? 'null')).success).toBe(true);
  });

  it('revival writes the same evidenceFetchedAt to the entry and the revived record, in one write', () => {
    const storage = new FakeStorage();
    const store = createProgressStore({ storage, now: clock(T1, T3) });
    store.save(ref, { stage: 'rising', tickedItemIds: [], revived: null }, REF);
    const { progress } = store.save(ref, { stage: 'living', tickedItemIds: [], revived: revivedRecord() }, REF);
    expect(progress.evidenceFetchedAt).toBe(progress.revived?.evidenceFetchedAt);
    expect(JSON.parse(storage.items.get(progressKey(ref)) ?? '{}')).toMatchObject({ stage: 'living', updatedAt: T3 });
  });

  it('after revival a write moves only the stage and updatedAt (U18)', () => {
    const store = createProgressStore({ storage: new FakeStorage(), now: clock(T1, T2, T3) });
    store.save(ref, { stage: 'rising', tickedItemIds: ['a'], revived: null }, REF);
    const revived = store.save(ref, { stage: 'living', tickedItemIds: ['a'], revived: revivedRecord() }, REF).progress;
    const later = store.save(
      ref,
      { stage: 'plan', tickedItemIds: ['changed'], revived: revivedRecord({ revivedAt: '2030-01-01T00:00:00.000Z' }) },
      '2026-12-01T00:00:00.000Z',
    ).progress;

    expect(later.stage).toBe('plan');
    expect(later.tickedItemIds).toEqual(['a']);
    expect(later.revived).toEqual(revived.revived);
    expect(later.evidenceFetchedAt).toBe(revived.evidenceFetchedAt);
    expect(later.startedAt).toBe(revived.startedAt);
    expect(later.updatedAt).toBe(T3);
  });
});

describe('storage full (U17, O22)', () => {
  it('keeps the change in memory, sets the flag, deletes nothing, and retries on the next change', () => {
    const storage = new FakeStorage();
    storage.items.set('graverepo:v1:user:octocat', 'cache');
    const other: ProgressRef = { source: 'demo', owner: 'o', repo: 'other' };
    storage.items.set(progressKey(other), JSON.stringify(validEntry()));
    const store = createProgressStore({ storage, now: clock(T1, T2) });

    storage.failWrites = true;
    const failed = store.save(ref, { stage: 'rising', tickedItemIds: ['a'], revived: null }, REF);
    expect(failed.saved).toBe(false);
    expect(store.hasSaveProblem()).toBe(true);
    expect(store.read(ref)?.tickedItemIds).toEqual(['a']);
    expect(storage.items.has(progressKey(ref))).toBe(false);
    // Nothing was deleted to make room: not the other entry, not a cache key.
    expect(storage.removeCalls).toBe(0);
    expect(storage.items.get('graverepo:v1:user:octocat')).toBe('cache');
    expect(storage.items.has(progressKey(other))).toBe(true);

    storage.failWrites = false;
    const retried = store.save(ref, { stage: 'rising', tickedItemIds: ['a', 'b'], revived: null }, REF);
    expect(retried.saved).toBe(true);
    expect(store.hasSaveProblem()).toBe(false);
    expect(JSON.parse(storage.items.get(progressKey(ref)) ?? '{}').tickedItemIds).toEqual(['a', 'b']);
  });

  it('a revival that cannot be saved still holds for the session and shows in the list from memory', () => {
    const storage = new FakeStorage();
    const store = createProgressStore({ storage, now: clock(T1) });
    storage.failWrites = true;
    const outcome = store.save(ref, { stage: 'living', tickedItemIds: [], revived: revivedRecord() }, REF);
    expect(outcome.saved).toBe(false);
    expect(outcome.progress.revived).not.toBeNull();
    expect(store.listRevived()).toEqual([revivedRecord()]);
    // A new session (a reload) no longer has it.
    expect(createProgressStore({ storage }).listRevived()).toEqual([]);
  });

  it('works with no storage at all', () => {
    const store = createProgressStore({ storage: null, now: clock(T1) });
    const outcome = store.save(ref, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    expect(outcome.saved).toBe(false);
    expect(store.read(ref)?.stage).toBe('plan');
  });
});

describe('listRevived (U16)', () => {
  it('lists valid revived entries newest first, skips invalid and unrevived ones, and labels each source', () => {
    const storage = new FakeStorage();
    const store = createProgressStore({ storage, now: clock(T1) });
    const a: ProgressRef = { source: 'demo', owner: 'o', repo: 'a' };
    const b: ProgressRef = { source: 'live', owner: 'o', repo: 'a' };
    store.save(a, { stage: 'living', tickedItemIds: [], revived: revivedRecord({ repo: 'a', revivedAt: T1 }) }, REF);
    store.save(b, { stage: 'living', tickedItemIds: [], revived: revivedRecord({ repo: 'a', source: 'live', revivedAt: T3 }) }, REF);
    store.save({ source: 'demo', owner: 'o', repo: 'not-revived' }, { stage: 'rising', tickedItemIds: [], revived: null }, REF);
    storage.items.set('graverepo-progress:v1:demo:o/broken', '{"junk":1}');

    // A new session reads from storage only.
    const list = createProgressStore({ storage }).listRevived();
    expect(list.map((item) => [item.source, item.revivedAt])).toEqual([
      ['live', T3],
      ['demo', T1],
    ]);
  });

  it('reads only graverepo-progress: keys', () => {
    const storage = new FakeStorage();
    storage.items.set('graverepo:v1:detail:o/r', JSON.stringify(validEntry({ stage: 'living', revived: revivedRecord() })));
    expect(createProgressStore({ storage }).listRevived()).toEqual([]);
  });
});

describe('property P13: storage round trip and key prefix', () => {
  const arbEntry: fc.Arbitrary<RitualProgress> = fc.record({
    schemaVersion: fc.constant(1 as const),
    stage: fc.constantFrom('necropsy', 'plan', 'rising') as fc.Arbitrary<RitualProgress['stage']>,
    tickedItemIds: fc.array(fc.stringMatching(/^[a-z-]{1,20}$/), { maxLength: 7 }),
    evidenceFetchedAt: fc.constant(REF),
    startedAt: fc.constant(T1),
    updatedAt: fc.constant(T2),
    revived: fc.constant(null),
  });

  it('serialising and reading back gives the same value', () => {
    fc.assert(
      fc.property(arbEntry, (entry) => {
        expect(progressEntrySchema.parse(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
      }),
      { numRuns: 100 },
    );
  });

  it('arbitrary values read as missing without throwing, and are never deleted', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.jsonValue().map((value) => JSON.stringify(value))), (text) => {
        const storage = new FakeStorage();
        storage.items.set(progressKey(ref), text);
        const store = createProgressStore({ storage });
        const read = store.read(ref);
        if (read === null) expect(progressEntrySchema.safeParse(safeParse(text)).success).toBe(false);
        expect(storage.removeCalls).toBe(0);
        expect(storage.items.has(progressKey(ref))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('every generated key starts with graverepo-progress: and never with graverepo:', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('demo', 'live') as fc.Arbitrary<ProgressRef['source']>,
        fc.stringMatching(/^[A-Za-z0-9-]{1,39}$/),
        fc.stringMatching(/^[A-Za-z0-9._-]{1,50}$/),
        (source, owner, repo) => {
          const key = progressKey({ source, owner, repo });
          expect(key.startsWith(PROGRESS_KEY_PREFIX)).toBe(true);
          expect(key.startsWith('graverepo:')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

describe('cache and progress namespaces (task 9.4, I4)', () => {
  it('the data layer cache cleanup removes only graverepo: keys and leaves progress untouched', () => {
    const storage = new FakeStorage();
    // Progress and cache entries side by side.
    const store = createProgressStore({ storage, now: clock(T1) });
    store.save(ref, { stage: 'living', tickedItemIds: [], revived: revivedRecord() }, REF);
    storage.items.set('graverepo:v1:user:octocat', 'cache-1');
    storage.items.set('graverepo:v1:detail:o/r', 'cache-2');
    const progressBefore = storage.items.get(progressKey(ref));

    // A failing cache write makes the cache clean up its own keys (data layer Req 7.11).
    const cacheStorage = {
      length: 0,
      key: (index: number) => storage.key(index),
      getItem: (key: string) => storage.getItem(key),
      removeItem: (key: string) => storage.removeItem(key),
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    } as unknown as Storage;
    Object.defineProperty(cacheStorage, 'length', { get: () => storage.length });
    const cache = createGitHubCache(cacheStorage);
    cache.write('user', 'someone', { any: 'thing' }, REF, 'direct');

    expect(cache.isMemoryOnly()).toBe(true);
    expect(storage.keys().filter((key) => key.startsWith('graverepo:'))).toEqual([]);
    expect(storage.items.get(progressKey(ref))).toBe(progressBefore);
    expect(createProgressStore({ storage }).listRevived()).toHaveLength(1);
  });

  it('the progress store never reads, writes or removes a graverepo: key', () => {
    const storage = new FakeStorage();
    storage.items.set('graverepo:v1:detail:test-owner/test-repo', 'cache');
    const store = createProgressStore({ storage, now: clock(T1) });
    store.read(ref);
    store.save(ref, { stage: 'plan', tickedItemIds: [], revived: null }, REF);
    store.listRevived();
    expect(storage.items.get('graverepo:v1:detail:test-owner/test-repo')).toBe('cache');
    expect(storage.removeCalls).toBe(0);
    expect(storage.keys().filter((key) => key.startsWith('graverepo:'))).toHaveLength(1);
  });
});
