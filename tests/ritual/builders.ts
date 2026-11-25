// TEST BUILDERS for the ritual (resurrection-ritual task 2.4, design 9.1).
//
// Everything in this file is made up for tests. It is NOT GitHub data and NOT demo data, and
// it must never be shown to a user or copied into `src/` or into a demo snapshot.
// The repository names (`test-owner/test-repo`) and every value are placeholders.
import fc from 'fast-check';
import type {
  FieldResult,
  RepositoryDetail,
  RepositorySections,
  RepositorySummary,
} from '../../src/data/github/types';
import type { ErrorKind } from '../../src/data/github/errors/error-kinds';

/** The reference time used by example tests. */
export const REF = '2026-11-22T13:00:00.000Z';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An ISO date `days` before `reference` (negative for after). */
export function daysBefore(reference: string, days: number): string {
  return new Date(Date.parse(reference) - days * DAY_MS).toISOString();
}

export function available<T>(value: T): FieldResult<T> {
  return { status: 'available', value };
}

export function buildSummary(overrides: Partial<RepositorySummary> = {}): RepositorySummary {
  return {
    id: 1,
    owner: 'test-owner',
    name: 'test-repo',
    fullName: 'test-owner/test-repo',
    url: 'https://github.com/test-owner/test-repo',
    description: null,
    primaryLanguage: null,
    stars: 0,
    forks: 0,
    openIssuesAndPullRequestsCount: 0,
    hasIssues: true,
    isFork: false,
    isArchived: false,
    defaultBranch: 'main',
    createdAt: '2020-01-01T00:00:00.000Z',
    pushedAt: daysBefore(REF, 10),
    sizeKb: 10,
    ...overrides,
  };
}

/** A healthy-looking detail where every section is available and nothing is actionable. */
export function buildSections(reference = REF): RepositorySections {
  const recent = daysBefore(reference, 10);
  return {
    readme: available({ found: true, url: 'https://github.com/test-owner/test-repo#readme' }),
    latestCommit: available({
      date: recent,
      shortSha: 'abc1234',
      url: 'https://github.com/test-owner/test-repo/commit/abc1234',
      author: 'test-author',
    }),
    recentAuthors: available({
      windowStart: daysBefore(reference, 365),
      authorCount: 2,
      isLowerBound: false,
      commitsRead: 5,
    }),
    openIssues: available({
      count: 0,
      isLowerBound: false,
      issuesPageUrl: 'https://github.com/test-owner/test-repo/issues',
      itemsRead: 0,
      oldest: null,
      oldestNotFoundInFirst100: false,
    }),
    branches: available({ count: 3, isLowerBound: false }),
    ci: available({
      found: true,
      conclusion: 'success',
      date: recent,
      url: 'https://github.com/test-owner/test-repo/actions/runs/1',
    }),
    manifest: available({
      fileName: 'package.json',
      lastChangedAt: recent,
      commitUrl: 'https://github.com/test-owner/test-repo/commit/def5678',
    }),
  };
}

export type DetailOverrides = {
  readonly core?: Partial<RepositorySummary>;
  readonly sections?: Partial<RepositorySections>;
  readonly renamedFrom?: string | null;
  readonly isEmpty?: boolean;
  readonly reference?: string;
};

export function buildDetail(overrides: DetailOverrides = {}): RepositoryDetail {
  const reference = overrides.reference ?? REF;
  return {
    core: buildSummary({ pushedAt: daysBefore(reference, 10), ...overrides.core }),
    renamedFrom: overrides.renamedFrom ?? null,
    isEmpty: overrides.isEmpty ?? false,
    sections: { ...buildSections(reference), ...overrides.sections },
  };
}

