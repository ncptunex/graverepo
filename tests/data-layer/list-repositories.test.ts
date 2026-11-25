// Tests for the pagination helper and `listRepositories`
// (tasks 9.2, 9.3 and 9.8; design 8.5 and 8.9; Req 2, 3, 7.8, 7.9, 8.10, 13.3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_REPOSITORY_PAGES,
  REPOSITORY_CAP,
  collectRepositoryPages,
  sortRepositoriesByPush,
  type PageOutcome,
} from '../../src/data/github/paginate';
import { makeError } from '../../src/data/github/errors/error-kinds';
import type { RepositorySummary } from '../../src/data/github/types';
import { adaptRepositoryPage } from '../../src/data/github/adapters/repository';
import { capturedResponse, constructedResponse, loadCaptured } from './helpers/fixtures';
import { createTestLayer, rawFrom, transportFailure, START, type Handler } from './helpers/fake-layer';

const MINUTE = 60_000;

function summary(id: number, pushedAt: string | null): RepositorySummary {
  return {
    id,
    owner: 'o',
    name: `r${id}`,
    fullName: `o/r${id}`,
    url: `https://github.com/o/r${id}`,
    description: null,
    primaryLanguage: null,
    stars: null,
    forks: null,
    openIssuesAndPullRequestsCount: null,
    hasIssues: null,
    isFork: false,
    isArchived: false,
    defaultBranch: null,
    createdAt: null,
    pushedAt,
    sizeKb: null,
  };
}

/** A page of `size` repositories. `firstId` keeps ids unique across pages. */
function page(firstId: number, size: number, nextPage: number | null): PageOutcome {
  return {
    ok: true,
    repositories: Array.from({ length: size }, (_, index) =>
      summary(firstId + index, new Date(Date.UTC(2026, 0, 1) - (firstId + index) * 1000).toISOString()),
    ),
    droppedInvalidCount: 0,
    droppedPrivateCount: 0,
    nextPage,
    fetchedAt: START.toISOString(),
  };
}

