// Demo graveyard tests (data-layer design 8.8, task 6.8; Requirements 8.8, 8.11–8.14, 8.16, 8.19).
//
// Two groups:
// 1. Tests of the loader and its rules. They use a small snapshot built from the real captured
//    fixtures (see helpers/test-snapshot.ts) and always run.
// 2. Tests of the real committed demo snapshot. They run when `graveyard.snapshot.json` exists
//    (in `src/data/demo/` or, if it is large, `public/demo/`). Until the capture has been run
//    (task 6.5) they are skipped, and the test report says so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import curatedList from '../../src/data/demo/curated-list.json';
import { buildDemoGraveyard } from '../../src/data/demo/build-demo-graveyard';
import { loadDemoGraveyardFrom } from '../../src/data/demo/load-demo-graveyard';
import { makeError } from '../../src/data/github/errors/error-kinds';
import { REQUIRED_STATES, statesShownBy, uncoveredStates } from '../../src/data/demo/required-states';
import { SNAPSHOT_BUNDLE_LIMIT_BYTES } from '../../src/data/demo/snapshot-schema';
import { constructedFileNames, loadConstructed } from './helpers/fixtures';
import { makeTestSnapshot, TEST_CAPTURED_AT } from './helpers/test-snapshot';

const rawFiles = {
  bundled: import.meta.glob('../../src/data/demo/graveyard.snapshot.json', {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  served: import.meta.glob('../../public/demo/graveyard.snapshot.json', {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  notes: import.meta.glob('../../src/data/demo/demo-notes.md', {
    query: '?raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
};

const bundledText = Object.values(rawFiles.bundled)[0];
const servedText = Object.values(rawFiles.served)[0];
const realSnapshotText = bundledText ?? servedText;
const notesText = Object.values(rawFiles.notes)[0] ?? '';

/** Replaces `fetch` with a version that records every call and fails the test if one is made. */
function trapFetch() {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown) => {
    calls.push(String(input));
    return Promise.reject(new Error('The demo must not contact GitHub or anything else.'));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

let trap: ReturnType<typeof trapFetch>;
beforeEach(() => {
  trap = trapFetch();
});
afterEach(() => {
  trap.restore();
  vi.restoreAllMocks();
});

describe('loadDemoGraveyardFrom (test snapshot built from captured fixtures)', () => {
  it('returns demo provenance with the capture date, never live', () => {
    const result = loadDemoGraveyardFrom(makeTestSnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance).toEqual({
      source: 'demo',
      route: 'bundled',
      fetchedAt: TEST_CAPTURED_AT,
      stale: false,
    });
    expect(result.data.capturedAt).toBe(TEST_CAPTURED_AT);
    expect(result.warnings).toEqual([]);
  });

  it('gives every repository a matching detail with the same official name', () => {
    const result = loadDemoGraveyardFrom(makeTestSnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { repositories, details } = result.data;
    expect(details).toHaveLength(repositories.length);
    expect(details.map((detail) => detail.core.fullName)).toEqual(repositories.map((repo) => repo.fullName));
    expect(repositories.map((repo) => repo.fullName)).toEqual([
      'ncptunex/Kiroween-2026-GRAVEREPO',
      'ncptunex/foodstarter',
    ]);
  });

  it('returns source accounts as profiles', () => {
    const result = loadDemoGraveyardFrom(makeTestSnapshot());
    expect(result.ok && result.data.sourceAccounts.map((account) => account.login)).toEqual(['ncptunex']);
  });

  it('sends no request while loading and reading every repository detail', () => {
    const result = loadDemoGraveyardFrom(makeTestSnapshot());
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const detail of result.data.details) {
        expect(detail.sections.readme.status).not.toBe('unavailable');
      }
    }
    expect(trap.calls).toEqual([]);
  });

  it('sends no request when the modules are loaded (startup)', async () => {
    vi.resetModules();
    await import('../../src/data/demo/load-demo-graveyard');
    expect(trap.calls).toEqual([]);
  });

  describe('a snapshot that fails validation gives demo-unavailable (Req 8.12)', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    const expectUnavailable = (snapshot: unknown) => {
      const result = loadDemoGraveyardFrom(snapshot);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('demo-unavailable');
        expect(result.error.demoAvailable).toBe(false);
      }
    };

    it('for something that is not a snapshot', () => {
      expectUnavailable(undefined);
      expectUnavailable('text');
      expectUnavailable({});
    });

    it('for another schema version', () => {
      expectUnavailable({ ...makeTestSnapshot(), schemaVersion: 2 });
    });

    it('when a section response is a server error', () => {
      const snapshot = makeTestSnapshot();
      const entry = snapshot.repositories[1];
      if (!entry) throw new Error('missing test entry');
      entry.responses.branches = { status: 500, body: { message: 'Server Error' } };
      expectUnavailable(snapshot);
    });

    it('when a curated repository has no detail', () => {
      const snapshot = makeTestSnapshot();
      expectUnavailable({ ...snapshot, curatedRepositories: [...snapshot.curatedRepositories, 'atom/atom'] });
    });

    it('when a profile is missing', () => {
      const snapshot = makeTestSnapshot();
      expectUnavailable({ ...snapshot, users: {} });
    });

    it('when a repository is private', () => {
      const snapshot = makeTestSnapshot();
      const entry = snapshot.repositories[0];
      if (!entry) throw new Error('missing test entry');
      entry.responses.repo = {
        status: 200,
        body: { ...(entry.responses.repo.body as object), private: true },
      };
      expectUnavailable(snapshot);
    });

    it('when a needed dependent response is missing', () => {
      const snapshot = makeTestSnapshot();
      const entry = snapshot.repositories[0];
      if (!entry) throw new Error('missing test entry');
      entry.responses.recentAuthors = null;
      expectUnavailable(snapshot);
    });
  });
});

describe('demo offered on errors (task 6.7, Req 8.9)', () => {
  it.each(['rate-limited', 'network', 'timeout', 'github-unavailable', 'proxy-unavailable'] as const)(
    '%s can offer the demo graveyard',
    (kind) => {
      expect(makeError(kind).demoAvailable).toBe(true);
    },
  );

  it.each(['invalid-username', 'user-not-found', 'repo-not-found', 'forbidden', 'demo-unavailable', 'cancelled'] as const)(
    '%s does not offer the demo graveyard',
    (kind) => {
      expect(makeError(kind).demoAvailable).toBe(false);
    },
  );
});

describe('demo-notes.md and the curated list', () => {
  /** Rows of the approved list: `| 1 | `owner/name` | owner | 1, 5, 7 | ... |`. */
  function approvedRows() {
    const section = notesText.split(/^## 7\./m)[1]?.split(/^## 8\./m)[0] ?? '';
    const rows: { fullName: string; source: string; states: number[] }[] = [];
    for (const line of section.split('\n')) {
      const match = /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*(owner|external)\s*\|\s*([^|]*)\|/.exec(line);
      if (!match) continue;
      const [, fullName, source, statesCell] = match;
      const states = (statesCell ?? '').match(/\d+/g)?.map(Number) ?? [];
      rows.push({ fullName: fullName ?? '', source: source ?? '', states });
    }
    return rows;
  }

  it('lists the same repositories as the curated list used by the capture script', () => {
    expect(approvedRows().map((row) => row.fullName)).toEqual(curatedList.repositories);
  });

  it('lists eight repositories, with the owner account first and the external ones marked', () => {
    const rows = approvedRows();
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.source).toBe(row.fullName.startsWith(`${curatedList.owner}/`) ? 'owner' : 'external');
    }
  });

  it('claims every one of the nine required states for some repository', () => {
    const claimed = new Set(approvedRows().flatMap((row) => row.states));
    expect(REQUIRED_STATES.map((state) => state.number).filter((n) => !claimed.has(n))).toEqual([]);
  });
});

describe('the demo snapshot must not contain hand-made data (Req 8.8)', () => {
  it('constructed fixtures are marked, so the marker can be searched for', () => {
    for (const name of constructedFileNames()) {
      expect(loadConstructed(name).meta.constructed).toBe(true);
    }
  });

  it('the test snapshot built from captured fixtures carries no marker', () => {
    const text = JSON.stringify(makeTestSnapshot());
    expect(text).not.toContain('"constructed"');
  });
});

describe.skipIf(realSnapshotText === undefined)('the committed demo snapshot', () => {
  const text = realSnapshotText ?? '{}';
  const snapshot: unknown = JSON.parse(text);
  const built = buildDemoGraveyard(snapshot);

  it('passes the same schemas and adapters with no problems and no dropped items', () => {
    expect(built.ok ? [] : built.problems).toEqual([]);
  });

  it('loads as a demo result with the capture date as its time', () => {
    const result = loadDemoGraveyardFrom(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.source).toBe('demo');
    expect(result.provenance.route).toBe('bundled');
    expect(result.provenance.fetchedAt).toBe(result.data.capturedAt);
    expect(Number.isNaN(Date.parse(result.data.capturedAt))).toBe(false);
  });

  it('has a matching detail for each of the eight approved repositories', () => {
    if (!built.ok) throw new Error('snapshot is not valid');
    expect(built.graveyard.details.map((detail) => detail.core.fullName.toLowerCase())).toEqual(
      curatedList.repositories.map((name) => name.toLowerCase()),
    );
    expect(built.graveyard.repositories).toHaveLength(8);
  });

  it('shows all nine required states between its repositories', () => {
    if (!built.ok) throw new Error('snapshot is not valid');
    expect(uncoveredStates(built.graveyard.details, built.windowStart)).toEqual([]);
  });

  it('shows each state that demo-notes.md claims for a repository', () => {
    if (!built.ok) throw new Error('snapshot is not valid');
    const section = notesText.split(/^## 7\./m)[1]?.split(/^## 8\./m)[0] ?? '';
    let checked = 0;
    for (const line of section.split('\n')) {
      const match = /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*(?:owner|external)\s*\|\s*([^|]*)\|/.exec(line);
      if (!match) continue;
      const detail = built.graveyard.details.find(
        (item) => item.core.fullName.toLowerCase() === (match[1] ?? '').toLowerCase(),
      );
      expect(detail, `${match[1]} is in the snapshot`).toBeDefined();
      if (!detail) continue;
      const claimed = (match[2] ?? '').match(/\d+/g)?.map(Number) ?? [];
      const shown = statesShownBy(detail, built.windowStart);
      for (const state of claimed) expect(shown, `${match[1]} shows state ${state}`).toContain(state);
      checked += 1;
    }
    expect(checked).toBe(8);
  });

  it('contains no email address and no token pattern', () => {
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(/(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/);
    expect(text).not.toMatch(/authorization|bearer /i);
  });

  it('contains no constructed fixture content', () => {
    expect(text).not.toContain('"constructed"');
    for (const name of constructedFileNames()) {
      const fixture = loadConstructed(name);
      expect(text, `${name} case text`).not.toContain(fixture.meta.case);
    }
  });

  it('records its capture date, source accounts and curated list', () => {
    const value = snapshot as { capturedAt: string; sourceAccounts: string[]; curatedRepositories: string[] };
    expect(Number.isNaN(Date.parse(value.capturedAt))).toBe(false);
    expect(value.sourceAccounts).toEqual(expect.arrayContaining(['ncptunex', 'atom', 'dubzzz']));
    expect(value.curatedRepositories).toEqual(curatedList.repositories);
  });

  it('is delivered as D24 requires: bundled up to 300 KB, otherwise served from public/demo', () => {
    const bytes = new TextEncoder().encode(text).length;
    if (bundledText !== undefined) {
      expect(servedText, 'the snapshot must exist in one place only').toBeUndefined();
      expect(bytes, 'larger than 300 KB: move it to public/demo/').toBeLessThanOrEqual(SNAPSHOT_BUNDLE_LIMIT_BYTES);
    } else {
      expect(bytes, '300 KB or smaller: it should be bundled instead').toBeGreaterThan(SNAPSHOT_BUNDLE_LIMIT_BYTES);
    }
  });

  it.skipIf(bundledText === undefined)('loadDemoGraveyard() reads the bundled snapshot', async () => {
    const { loadDemoGraveyard } = await import('../../src/data/demo/load-demo-graveyard');
    const result = await loadDemoGraveyard();
    expect(result.ok).toBe(true);
    expect(trap.calls).toEqual([]);
  });

  it('can be loaded and every detail read without any request', () => {
    const result = loadDemoGraveyardFrom(snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const detail of result.data.details) JSON.stringify(detail);
    }
    expect(trap.calls).toEqual([]);
  });
});