/** A detail whose plan has exactly the items the overrides trigger. Here: README missing and an old latest commit. */
export function buildDetailWithTwoSteps(reference = REF): RepositoryDetail {
  const sections = buildSections(reference);
  return buildDetail({
    reference,
    sections: {
      readme: available({ found: false, url: null }),
      latestCommit: available({
        date: daysBefore(reference, 500),
        shortSha: 'old0001',
        url: 'https://github.com/test-owner/test-repo/commit/old0001',
        author: null,
      }),
      recentAuthors: sections.recentAuthors,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------------------------

const unavailableReasons: ErrorKind[] = ['network', 'timeout', 'rate-limited', 'unexpected-response', 'github-unavailable'];
const notApplicableReasons = ['empty-repository', 'issues-disabled', 'section-disabled'] as const;

/** A valid ISO reference time between 2021 and 2030. */
export const arbReferenceTime: fc.Arbitrary<string> = fc
  .date({ min: new Date('2021-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((date) => date.toISOString());

/** Seconds before the reference time. Negative values are in the future. */
const arbOffsetSeconds = fc.integer({ min: -2 * 86_400, max: 4 * 365 * 86_400 });

function at(reference: string, offsetSeconds: number): string {
  return new Date(Date.parse(reference) - offsetSeconds * 1000).toISOString();
}

function arbField<T>(arbValue: fc.Arbitrary<T>): fc.Arbitrary<FieldResult<T>> {
  return fc.oneof(
    { weight: 6, arbitrary: arbValue.map((value): FieldResult<T> => ({ status: 'available', value })) },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom(...unavailableReasons)
        .map((reason): FieldResult<T> => ({ status: 'unavailable', reason })),
    },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom(...notApplicableReasons)
        .map((reason): FieldResult<T> => ({ status: 'not-applicable', reason })),
    },
  );
}

function arbSections(reference: string): fc.Arbitrary<RepositorySections> {
  const readme = arbField(fc.boolean().map((found) => ({ found, url: found ? 'https://github.com/test-owner/test-repo#readme' : null })),
  );
  const latestCommit = arbField(fc.record({
      date: arbOffsetSeconds.map((offset) => at(reference, offset)),
      shortSha: fc.constant('abc1234'),
      url: fc.constant('https://github.com/test-owner/test-repo/commit/abc1234'),
      author: fc.option(fc.constant('test-author'), { nil: null }),
    }),
  );
  const recentAuthors = arbField(fc.record({
      windowStart: fc.constant(at(reference, 365 * 86_400)),
      authorCount: fc.integer({ min: 0, max: 20 }),
      isLowerBound: fc.boolean(),
      commitsRead: fc.integer({ min: 0, max: 100 }),
    }),
  );
  const openIssues = arbField(fc.record({
      count: fc.integer({ min: 0, max: 100 }),
      isLowerBound: fc.boolean(),
      issuesPageUrl: fc.constant('https://github.com/test-owner/test-repo/issues'),
      itemsRead: fc.integer({ min: 0, max: 100 }),
      oldest: fc.option(
        fc.record({
          createdAt: arbOffsetSeconds.map((offset) => at(reference, offset)),
          number: fc.integer({ min: 1, max: 999 }),
          url: fc.constant('https://github.com/test-owner/test-repo/issues/1'),
        }),
        { nil: null },
      ),
      oldestNotFoundInFirst100: fc.boolean(),
    }),
  );
  const branches = arbField(fc.record({ count: fc.integer({ min: 0, max: 100 }), isLowerBound: fc.boolean() }),
  );
  const ci = arbField(fc.oneof(
      fc.constant({ found: false as const }),
      fc.record({
        found: fc.constant(true as const),
        conclusion: fc.constantFrom<string | null>('success', 'failure', 'cancelled', 'timed_out', null),
        date: fc.option(arbOffsetSeconds.map((offset) => at(reference, offset)), { nil: null }),
        url: fc.constant('https://github.com/test-owner/test-repo/actions/runs/1'),
      }),
    ),
  );
  const manifest = arbField(fc.record({
      fileName: fc.option(fc.constantFrom('package.json', 'Cargo.toml', 'go.mod'), { nil: null }),
      lastChangedAt: fc.option(arbOffsetSeconds.map((offset) => at(reference, offset)), { nil: null }),
      commitUrl: fc.option(fc.constant('https://github.com/test-owner/test-repo/commit/def5678'), { nil: null }),
    }),
  );
  return fc.record({ readme, latestCommit, recentAuthors, openIssues, branches, ci, manifest });
}

/** A random detail built around a reference time. Test data only. */
export function arbDetail(reference: string): fc.Arbitrary<RepositoryDetail> {
  return fc
    .record({
      sections: arbSections(reference),
      pushedAt: fc.option(arbOffsetSeconds.map((offset) => at(reference, offset)), { nil: null }),
      isArchived: fc.boolean(),
      isFork: fc.boolean(),
      isEmpty: fc.boolean(),
      renamedFrom: fc.option(fc.constant('test-owner/old-name'), { nil: null }),
    })
    .map(({ sections, pushedAt, isArchived, isFork, isEmpty, renamedFrom }) => ({
      core: buildSummary({ pushedAt, isArchived, isFork }),
      renamedFrom,
      isEmpty,
      sections,
    }));
}

/** A random reference time together with a random detail built around it. */
export const arbCase: fc.Arbitrary<{ reference: string; detail: RepositoryDetail }> = arbReferenceTime.chain(
  (reference) => arbDetail(reference).map((detail) => ({ reference, detail })),
);