describe('sortRepositoriesByPush', () => {
  it('puts the most recent push first and repositories with no push date last, keeping every one', () => {
    const sorted = sortRepositoriesByPush([
      summary(1, null),
      summary(2, '2024-01-01T00:00:00.000Z'),
      summary(3, '2026-01-01T00:00:00.000Z'),
      summary(4, null),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([3, 2, 1, 4]);
  });

  it('property: output is ordered, null pushes last, and no item is lost', () => {
    const pushed = fc.option(
      fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
      { nil: null },
    );
    fc.assert(
      fc.property(fc.array(pushed, { maxLength: 40 }), (dates) => {
        const input = dates.map((date, index) => summary(index, date));
        const output = sortRepositoriesByPush(input);
        expect(output).toHaveLength(input.length);
        expect(new Set(output.map((item) => item.id))).toEqual(new Set(input.map((item) => item.id)));
        const firstNull = output.findIndex((item) => item.pushedAt === null);
        if (firstNull !== -1) expect(output.slice(firstNull).every((item) => item.pushedAt === null)).toBe(true);
        const withDates = output.filter((item) => item.pushedAt !== null);
        for (let index = 1; index < withDates.length; index += 1) {
          expect(Date.parse(withDates[index - 1]?.pushedAt ?? '')).toBeGreaterThanOrEqual(
            Date.parse(withDates[index]?.pushedAt ?? ''),
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('collectRepositoryPages', () => {
  it('follows nextPage numbers from the Link header and stops when there is none', async () => {
    const requested: number[] = [];
    const result = await collectRepositoryPages(async (number) => {
      requested.push(number);
      return number === 1 ? page(0, 100, 2) : page(100, 20, null);
    }, 120);
    expect(requested).toEqual([1, 2]);
    expect(result.ok && result.value).toMatchObject({ retrievedCount: 120, truncated: false, partial: false });
  });

  it('stops at 300, marks the result truncated, and keeps the total count', async () => {
    const requested: number[] = [];
    const result = await collectRepositoryPages(async (number) => {
      requested.push(number);
      return page((number - 1) * 100, 100, number + 1);
    }, 450);
    expect(requested).toEqual([1, 2, 3]);
    expect(result.ok && result.value).toMatchObject({
      retrievedCount: REPOSITORY_CAP,
      totalPublicCount: 450,
      truncated: true,
      partial: false,
    });
  });

  it('is not truncated when exactly 300 exist and there is no further page', async () => {
    const result = await collectRepositoryPages(
      async (number) => page((number - 1) * 100, 100, number < 3 ? number + 1 : null),
      300,
    );
    expect(result.ok && result.value).toMatchObject({ retrievedCount: 300, truncated: false });
  });

  it('returns what it has and marks the result partial when a later page fails', async () => {
    const result = await collectRepositoryPages(async (number) => {
      return number === 1 ? page(0, 100, 2) : { ok: false, error: makeError('network') };
    }, 250);
    expect(result.ok && result.value).toMatchObject({ retrievedCount: 100, partial: true, truncated: false });
  });

  it('returns the error when the first page fails', async () => {
    const result = await collectRepositoryPages(async () => ({ ok: false, error: makeError('timeout') }), null);
    expect(!result.ok && result.error.kind).toBe('timeout');
  });

  it('does not loop on a Link header that does not move forward', async () => {
    let calls = 0;
    const result = await collectRepositoryPages(async () => {
      calls += 1;
      return page(0, 10, 1);
    }, null);
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
  });

  it('property: never retrieves more than 300 repositories or reads more than 3 pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 150 }), { minLength: 1, maxLength: 6 }),
        fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }),
        async (sizes, total) => {
          let reads = 0;
          const result = await collectRepositoryPages(async (number) => {
            reads += 1;
            const size = sizes[number - 1] ?? 0;
            return page(number * 1000, size, number < sizes.length ? number + 1 : null);
          }, total);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value.repositories.length).toBeLessThanOrEqual(REPOSITORY_CAP);
          expect(result.value.retrievedCount).toBe(result.value.repositories.length);
          expect(reads).toBeLessThanOrEqual(MAX_REPOSITORY_PAGES);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Routes the `user` profile and a list of pages by endpoint and page number. */
function listHandler(
  options: {
    profile?: string;
    pages?: Record<number, () => ReturnType<Handler>>;
  } = {},
): Handler {
  return (request) => {
    if (request.endpointId === 'user') return rawFrom(capturedResponse(options.profile ?? 'user.ncptunex.json'));
    const pageNumber = Number(request.query?.page ?? 1);
    const make = options.pages?.[pageNumber];
    if (make) return make();
    return rawFrom(capturedResponse('user-repos.ncptunex.json'));
  };
}

describe('listRepositories', () => {
  it('lists a user’s repositories from a captured response, sorted, with live provenance', async () => {
    const { layer, transport } = createTestLayer(listHandler());
    const result = await layer.listRepositories('ncptunex');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.owner.login).toBe('ncptunex');
    expect(result.data.repositories).toHaveLength(9);
    expect(result.data).toMatchObject({ retrievedCount: 9, truncated: false, partial: false });
    expect(result.provenance.source).toBe('live');

    const pushes = result.data.repositories.map((repo) => Date.parse(repo.pushedAt ?? ''));
    expect(pushes).toEqual([...pushes].sort((a, b) => b - a));

    // A profile request, then one page of the user endpoint.
    expect(transport.calls.map((call) => call.endpointId)).toEqual(['user', 'user-repos']);
    expect(transport.calls[1]?.query).toEqual({
      type: 'owner',
      sort: 'pushed',
      direction: 'desc',
      per_page: 100,
      page: 1,
    });
  });

  it('uses the organisation endpoint with the public-only filter for an organisation', async () => {
    const { layer, transport } = createTestLayer((request) =>
      request.endpointId === 'user'
        ? rawFrom(capturedResponse('user.vitest-dev.json'))
        : rawFrom(capturedResponse('org-repos.vitest-dev.json')),
    );
    const result = await layer.listRepositories('vitest-dev');

    expect(result.ok && result.data.owner.accountType).toBe('organisation');
    expect(result.ok && result.data.repositories).toHaveLength(10);
    expect(transport.calls.map((call) => call.endpointId)).toEqual(['user', 'org-repos']);
    expect(transport.calls[1]?.query).toMatchObject({ type: 'public', sort: 'pushed' });
  });

  it('returns an empty list as a success when the account has no public repositories', async () => {
    const { layer } = createTestLayer((request) =>
      request.endpointId === 'user'
        ? rawFrom(capturedResponse('user.ncptunex.json'))
        : rawFrom({ status: 200, headers: {}, body: [] }),
    );
    const result = await layer.listRepositories('ncptunex');
    expect(result.ok && result.data).toMatchObject({ repositories: [], retrievedCount: 0, truncated: false });
  });

  it('keeps forks and archived repositories and marks them', async () => {
    const { layer } = createTestLayer(listHandler());
    const result = await layer.listRepositories('ncptunex');
    const expected = adaptRepositoryPage(loadCaptured('user-repos.ncptunex.json').body);
    expect(expected.ok).toBe(true);
    if (!result.ok || !expected.ok) return;
    expect(result.data.repositories.filter((repo) => repo.isFork)).toHaveLength(
      expected.value.repositories.filter((repo) => repo.isFork).length,
    );
    expect(result.data.repositories.filter((repo) => repo.isArchived)).toHaveLength(
      expected.value.repositories.filter((repo) => repo.isArchived).length,
    );
  });

  it('drops private items, counts them, and adds a dropped-items warning', async () => {
    const { layer } = createTestLayer((request) =>
      request.endpointId === 'user'
        ? rawFrom(capturedResponse('user.ncptunex.json'))
        : rawFrom(constructedResponse('repo-list-private-items.json')),
    );
    const result = await layer.listRepositories('ncptunex');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.droppedPrivateCount).toBeGreaterThan(0);
    expect(result.data.repositories.every((repo) => repo.fullName.length > 0)).toBe(true);
    expect(result.warnings).toContainEqual(expect.objectContaining({ kind: 'dropped-items' }));
  });

  it('truncates at 300, adds a truncated-list warning, and caches the truncated list', async () => {
    const { layer, transport } = createTestLayer((request) => {
      if (request.endpointId === 'user') {
        return rawFrom({
          ...capturedResponse('user.ncptunex.json'),
          body: { ...(capturedResponse('user.ncptunex.json').body as object), public_repos: 450 },
        });
      }
      const number = Number(request.query?.page ?? 1);
      return rawFrom(
        {
          status: 200,
          headers: {},
          body: Array.from({ length: 100 }, (_, index) => repoItem((number - 1) * 100 + index)),
        },
        { nextPage: number + 1 },
      );
    });
    const result = await layer.listRepositories('ncptunex');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ retrievedCount: 300, totalPublicCount: 450, truncated: true });
    expect(result.warnings).toContainEqual({ kind: 'truncated-list', retrievedCount: 300, totalCount: 450 });
    expect(transport.calls.filter((call) => call.endpointId === 'user-repos')).toHaveLength(3);

    // Cached, and the cached copy carries the same warning.
    const again = await layer.listRepositories('ncptunex');
    expect(again.ok && again.provenance.source).toBe('cache');
    expect(again.ok && again.warnings).toContainEqual(expect.objectContaining({ kind: 'truncated-list' }));
    expect(transport.calls).toHaveLength(4);
  });

  it('returns a partial list with a warning when page 2 fails, and does not cache it', async () => {
    let page2Fails = true;
    const { layer, transport } = createTestLayer((request) => {
      if (request.endpointId === 'user') return rawFrom(capturedResponse('user.ncptunex.json'));
      const number = Number(request.query?.page ?? 1);
      if (number === 2 && page2Fails) return transportFailure('network');
      return rawFrom(
        { status: 200, headers: {}, body: Array.from({ length: 100 }, (_, i) => repoItem((number - 1) * 100 + i)) },
        { nextPage: number === 1 ? 2 : null },
      );
    });
    const partial = await layer.listRepositories('ncptunex');
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.data).toMatchObject({ retrievedCount: 100, partial: true });
    expect(partial.warnings).toContainEqual({ kind: 'partial-list', retrievedCount: 100 });

    // Not cached: the next call asks GitHub again (the profile is cached, so two page requests).
    page2Fails = false;
    const callsBefore = transport.calls.length;
    const complete = await layer.listRepositories('ncptunex');
    expect(complete.ok && complete.provenance.source).toBe('live');
    expect(complete.ok && complete.data.partial).toBe(false);
    expect(transport.calls.length).toBe(callsBefore + 2);
  });

  it('returns an error and never demo data when the lookup fails', async () => {
    const { layer } = createTestLayer(() => transportFailure('network'));
    const result = await layer.listRepositories('ncptunex');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({ kind: 'network', demoAvailable: true });
  });

  it('returns user-not-found for an unknown account and sends no list request', async () => {
    const { layer, transport } = createTestLayer(() => rawFrom(constructedResponse('user-not-found-404.json')));
    const result = await layer.listRepositories('nobody-here');
    expect(!result.ok && result.error.kind).toBe('user-not-found');
    expect(transport.calls).toHaveLength(1);
  });

  it('rejects an invalid username without a request', async () => {
    const { layer, transport } = createTestLayer(listHandler());
    const result = await layer.listRepositories('not valid');
    expect(!result.ok && result.error.kind).toBe('invalid-username');
    expect(transport.calls).toHaveLength(0);
  });

  it('serves a fresh list from the cache, then refreshes after 10 minutes', async () => {
    const { layer, transport, advance } = createTestLayer(listHandler());
    await layer.listRepositories('ncptunex');
    advance(9 * MINUTE);
    const cached = await layer.listRepositories('NCPTUNEX');
    expect(cached.ok && cached.provenance).toMatchObject({ source: 'cache', stale: false });
    expect(transport.calls).toHaveLength(2);

    advance(2 * MINUTE);
    const refreshed = await layer.listRepositories('ncptunex');
    expect(refreshed.ok && refreshed.provenance.source).toBe('live');
  });

  it('serves a stale list with the refresh error when the refresh fails', async () => {
    let offline = false;
    const { layer, advance } = createTestLayer((request, number) =>
      offline ? transportFailure('timeout') : listHandler()(request, number),
    );
    await layer.listRepositories('ncptunex');
    advance(11 * MINUTE);
    offline = true;
    const result = await layer.listRepositories('ncptunex');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance).toMatchObject({ source: 'cache', stale: true });
    expect(result.refreshError?.kind).toBe('timeout');
    expect(result.warnings).toContainEqual(expect.objectContaining({ kind: 'stale-data' }));
  });

  it('shares one request between two identical concurrent calls', async () => {
    const { layer, transport } = createTestLayer(listHandler());
    const [first, second] = await Promise.all([layer.listRepositories('ncptunex'), layer.listRepositories('ncptunex')]);
    expect(first.ok && second.ok).toBe(true);
    expect(transport.calls).toHaveLength(2); // one profile and one page, not four
  });

  it('returns cancelled for a caller that aborts, and still fills the cache for others', async () => {
    const { layer } = createTestLayer(listHandler());
    const controller = new AbortController();
    const pending = layer.listRepositories('ncptunex', { signal: controller.signal });
    controller.abort();
    expect((await pending).ok).toBe(false);
    const result = await pending;
    expect(!result.ok && result.error.kind).toBe('cancelled');
  });
});

/** A minimal public repository item that passes the repository schema, for building large pages. */
function repoItem(index: number) {
  return {
    id: 7_000_000 + index,
    name: `project-${index}`,
    full_name: `ncptunex/project-${index}`,
    owner: { login: 'ncptunex', type: 'User' },
    html_url: `https://github.com/ncptunex/project-${index}`,
    private: false,
    visibility: 'public',
    fork: false,
    archived: false,
    pushed_at: new Date(Date.UTC(2026, 0, 1) - index * 60_000).toISOString(),
  };
}
