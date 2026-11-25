// Task 5.9: adapter unit tests (design 8.2).
// Normal conversions use captured fixtures only (Req 14.4). Edge and error cases use
// constructed fixtures.
import { describe, expect, it } from 'vitest';
import {
  adaptLatestCommit,
  adaptManifestLastChange,
  adaptRecentAuthors,
  manifestNotFound,
  recentAuthorsSkipped,
} from '../../src/data/github/adapters/commits';
import { adaptBranches } from '../../src/data/github/adapters/branches';
import { adaptOpenIssues } from '../../src/data/github/adapters/issues';
import { adaptReadme } from '../../src/data/github/adapters/readme';
import { adaptRepository, adaptRepositoryPage } from '../../src/data/github/adapters/repository';
import { adaptRootContents, detectManifest } from '../../src/data/github/adapters/root-contents';
import { adaptUser } from '../../src/data/github/adapters/user';
import { adaptWorkflowRuns } from '../../src/data/github/adapters/workflow-runs';
import type { RepositorySummary } from '../../src/data/github/types';
import {
  capturedFileNames,
  capturedResponse,
  constructedResponse,
  loadCaptured,
  loadConstructed,
} from './helpers/fixtures';

function valueOf<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('Expected a successful adapter result');
  return result.value;
}

describe('adaptUser', () => {
  it('converts a captured user profile', () => {
    expect(valueOf(adaptUser(loadCaptured('user.ncptunex.json').body))).toEqual({
      login: 'ncptunex',
      displayName: null,
      avatarUrl: 'https://avatars.githubusercontent.com/u/235640995?v=4',
      profileUrl: 'https://github.com/ncptunex',
      accountType: 'user',
      publicRepoCount: 9,
    });
  });

  it('converts a captured organisation profile', () => {
    expect(valueOf(adaptUser(loadCaptured('user.vitest-dev.json').body))).toEqual({
      login: 'vitest-dev',
      displayName: 'Vitest',
      avatarUrl: 'https://avatars.githubusercontent.com/u/95747107?v=4',
      profileUrl: 'https://github.com/vitest-dev',
      accountType: 'organisation',
      publicRepoCount: 10,
    });
  });

  it('fails with unexpected-response when the login is missing', () => {
    const result = adaptUser(loadConstructed('user-missing-login.json').body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('unexpected-response');
  });

  it('turns wrong-type optional fields into null', () => {
    const user = valueOf(adaptUser(loadConstructed('user-wrong-type-optional-fields.json').body));
    expect(user.displayName).toBeNull();
    expect(user.avatarUrl).toBeNull();
    expect(user.publicRepoCount).toBeNull();
    expect(user.login).toBe('example-user');
  });
});

describe('adaptRepository', () => {
  it('converts the captured archived repository', () => {
    expect(valueOf(adaptRepository(loadCaptured('repo.atom.atom.json').body))).toEqual({
      id: 3228505,
      owner: 'atom',
      name: 'atom',
      fullName: 'atom/atom',
      url: 'https://github.com/atom/atom',
      description: ':atom: The hackable text editor',
      primaryLanguage: 'JavaScript',
      stars: 60686,
      forks: 17149,
      openIssuesAndPullRequestsCount: 993,
      hasIssues: true,
      isFork: false,
      isArchived: true,
      defaultBranch: 'master',
      createdAt: '2012-01-20T18:18:21.000Z',
      pushedAt: '2023-01-03T10:49:48.000Z',
      sizeKb: 330585,
    } satisfies RepositorySummary);
  });

  it('marks the captured fork with issues turned off', () => {
    const repo = valueOf(
      adaptRepository(loadCaptured('repo.ncptunex.devops-micro-internship-pravinmishra.json').body),
    );
    expect(repo.isFork).toBe(true);
    expect(repo.hasIssues).toBe(false);
    expect(repo.isArchived).toBe(false);
  });

  it('returns the official name for the captured renamed repository', () => {
    const fixture = loadCaptured('repo.zeit.next.js.json');
    const repo = valueOf(adaptRepository(fixture.body));
    expect(fixture.meta.endpoint).toBe('/repos/zeit/next.js');
    expect(repo.fullName).toBe('vercel/next.js');
    expect(repo.owner).toBe('vercel');
  });

  it.each([
    'repo.ncptunex.Kiroween-2026-GRAVEREPO.json',
    'repo.ncptunex.foodstarter.json',
    'repo.dubzzz.fast-check.json',
  ])('converts captured %s', (file) => {
    const fixture = loadCaptured(file);
    const repo = valueOf(adaptRepository(fixture.body));
    expect(repo.fullName).toBe(fixture.meta.source);
  });

  it('never returns a repository marked private', () => {
    const privateItem = (loadConstructed('repo-list-private-items.json').body as unknown[])[1];
    const result = adaptRepository(privateItem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('repo-not-found');
  });
});

describe('adaptRepositoryPage', () => {
  it.each([
    ['user-repos.ncptunex.json', 'ncptunex', 9],
    ['org-repos.vitest-dev.json', 'vitest-dev', 10],
  ])('converts captured %s with every item kept', (file, owner, count) => {
    const page = valueOf(adaptRepositoryPage(loadCaptured(file).body));
    expect(page.repositories).toHaveLength(count);
    expect(page.droppedInvalidCount).toBe(0);
    expect(page.droppedPrivateCount).toBe(0);
    expect(new Set(page.repositories.map((repo) => repo.owner))).toEqual(new Set([owner]));
  });

  it('keeps forks and archived repositories and marks them', () => {
    const page = valueOf(adaptRepositoryPage(loadCaptured('user-repos.ncptunex.json').body));
    const fork = page.repositories.find((repo) => repo.name === 'devops-micro-internship-pravinmishra');
    expect(fork?.isFork).toBe(true);
  });

  it('drops items with missing or wrong-type required fields and counts them', () => {
    const page = valueOf(adaptRepositoryPage(loadConstructed('repo-list-invalid-items.json').body));
    expect(page.repositories.map((repo) => repo.name)).toEqual(['complete-item', 'wrong-type-optionals']);
    expect(page.droppedInvalidCount).toBe(4);
    expect(page.droppedPrivateCount).toBe(0);
  });

  it('turns missing, empty and wrong-type optional fields into null', () => {
    const page = valueOf(adaptRepositoryPage(loadConstructed('repo-list-invalid-items.json').body));
    const item = page.repositories[1];
    expect(item).toMatchObject({
      description: null,
      primaryLanguage: null,
      stars: null,
      forks: null,
      openIssuesAndPullRequestsCount: null,
      hasIssues: null,
      defaultBranch: null,
      createdAt: null,
      pushedAt: null,
      sizeKb: null,
      isFork: true,
      isArchived: true,
    });
  });

  it('drops private and non-public items and counts them separately', () => {
    const page = valueOf(adaptRepositoryPage(loadConstructed('repo-list-private-items.json').body));
    expect(page.repositories.map((repo) => repo.name)).toEqual(['public-item']);
    expect(page.droppedPrivateCount).toBe(3);
    expect(page.droppedInvalidCount).toBe(0);
  });

  it('accepts an empty list', () => {
    expect(valueOf(adaptRepositoryPage([]))).toEqual({
      repositories: [],
      droppedInvalidCount: 0,
      droppedPrivateCount: 0,
    });
  });

  it('fails with unexpected-response when the body is not a list', () => {
    const result = adaptRepositoryPage({ message: 'Not a list' });
    expect(result.ok).toBe(false);
  });
});

describe('adaptReadme', () => {
  it('reports the captured 404 as "no README found", not an error', () => {
    expect(adaptReadme(capturedResponse('readme.ncptunex.Kiroween-2026-GRAVEREPO.json'))).toEqual({
      status: 'available',
      value: { found: false, url: null },
    });
  });

  it('reports a captured README as found, with its web URL', () => {
    expect(adaptReadme(capturedResponse('readme.dubzzz.fast-check.json'))).toEqual({
      status: 'available',
      value: { found: true, url: 'https://github.com/dubzzz/fast-check/blob/main/.github/README.md' },
    });
  });

  it('reports a rate limit as unavailable', () => {
    expect(adaptReadme(constructedResponse('rate-limit-primary-403.json'))).toEqual({
      status: 'unavailable',
      reason: 'rate-limited',
    });
  });
});

describe('commits adapters', () => {
  it('converts the captured latest commit using the committer date and the login', () => {
    expect(adaptLatestCommit(capturedResponse('commits-latest.dubzzz.fast-check.json'))).toEqual({
      status: 'available',
      value: {
        date: '2026-11-22T10:16:12.000Z',
        shortSha: '574ff3b',
        url: 'https://github.com/dubzzz/fast-check/commit/574ff3b1b2e66c7cf6e7edfb54970b8ba0bbaf82',
        author: 'dubzzz',
      },
    });
  });

  it('uses the committer date when it differs from the author date', () => {
    const result = adaptLatestCommit(constructedResponse('commit-author-date-differs.json'));
    expect(result.status === 'available' && result.value.date).toBe('2026-06-15T18:45:00.000Z');
  });

  it('falls back to the author name when there is no GitHub login', () => {
    const result = adaptLatestCommit(constructedResponse('commit-author-date-differs.json'));
    expect(result.status === 'available' && result.value.author).toBe('Example Author');
  });

  it('marks an empty repository (409) as not-applicable', () => {
    const response = constructedResponse('empty-repo-commits-409.json');
    const expected = { status: 'not-applicable', reason: 'empty-repository' };
    expect(adaptLatestCommit(response)).toEqual(expected);
    expect(adaptRecentAuthors(response, '2025-11-22T00:00:00Z')).toEqual(expected);
    expect(adaptManifestLastChange(response, 'package.json')).toEqual(expected);
  });

  it('counts the captured recent authors by login', () => {
    const fixture = loadCaptured('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json');
    expect(fixture.meta.endpoint).toContain('since=2025-11-22T00:00:00Z');
    expect(adaptRecentAuthors(capturedResponse('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json'), '2025-11-22T00:00:00Z')).toEqual({
      status: 'available',
      value: { windowStart: '2025-11-22T00:00:00Z', authorCount: 1, isLowerBound: false, commitsRead: 1 },
    });
  });

  it('marks the author count as a lower bound when 100 commits come back', () => {
    // Edge case built from a constructed commit: 100 copies of the same constructed item.
    const commit = (loadConstructed('commit-author-date-differs.json').body as unknown[])[0];
    const response = { status: 200, headers: {}, body: Array.from({ length: 100 }, () => commit) };
    const result = adaptRecentAuthors(response, '2025-11-22T00:00:00Z');
    expect(result).toEqual({
      status: 'available',
      value: { windowStart: '2025-11-22T00:00:00Z', authorCount: 1, isLowerBound: true, commitsRead: 100 },
    });
  });

  it('reports zero recent authors without a request when skipped', () => {
    expect(recentAuthorsSkipped('2025-11-22T00:00:00Z')).toEqual({
      status: 'available',
      value: { windowStart: '2025-11-22T00:00:00Z', authorCount: 0, isLowerBound: false, commitsRead: 0 },
    });
  });

  it('converts the captured manifest last change', () => {
    expect(adaptManifestLastChange(capturedResponse('commits-manifest.ncptunex.foodstarter.json'), 'package.json')).toEqual({
      status: 'available',
      value: {
        fileName: 'package.json',
        lastChangedAt: '2026-11-21T09:03:36.000Z',
        commitUrl: 'https://github.com/ncptunex/foodstarter/commit/b977289ae5857b94e1faf4beda36887f7ee6f063',
      },
    });
  });

  it('reports "no manifest found" without inventing a date', () => {
    expect(manifestNotFound()).toEqual({
      status: 'available',
      value: { fileName: null, lastChangedAt: null, commitUrl: null },
    });
  });
});

describe('adaptOpenIssues', () => {
  it('counts the captured open items without pull requests and finds the oldest issue', () => {
    const fixture = loadCaptured('issues.dubzzz.fast-check.json');
    const items = fixture.body as { pull_request?: unknown }[];
    const issueCount = items.filter((item) => item.pull_request === undefined).length;
    expect(issueCount).toBeLessThan(items.length);

    const result = adaptOpenIssues(capturedResponse('issues.dubzzz.fast-check.json'), 'https://github.com/dubzzz/fast-check');
    expect(result).toEqual({
      status: 'available',
      value: {
        count: issueCount,
        isLowerBound: false,
        issuesPageUrl: 'https://github.com/dubzzz/fast-check/issues',
        itemsRead: items.length,
        oldest: {
          createdAt: '2019-04-08T19:41:19.000Z',
          number: 342,
          url: 'https://github.com/dubzzz/fast-check/issues/342',
        },
        oldestNotFoundInFirst100: false,
      },
    });
  });

  it('reports the captured empty list as no open issues', () => {
    const result = adaptOpenIssues(
      capturedResponse('issues.ncptunex.Kiroween-2026-GRAVEREPO.json'),
      'https://github.com/ncptunex/Kiroween-2026-GRAVEREPO',
    );
    expect(result).toEqual({
      status: 'available',
      value: {
        count: 0,
        isLowerBound: false,
        issuesPageUrl: 'https://github.com/ncptunex/Kiroween-2026-GRAVEREPO/issues',
        itemsRead: 0,
        oldest: null,
        oldestNotFoundInFirst100: false,
      },
    });
  });

  it('reports 100 pull requests as a lower bound with the oldest issue not found in the first 100', () => {
    const result = adaptOpenIssues(constructedResponse('issues-all-pull-requests.json'), 'https://github.com/example-org/busy-repo');
    expect(result).toEqual({
      status: 'available',
      value: {
        count: 0,
        isLowerBound: true,
        issuesPageUrl: 'https://github.com/example-org/busy-repo/issues',
        itemsRead: 100,
        oldest: null,
        oldestNotFoundInFirst100: true,
      },
    });
  });

  it('reports issues turned off (410) as not-applicable', () => {
    expect(adaptOpenIssues(constructedResponse('issues-disabled-410.json'), 'https://github.com/a/b')).toEqual({
      status: 'not-applicable',
      reason: 'issues-disabled',
    });
  });

  it('reports a server error as unavailable', () => {
    expect(adaptOpenIssues(constructedResponse('server-error-502.json'), 'https://github.com/a/b')).toEqual({
      status: 'unavailable',
      reason: 'github-unavailable',
    });
  });
});

describe('adaptBranches', () => {
  it('marks the captured 100 branches as a lower bound', () => {
    expect(adaptBranches(capturedResponse('branches.dubzzz.fast-check.json'))).toEqual({
      status: 'available',
      value: { count: 100, isLowerBound: true },
    });
  });

  it('counts the captured branches exactly when fewer than 100 come back', () => {
    expect(adaptBranches(capturedResponse('branches.ncptunex.Kiroween-2026-GRAVEREPO.json'))).toEqual({
      status: 'available',
      value: { count: 2, isLowerBound: false },
    });
  });
});

describe('adaptWorkflowRuns', () => {
  it.each(['workflow-runs.ncptunex.Kiroween-2026-GRAVEREPO.json', 'workflow-runs.ncptunex.foodstarter.json'])(
    'reports captured %s as "no workflow runs found"',
    (file) => {
      expect(adaptWorkflowRuns(capturedResponse(file))).toEqual({ status: 'available', value: { found: false } });
    },
  );

  it('converts the captured latest workflow run', () => {
    expect(adaptWorkflowRuns(capturedResponse('workflow-runs.dubzzz.fast-check.json'))).toEqual({
      status: 'available',
      value: {
        found: true,
        conclusion: 'success',
        date: '2026-11-22T11:00:01.000Z',
        url: 'https://github.com/dubzzz/fast-check/actions/runs/45015110094',
      },
    });
  });

  it('reports "not found" as "no workflow runs found"', () => {
    expect(adaptWorkflowRuns(constructedResponse('workflow-runs-not-found-404.json'))).toEqual({
      status: 'available',
      value: { found: false },
    });
  });
});

describe('adaptRootContents and detectManifest', () => {
  it('finds package.json in the captured root folder', () => {
    expect(adaptRootContents(capturedResponse('root-contents.ncptunex.foodstarter.json'))).toEqual({
      status: 'available',
      value: { manifestFileName: 'package.json' },
    });
  });

  it('marks an empty repository as not-applicable', () => {
    expect(adaptRootContents(constructedResponse('empty-repo-contents-404.json'))).toEqual({
      status: 'not-applicable',
      reason: 'empty-repository',
    });
  });

  it('treats any other 404 as repo-not-found', () => {
    expect(adaptRootContents(constructedResponse('repo-not-found-404.json'))).toEqual({
      status: 'unavailable',
      reason: 'repo-not-found',
    });
  });

  it('follows the catalogue order and ignores folders', () => {
    expect(
      detectManifest([
        { name: 'go.mod', type: 'file' },
        { name: 'package.json', type: 'dir' },
        { name: 'Cargo.toml', type: 'file' },
      ]),
    ).toBe('Cargo.toml');
    expect(detectManifest([{ name: 'README.md', type: 'file' }])).toBeNull();
  });
});

describe('privacy', () => {
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

  function adaptCaptured(name: string): unknown {
    const response = capturedResponse(name);
    if (name.startsWith('user.')) return adaptUser(response.body);
    if (name.startsWith('user-repos.') || name.startsWith('org-repos.')) return adaptRepositoryPage(response.body);
    if (name.startsWith('repo.')) return adaptRepository(response.body);
    if (name.startsWith('readme.')) return adaptReadme(response);
    if (name.startsWith('commits-latest.')) return adaptLatestCommit(response);
    if (name.startsWith('commits-since.')) return adaptRecentAuthors(response, '2025-11-22T00:00:00Z');
    if (name.startsWith('commits-manifest.')) return adaptManifestLastChange(response, 'package.json');
    if (name.startsWith('issues.')) return adaptOpenIssues(response, 'https://github.com/a/b');
    if (name.startsWith('branches.')) return adaptBranches(response);
    if (name.startsWith('workflow-runs.')) return adaptWorkflowRuns(response);
    if (name.startsWith('root-contents.')) return adaptRootContents(response);
    throw new Error(`No adapter mapped for ${name}`);
  }

  it.each(capturedFileNames())('adapter output for %s contains no email field or address', (name) => {
    const output = JSON.stringify(adaptCaptured(name));
    expect(output.toLowerCase()).not.toContain('email');
    expect(output).not.toMatch(EMAIL);
  });
});
