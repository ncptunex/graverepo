// Task 5.10: adapter property tests (design 8.9, rows 1, 2 and 5).
// Generated values are small, and seeds are fixed so failures can be reproduced.
import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  adaptLatestCommit,
  adaptManifestLastChange,
  adaptRecentAuthors,
} from '../../src/data/github/adapters/commits';
import { adaptBranches } from '../../src/data/github/adapters/branches';
import { adaptOpenIssues } from '../../src/data/github/adapters/issues';
import { adaptReadme } from '../../src/data/github/adapters/readme';
import { adaptRepository, adaptRepositoryPage } from '../../src/data/github/adapters/repository';
import { adaptRootContents } from '../../src/data/github/adapters/root-contents';
import { adaptUser } from '../../src/data/github/adapters/user';
import { adaptWorkflowRuns } from '../../src/data/github/adapters/workflow-runs';
import { ERROR_KINDS } from '../../src/data/github/errors/error-kinds';
import type { HttpResponseLike } from '../../src/data/github/http-response';

const RUNS = { seed: 20261122, numRuns: 300 };
const WINDOW_START = '2025-11-22T00:00:00Z';

const coreAdapters = { adaptUser, adaptRepository, adaptRepositoryPage };

const sectionAdapters: Record<string, (response: HttpResponseLike) => unknown> = {
  adaptReadme,
  adaptLatestCommit,
  adaptRecentAuthors: (response) => adaptRecentAuthors(response, WINDOW_START),
  adaptManifestLastChange: (response) => adaptManifestLastChange(response, 'package.json'),
  adaptOpenIssues: (response) => adaptOpenIssues(response, 'https://github.com/a/b'),
  adaptBranches,
  adaptWorkflowRuns,
  adaptRootContents,
};

const statusArb = fc.constantFrom(200, 201, 204, 301, 400, 403, 404, 409, 410, 422, 429, 451, 500, 502, 503);
const headersArb = fc.dictionary(
  fc.constantFrom('x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'link'),
  fc.oneof(fc.constantFrom('0', '30', '1795359600'), fc.string({ maxLength: 8 })),
);
const responseArb: fc.Arbitrary<HttpResponseLike> = fc.record({
  status: statusArb,
  headers: headersArb,
  body: fc.jsonValue({ maxDepth: 3 }),
  bodyParseFailed: fc.boolean(),
});

describe('property: adapters never throw (design 8.9 row 1, Req 6.9)', () => {
  it.each(Object.entries(coreAdapters))('%s returns a value or unexpected-response for any JSON', (_, adapt) => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), (body) => {
        const result = adapt(body);
        if (result.ok) return true;
        // A private repository is reported as not found (Req 13.3); everything else is unexpected.
        return result.error.kind === 'unexpected-response' || result.error.kind === 'repo-not-found';
      }),
      RUNS,
    );
  });

  it.each(Object.entries(sectionAdapters))('%s returns a valid field result for any response', (_, adapt) => {
    fc.assert(
      fc.property(responseArb, (response) => {
        const result = adapt(response) as { status: string; reason?: string };
        if (result.status === 'available') return true;
        if (result.status === 'not-applicable') {
          return ['empty-repository', 'issues-disabled', 'section-disabled'].includes(result.reason ?? '');
        }
        return result.status === 'unavailable' && (ERROR_KINDS as string[]).includes(result.reason ?? '');
      }),
      RUNS,
    );
  });
});

// Values that look like GitHub data, mixed with wrong types, nulls and missing keys.
const maybe = <T>(arb: fc.Arbitrary<T>) =>
  fc.oneof(arb, fc.constant(null), fc.constant(undefined), fc.string({ maxLength: 5 }), fc.integer(), fc.double());
const dateArb = fc.oneof(
  fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString()),
  fc.constantFrom('2026-11-22T07:57:26Z', 'not a date', ''),
);
const repoItemArb = fc.record(
  {
    id: maybe(fc.nat()),
    name: maybe(fc.constantFrom('alpha', 'beta', 'gamma')),
    owner: maybe(fc.record({ login: maybe(fc.constantFrom('example-user', 'example-org')) })),
    html_url: maybe(fc.constantFrom('https://github.com/example-user/alpha', 'http://insecure.example/x')),
    private: maybe(fc.boolean()),
    visibility: maybe(fc.constantFrom('public', 'private', 'internal')),
    fork: maybe(fc.boolean()),
    archived: maybe(fc.boolean()),
    description: maybe(fc.string({ maxLength: 10 })),
    language: maybe(fc.constantFrom('TypeScript', 'Go')),
    stargazers_count: maybe(fc.integer({ min: -5, max: 1000 })),
    forks_count: maybe(fc.integer({ min: -5, max: 1000 })),
    open_issues_count: maybe(fc.integer({ min: -5, max: 1000 })),
    has_issues: maybe(fc.boolean()),
    default_branch: maybe(fc.constantFrom('main', 'master')),
    created_at: maybe(dateArb),
    pushed_at: maybe(dateArb),
    size: maybe(fc.integer({ min: -5, max: 100000 })),
  },
  { requiredKeys: [] },
);

function isCountOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function isIsoOrNull(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

describe('property: counts and dates are well-formed (design 8.9 row 2, Req 5.3, 5.4)', () => {
  it('every repository summary count is null or a whole number, and every date is null or ISO UTC', () => {
    fc.assert(
      fc.property(fc.array(repoItemArb, { maxLength: 8 }), (items) => {
        const result = adaptRepositoryPage(items);
        if (!result.ok) return false;
        const counts = [result.value.droppedInvalidCount, result.value.droppedPrivateCount];
        return (
          counts.every(isCountOrNull) &&
          result.value.repositories.every(
            (repo) =>
              [repo.stars, repo.forks, repo.openIssuesAndPullRequestsCount, repo.sizeKb].every(isCountOrNull) &&
              [repo.createdAt, repo.pushedAt].every(isIsoOrNull),
          )
        );
      }),
      RUNS,
    );
  });

  it('every user profile count is null or a whole number', () => {
    const userArb = fc.record(
      {
        login: maybe(fc.constantFrom('example-user')),
        html_url: maybe(fc.constant('https://github.com/example-user')),
        type: maybe(fc.constantFrom('User', 'Organization', 'Bot')),
        public_repos: maybe(fc.integer({ min: -5, max: 500 })),
      },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(userArb, (body) => {
        const result = adaptUser(body);
        return !result.ok || isCountOrNull(result.value.publicRepoCount);
      }),
      RUNS,
    );
  });

  it('every section value count is a whole number and every date is ISO UTC', () => {
    const commitArb = fc.record({
      sha: fc.constantFrom('0123456789abcdef0123456789abcdef01234567'),
      html_url: fc.constant('https://github.com/a/b/commit/0123456'),
      commit: fc.record({
        committer: fc.record({ date: dateArb }),
        author: maybe(fc.record({ name: maybe(fc.constantFrom('Example Author')) })),
      }),
      author: maybe(fc.record({ login: maybe(fc.constantFrom('example-user', 'Example-User')) })),
    });
    const issueArb = fc.record(
      {
        number: fc.integer({ min: 1, max: 9999 }),
        html_url: fc.constant('https://github.com/a/b/issues/1'),
        created_at: dateArb,
        pull_request: fc.option(fc.record({ url: fc.constant('https://api.github.com/x') }), { nil: undefined }),
      },
      { requiredKeys: ['number', 'html_url', 'created_at'] },
    );
    fc.assert(
      fc.property(fc.array(commitArb, { maxLength: 5 }), fc.array(issueArb, { maxLength: 5 }), (commits, issues) => {
        const ok = (body: unknown): HttpResponseLike => ({ status: 200, headers: {}, body });
        const latest = adaptLatestCommit(ok(commits));
        const authors = adaptRecentAuthors(ok(commits), WINDOW_START);
        const open = adaptOpenIssues(ok(issues), 'https://github.com/a/b');
        const checks: boolean[] = [];
        if (latest.status === 'available') checks.push(isIsoOrNull(latest.value.date));
        if (authors.status === 'available') {
          checks.push(isCountOrNull(authors.value.authorCount), isCountOrNull(authors.value.commitsRead));
        }
        if (open.status === 'available') {
          checks.push(isCountOrNull(open.value.count), isCountOrNull(open.value.itemsRead));
          if (open.value.oldest) checks.push(isIsoOrNull(open.value.oldest.createdAt));
        }
        return checks.every(Boolean);
      }),
      RUNS,
    );
  });
});

describe('property: private repositories never appear (design 8.9 row 5, Req 13.3)', () => {
  it('a list with private or non-public items returns none of them', () => {
    // Every non-public item is named `secret-item`; no other generated item uses that name.
    const nonPublicArb = fc
      .tuple(repoItemArb, fc.constantFrom<[unknown, unknown]>([true, 'private'], [true, undefined], [false, 'internal'], [false, 'private']))
      .map(([item, [isPrivate, visibility]]) => ({ ...item, name: 'secret-item', private: isPrivate, visibility }));
    fc.assert(
      fc.property(fc.array(fc.oneof(repoItemArb, nonPublicArb), { maxLength: 10 }), (items) => {
        const result = adaptRepositoryPage(items);
        if (!result.ok) return false;
        const secretCount = items.filter((item) => item.name === 'secret-item').length;
        return (
          result.value.repositories.every((repo) => repo.name !== 'secret-item') &&
          result.value.droppedPrivateCount >= secretCount
        );
      }),
      RUNS,
    );
  });

  it('a single repository marked private is never returned', () => {
    fc.assert(
      fc.property(repoItemArb, (item) => {
        const result = adaptRepository({ ...item, private: true });
        return !result.ok;
      }),
      RUNS,
    );
  });
});
