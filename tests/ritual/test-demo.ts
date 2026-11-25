// TEST-ONLY DEMO LOADER (resurrection-ritual task 10 and design 9.1).
//
// This lets the ritual be developed and tested before a real demo snapshot exists (data-layer
// task 6.5, which needs a GitHub token and is deferred).
//
// It is NOT the production demo. Its data comes from the test builders, it is never read by
// code in `src/`, and it must never be written to `src/data/demo/graveyard.snapshot.json`.
// Every repository belongs to the made-up owner `test-owner`, and the capture date is a
// placeholder that is clearly in the past.
import type { DataResult, DemoGraveyard, RepositoryDetail, UserProfile } from '../../src/data/github/types';
import type { RitualDataLayer } from '../../src/state/ritual-session';
import { REF, available, buildDetail, buildDetailWithTwoSteps } from './builders';

export const TEST_DEMO_CAPTURED_AT = '2026-11-20T00:00:00.000Z';

const NO_REQUESTS = {
  route: 'direct',
  limit: null,
  remaining: null,
  resetAt: null,
  tokenUsed: false,
  blockedUntil: null,
} as const;

function named(name: string, detail: RepositoryDetail): RepositoryDetail {
  return {
    ...detail,
    core: {
      ...detail.core,
      name,
      fullName: `test-owner/${name}`,
      url: `https://github.com/test-owner/${name}`,
    },
  };
}

/** The made-up repositories of the test-only demo graveyard. */
export function testDemoDetails(): RepositoryDetail[] {
  const reference = TEST_DEMO_CAPTURED_AT;
  return [
    // Nothing to suggest: every check is fine.
    named('test-healthy', buildDetail({ reference })),
    // Two steps: no README, and a latest commit older than 12 months.
    named('test-two-steps', buildDetailWithTwoSteps(reference)),
    // Archived, with an old push and open issues.
    named(
      'test-archived',
      buildDetail({
        reference,
        core: { isArchived: true, pushedAt: '2023-01-01T00:00:00.000Z' },
        sections: {
          openIssues: available({
            count: 2,
            isLowerBound: false,
            issuesPageUrl: 'https://github.com/test-owner/test-archived/issues',
            itemsRead: 2,
            oldest: { createdAt: '2022-05-01T00:00:00.000Z', number: 1, url: 'https://github.com/test-owner/test-archived/issues/1' },
            oldestNotFoundInFirst100: false,
          }),
        },
      }),
    ),
    // Empty repository.
    named(
      'test-empty',
      buildDetail({
        reference,
        isEmpty: true,
        core: { pushedAt: null },
        sections: {
          latestCommit: { status: 'not-applicable', reason: 'empty-repository' },
          recentAuthors: { status: 'not-applicable', reason: 'empty-repository' },
          manifest: { status: 'not-applicable', reason: 'empty-repository' },
          readme: available({ found: false, url: null }),
        },
      }),
    ),
  ];
}

function testProfile(): UserProfile {
  return {
    login: 'test-owner',
    displayName: null,
    avatarUrl: null,
    profileUrl: 'https://github.com/test-owner',
    accountType: 'user',
    publicRepoCount: 4,
  };
}

/** The test-only counterpart of `loadDemoGraveyard`. It sends no request. */
export async function loadTestOnlyDemoGraveyard(): Promise<DataResult<DemoGraveyard>> {
  const details = testDemoDetails();
  return {
    ok: true,
    data: {
      capturedAt: TEST_DEMO_CAPTURED_AT,
      sourceAccounts: [testProfile()],
      repositories: details.map((detail) => detail.core),
      details,
    },
    provenance: { source: 'demo', route: 'bundled', fetchedAt: TEST_DEMO_CAPTURED_AT, stale: false },
    warnings: [],
    rateLimit: NO_REQUESTS,
  };
}

/** A fake data layer for session tests. `live` answers `getRepositoryDetail`. Calls are recorded. */
export function createFakeRitualDataLayer(
  live: (owner: string, repo: string, signal: AbortSignal | undefined) => Promise<DataResult<RepositoryDetail>> = async () => {
    throw new Error('getRepositoryDetail must not be called in this test');
  },
): RitualDataLayer & {
  readonly liveCalls: { owner: string; repo: string; options: unknown }[];
  demoLoads: () => number;
} {
  const liveCalls: { owner: string; repo: string; options: unknown }[] = [];
  let demoLoads = 0;
  return {
    liveCalls,
    demoLoads: () => demoLoads,
    getRepositoryDetail(owner, repo, options) {
      liveCalls.push({ owner, repo, options });
      return live(owner, repo, options?.signal);
    },
    estimateDetailRequests: () => ({ requests: 9, budget: null, resetAt: null, mayNotComplete: false }),
    loadDemoGraveyard() {
      demoLoads += 1;
      return loadTestOnlyDemoGraveyard();
    },
  };
}

/** A live-style data result for a detail, with the given provenance. */
export function liveResult(
  detail: RepositoryDetail,
  fetchedAt = REF,
  overrides: Partial<Extract<DataResult<RepositoryDetail>, { ok: true }>> = {},
): DataResult<RepositoryDetail> {
  return {
    ok: true,
    data: detail,
    provenance: { source: 'live', route: 'direct', fetchedAt, stale: false },
    warnings: [],
    rateLimit: NO_REQUESTS,
    ...overrides,
  };
}
