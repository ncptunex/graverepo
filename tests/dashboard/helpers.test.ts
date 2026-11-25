// Tests for the dashboard's pure helpers (graveyard-dashboard task 2.7: D-U1 to D-U4, D-U6, D-P1 to D-P3,
// plus the link helper D-I4). Repository data comes from the ritual test builders (test-only).
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { errorText } from '../../src/components/error-text';
import { safeExternalLink } from '../../src/components/external-link';
import { listNotices } from '../../src/components/list-notices';
import { describeAge, describeProvenance } from '../../src/components/provenance-text';
import { ERROR_KINDS } from '../../src/data/github/errors/error-kinds';
import { makeError, type DataError, type ErrorKind, type Provenance, type RepositoryList, type Warning } from '../../src/data/github';
import { readDisplayContext } from '../../src/state/display-context';
import { DEFAULT_FILTERS, filterRepositories, isFiltered, type GraveyardFilters } from '../../src/state/graveyard-filters';
import { buildSummary } from '../ritual/builders';

const CTX = { locale: 'en-GB', timeZone: 'UTC' };
const NOW = '2026-11-23T12:00:00.000Z';
const ECTX = { displayContext: CTX, now: NOW };

// The words voice-and-honesty.md section 3 says to avoid in text GRAVEREPO writes.
const AVOIDED = /\b(dead|deceased|killed|abandoned|forsaken|rotting|neglected|gave up|quit|stopped working|broken|failing|poor quality)\b/i;

describe('filterRepositories (D-U1)', () => {
  const repos = [
    buildSummary({ name: 'Alpha', description: 'Hello World' }),
    buildSummary({ name: 'beta', description: null }),
    buildSummary({ name: 'gamma', description: 'alpha thing', isFork: true }),
    buildSummary({ name: 'delta', description: 'x', isArchived: true }),
  ];

  it('keeps everything for the default filters, in order, as a new list', () => {
    const result = filterRepositories(repos, DEFAULT_FILTERS);
    expect(result).toEqual(repos);
    expect(result).not.toBe(repos);
  });

  it('matches name or description, case-insensitively', () => {
    expect(filterRepositories(repos, { ...DEFAULT_FILTERS, text: 'ALPHA' }).map((r) => r.name)).toEqual(['Alpha', 'gamma']);
  });

  it('never matches a null description for a non-empty text', () => {
    expect(filterRepositories(repos, { ...DEFAULT_FILTERS, text: 'null' })).toEqual([]);
  });

  it('drops forks and archived repositories when their switch is off', () => {
    expect(filterRepositories(repos, { ...DEFAULT_FILTERS, includeForks: false }).map((r) => r.name)).not.toContain('gamma');
    expect(filterRepositories(repos, { ...DEFAULT_FILTERS, includeArchived: false }).map((r) => r.name)).not.toContain('delta');
  });

  it('knows when filters are active', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, text: 'a' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FILTERS, includeForks: false })).toBe(true);
  });
});

describe('filterRepositories properties (D-P1)', () => {
  const arbRepos = fc.array(
    fc.record({
      name: fc.stringMatching(/^[a-z]{1,6}$/),
      description: fc.option(fc.stringMatching(/^[a-z ]{0,8}$/), { nil: null }),
      isFork: fc.boolean(),
      isArchived: fc.boolean(),
    }),
    { maxLength: 12 },
  ).map((items) => items.map((item, id) => buildSummary({ ...item, id })));
  const arbFilters: fc.Arbitrary<GraveyardFilters> = fc.record({
    text: fc.stringMatching(/^[a-z]{0,2}$/),
    includeForks: fc.boolean(),
    includeArchived: fc.boolean(),
  });

  it('returns an ordered subsequence with no additions, and clearing filters returns everything', () => {
    fc.assert(
      fc.property(arbRepos, arbFilters, (repos, filters) => {
        const result = filterRepositories(repos, filters);
        let from = 0;
        for (const item of result) {
          const index = repos.indexOf(item, from);
          expect(index).toBeGreaterThanOrEqual(0);
          from = index + 1;
        }
        expect(filterRepositories(repos, DEFAULT_FILTERS)).toEqual(repos);
      }),
      { numRuns: 100 },
    );
  });

  it('turning a switch back on never removes items', () => {
    fc.assert(
      fc.property(arbRepos, arbFilters, (repos, filters) => {
        const off = filterRepositories(repos, { ...filters, includeForks: false });
        const on = filterRepositories(repos, { ...filters, includeForks: true });
        for (const item of off) expect(on).toContain(item);
      }),
      { numRuns: 100 },
    );
  });
});

describe('describeProvenance (D-U2)', () => {
  const live: Provenance = { source: 'live', route: 'direct', fetchedAt: NOW, stale: false };

  it('says fresh only for live data that is not stale', () => {
    expect(describeProvenance(live, undefined, CTX, NOW)).toMatchObject({ kind: 'fresh', text: 'Fresh from GitHub, just now' });
  });

  it('labels a saved copy with its age', () => {
    const cache: Provenance = { source: 'cache', route: 'direct', fetchedAt: '2026-11-23T11:52:00.000Z', stale: false };
    expect(describeProvenance(cache, undefined, CTX, NOW).text).toBe('Saved copy from 8 minutes ago');
  });

  it('adds the reason for a stale saved copy', () => {
    const cache: Provenance = { source: 'cache', route: 'direct', fetchedAt: '2026-11-23T10:00:00.000Z', stale: true };
    const label = describeProvenance(cache, makeError('network'), CTX, NOW);
    expect(label.kind).toBe('saved-copy-stale');
    expect(label.text).toBe(
      "Saved copy from 2 hours ago. We couldn't refresh it: We can't reach GitHub from here. Check your connection",
    );
  });

  it('labels the demo with the capture date and never says fresh', () => {
    const demo: Provenance = { source: 'demo', route: 'bundled', fetchedAt: '2026-11-20T00:00:00.000Z', stale: false };
    const label = describeProvenance(demo, undefined, CTX, NOW);
    expect(label.text).toMatch(/^Demo graveyard, captured on /);
    expect(label.text).not.toContain('Fresh');
  });

  it('a live search that returns a saved copy gets the saved-copy label', () => {
    const cache: Provenance = { source: 'cache', route: 'direct', fetchedAt: NOW, stale: false };
    expect(describeProvenance(cache, undefined, CTX, NOW).text).toContain('Saved copy');
  });

  it('makes no freshness claim for live data that is stale', () => {
    expect(describeProvenance({ ...live, stale: true }, undefined, CTX, NOW)).toMatchObject({ kind: 'none', text: null });
  });

  it('describes ages at 0, 1 and 59 minutes, hours and days', () => {
    const at = (offsetMs: number) => describeAge(new Date(Date.parse(NOW) - offsetMs).toISOString(), NOW);
    expect(at(0)).toBe('0 minutes');
    expect(at(60_000)).toBe('1 minute');
    expect(at(59 * 60_000)).toBe('59 minutes');
    expect(at(60 * 60_000)).toBe('1 hour');
    expect(at(5 * 3_600_000)).toBe('5 hours');
    expect(at(24 * 3_600_000)).toBe('1 day');
    expect(at(3 * 86_400_000)).toBe('3 days');
    expect(at(-60_000)).toBe('0 minutes'); // a future fetch time
  });
});

describe('describeProvenance properties (D-P2)', () => {
  const arbProvenance: fc.Arbitrary<Provenance> = fc.record({
    source: fc.constantFrom('live', 'cache', 'demo'),
    route: fc.constantFrom('direct', 'proxy', 'bundled'),
    fetchedAt: fc.integer({ min: Date.parse('2026-01-01'), max: Date.parse('2026-11-23') }).map((ms) => new Date(ms).toISOString()),
    stale: fc.boolean(),
  });

  it('says "Fresh from GitHub" only for live and not stale, and keeps Saved copy and Demo exact', () => {
    fc.assert(
      fc.property(arbProvenance, fc.boolean(), (provenance, withError) => {
        const label = describeProvenance(provenance, withError ? makeError('timeout') : undefined, CTX, NOW);
        const text = label.text ?? '';
        expect(text.includes('Fresh from GitHub')).toBe(provenance.source === 'live' && !provenance.stale);
        expect(text.startsWith('Saved copy')).toBe(provenance.source === 'cache');
        expect(text.startsWith('Demo graveyard')).toBe(provenance.source === 'demo');
      }),
      { numRuns: 200 },
    );
  });
});

describe('errorText (D-U3)', () => {
  it('gives the voice 5.8 wording for each kind', () => {
    expect(errorText(makeError('network'), ECTX).message).toBe(
      "We can't reach GitHub from here. Check your connection, or try the demo graveyard.",
    );
    expect(errorText(makeError('timeout'), ECTX).message).toBe("GitHub didn't answer in time. Try again, or try the demo graveyard.");
    expect(errorText(makeError('github-unavailable'), ECTX).message).toBe(
      'GitHub seems to be having trouble right now. Try again later, or try the demo graveyard.',
    );
    expect(errorText(makeError('unexpected-response'), ECTX).message).toBe(
      "GitHub sent something we didn't expect. Try again, or try the demo graveyard.",
    );
    expect(errorText(makeError('proxy-unavailable'), ECTX).message).toBe(
      "Our lookup helper isn't answering right now. Try the demo graveyard, or try again later.",
    );
    expect(errorText(makeError('forbidden'), ECTX).message).toBe("GitHub won't let us see this one.");
    expect(errorText(makeError('user-not-found', { username: 'octocat' }), ECTX).message).toBe(
      "We couldn't find an account called octocat. Check the spelling.",
    );
    expect(errorText(makeError('repo-not-found'), ECTX).message).toBe(
      "We couldn't find this repository. It may have been renamed, moved or made private.",
    );
    expect(errorText(makeError('invalid-username'), ECTX).message).toBe('GitHub usernames use letters, numbers and hyphens.');
    expect(errorText(makeError('demo-unavailable'), ECTX).message).toBe("The demo graveyard couldn't be loaded. Please report this.");
  });

  it('gives no message for cancelled', () => {
    expect(errorText(makeError('cancelled'), ECTX)).toMatchObject({ message: null, lead: null, offersDemo: false });
  });

  it('shows a primary rate-limit time without a date when it is today, and with a date when not', () => {
    const today = errorText(makeError('rate-limited', { limitType: 'primary', resetAt: '2026-11-23T15:30:00.000Z' }), ECTX);
    expect(today.message).toContain('You can look again at 15:30 UTC, or try the demo graveyard.');
    expect(today.retryAt).toBe('2026-11-23T15:30:00.000Z');
    const later = errorText(makeError('rate-limited', { limitType: 'primary', resetAt: '2026-11-24T01:05:00.000Z' }), ECTX);
    expect(later.message).toMatch(/look again at 24 Nov 2026/);
  });

  it('uses the visitor time zone for the retry time', () => {
    const result = errorText(makeError('rate-limited', { limitType: 'primary', resetAt: '2026-11-23T15:30:00.000Z' }), {
      displayContext: { locale: 'en-GB', timeZone: 'Asia/Kuala_Lumpur' },
      now: NOW,
    });
    expect(result.message).toContain('23:30');
  });

  it('keeps the primary message honest when the reset time is unknown', () => {
    const result = errorText(makeError('rate-limited', { limitType: 'primary', resetAt: null }), ECTX);
    expect(result.message).toBe(
      "GitHub allows only a limited number of lookups for each hour. We've used them up for now, or try the demo graveyard.",
    );
    expect(result.retryAt).toBeNull();
  });

  it('gives the secondary limit wait in seconds and offers no demo', () => {
    const result = errorText(makeError('rate-limited', { limitType: 'secondary', retryAfterSeconds: 30 }), ECTX);
    expect(result.message).toBe('Too many lookups at once. Try again in 30 seconds.');
    expect(result.retryInSeconds).toBe(30);
  });

  it('never calls forbidden a rate limit', () => {
    expect(errorText(makeError('forbidden'), ECTX).message).not.toMatch(/rate|lookups/i);
  });

  it('mentions the demo only when the error allows it', () => {
    for (const kind of ERROR_KINDS) {
      const error = makeError(kind, { limitType: 'primary', resetAt: null, username: 'x', repository: 'x/y' });
      const text = errorText(error, ECTX);
      expect(text.offersDemo).toBe(error.demoAvailable);
      expect((text.message ?? '').toLowerCase().includes('demo graveyard') && kind !== 'demo-unavailable').toBe(error.demoAvailable);
    }
  });
});

describe('errorText properties (D-P3)', () => {
  const arbKind = fc.constantFrom<ErrorKind>(...ERROR_KINDS);
  const arbError: fc.Arbitrary<DataError> = fc
    .record({
      kind: arbKind,
      limitType: fc.constantFrom('primary', 'secondary' as const),
      resetAt: fc.option(fc.constantFrom('2026-11-23T15:30:00.000Z', 'not a date'), { nil: null }),
      retryAfterSeconds: fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }),
      demoOverride: fc.boolean(),
    })
    .map(({ kind, limitType, resetAt, retryAfterSeconds, demoOverride }) => ({
      ...makeError(kind, { limitType, resetAt, retryAfterSeconds, username: 'someone' }),
      // The data layer decides `demoAvailable`. The text must follow whatever it says.
      demoAvailable: demoOverride,
    }));

  it('uses no avoided word, follows demoAvailable, and never mentions rates for forbidden', () => {
    fc.assert(
      fc.property(arbError, (error) => {
        const text = errorText(error, ECTX);
        const message = text.message ?? '';
        expect(message).not.toMatch(AVOIDED);
        if (error.kind === 'cancelled' || error.kind === 'demo-unavailable') return;
        const mentionsDemo = message.toLowerCase().includes('demo graveyard');
        // Kinds whose approved line has no demo sentence never mention it.
        const hasDemoSentence = !['forbidden', 'user-not-found', 'repo-not-found', 'invalid-username'].includes(error.kind) &&
          !(error.kind === 'rate-limited' && error.details.limitType === 'secondary');
        expect(mentionsDemo).toBe(hasDemoSentence && error.demoAvailable);
        if (error.kind === 'forbidden') expect(message.toLowerCase()).not.toContain('rate');
      }),
      { numRuns: 200 },
    );
  });
});

describe('listNotices (D-U4)', () => {
  const baseList = (overrides: Partial<RepositoryList> = {}): RepositoryList => ({
    owner: { login: 'o', displayName: null, avatarUrl: null, profileUrl: 'https://github.com/o', accountType: 'user', publicRepoCount: 5 },
    repositories: [],
    retrievedCount: 3,
    totalPublicCount: 5,
    truncated: false,
    partial: false,
    droppedInvalidCount: 0,
    droppedPrivateCount: 0,
    ...overrides,
  });

  it('gives no notice for a complete list', () => {
    expect(listNotices(baseList(), [])).toEqual([]);
  });

  it('gives the truncated notice from the warning', () => {
    const warnings: Warning[] = [{ kind: 'truncated-list', retrievedCount: 300, totalCount: 412 }];
    expect(listNotices(baseList({ truncated: true }), warnings)).toEqual([
      { id: 'truncated', variant: 'info', text: 'Showing the 300 most recently updated of 412 repositories.' },
    ]);
  });

  it('gives the partial notice with and without a total', () => {
    const warnings: Warning[] = [{ kind: 'partial-list', retrievedCount: 3 }];
    expect(listNotices(baseList({ partial: true }), warnings)[0]?.text).toBe("Some repositories couldn't be loaded. Showing 3 of 5.");
    expect(listNotices(baseList({ partial: true, totalPublicCount: null }), warnings)[0]?.text).toBe(
      "Some repositories couldn't be loaded.",
    );
  });

  it('counts dropped invalid items and never mentions or counts private ones', () => {
    const notices = listNotices(baseList({ droppedInvalidCount: 2, droppedPrivateCount: 7 }), [
      { kind: 'dropped-items', invalidCount: 2, privateCount: 7 },
    ]);
    expect(notices).toEqual([{ id: 'dropped-invalid', variant: 'info', text: "2 repositories couldn't be shown." }]);
    expect(JSON.stringify(notices)).not.toMatch(/private|7/);
  });

  it('gives no private-only notice', () => {
    expect(listNotices(baseList({ droppedPrivateCount: 4 }), [{ kind: 'dropped-items', invalidCount: 0, privateCount: 4 }])).toEqual([]);
  });

  it('does not repeat a stale warning', () => {
    expect(listNotices(baseList(), [{ kind: 'stale-data', ageMs: 5, refreshErrorKind: 'network' }])).toEqual([]);
  });

  it('keeps the order truncated, partial, dropped', () => {
    const ids = listNotices(baseList({ droppedInvalidCount: 1, partial: true }), [
      { kind: 'partial-list', retrievedCount: 3 },
      { kind: 'truncated-list', retrievedCount: 3, totalCount: 5 },
    ]).map((notice) => notice.id);
    expect(ids).toEqual(['truncated', 'partial', 'dropped-invalid']);
  });
});

describe('readDisplayContext (D-U6)', () => {
  it('falls back to en and UTC when Intl gives nothing', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ locale: '', timeZone: '' }) }) as unknown as Intl.DateTimeFormat,
    );
    expect(readDisplayContext()).toEqual({ locale: 'en', timeZone: 'UTC' });
    spy.mockRestore();
  });

  it('falls back when Intl throws', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(readDisplayContext()).toEqual({ locale: 'en', timeZone: 'UTC' });
    spy.mockRestore();
  });

  it('returns what Intl reports', () => {
    expect(readDisplayContext().locale.length).toBeGreaterThan(0);
  });
});

describe('safeExternalLink (D-I4)', () => {
  it('accepts https URLs and adds rel and target', () => {
    expect(safeExternalLink('https://github.com/o/r')).toEqual({
      href: 'https://github.com/o/r',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
  });

  it('rejects other schemes, malformed values and empty values', () => {
    for (const url of ['http://github.com', 'javascript:alert(1)', 'data:text/html,x', 'https://', '//github.com', '', null, undefined]) {
      expect(safeExternalLink(url)).toBeNull();
    }
  });
});
