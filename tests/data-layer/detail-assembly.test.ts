// Rules shared by the demo capture and the demo loader (design 3.2 steps 2 and 3).
import { describe, expect, it } from 'vitest';
import {
  activityWindowStart,
  assembleDetail,
  planDependentRequests,
  type DetailResponses,
} from '../../src/data/github/detail-assembly';
import type { HttpResponseLike } from '../../src/data/github/http-response';
import { capturedResponse, constructedResponse } from './helpers/fixtures';

const NOW = new Date('2026-11-22T13:00:00.000Z');
const WINDOW_START = activityWindowStart(NOW);

function responses(overrides: Partial<DetailResponses> = {}): DetailResponses {
  return {
    repo: capturedResponse('repo.ncptunex.foodstarter.json'),
    readme: capturedResponse('readme.dubzzz.fast-check.json'),
    latestCommit: capturedResponse('commits-latest.dubzzz.fast-check.json'),
    issues: capturedResponse('issues.ncptunex.Kiroween-2026-GRAVEREPO.json'),
    branches: capturedResponse('branches.ncptunex.Kiroween-2026-GRAVEREPO.json'),
    ci: capturedResponse('workflow-runs.ncptunex.foodstarter.json'),
    rootContents: capturedResponse('root-contents.ncptunex.foodstarter.json'),
    recentAuthors: capturedResponse('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json'),
    manifestCommit: capturedResponse('commits-manifest.ncptunex.foodstarter.json'),
    ...overrides,
  };
}

describe('activityWindowStart', () => {
  it('is 12 calendar months before the given time, in UTC', () => {
    expect(WINDOW_START).toBe('2025-11-22T13:00:00.000Z');
  });
});

describe('planDependentRequests', () => {
  it('asks for recent authors when the latest commit is inside the window', () => {
    expect(planDependentRequests(responses(), WINDOW_START).needsRecentAuthors).toBe(true);
  });

  it('skips recent authors when the latest commit is outside the window', () => {
    const plan = planDependentRequests(responses(), activityWindowStart(new Date('2030-01-01T00:00:00Z')));
    expect(plan.needsRecentAuthors).toBe(false);
  });

  it('asks for the manifest commit only when the root folder has a known manifest', () => {
    expect(planDependentRequests(responses(), WINDOW_START).manifestFileName).toBe('package.json');
    const noRoot: HttpResponseLike = { status: 200, headers: {}, body: [{ name: 'README.md', type: 'file' }] };
    expect(planDependentRequests(responses({ rootContents: noRoot }), WINDOW_START).manifestFileName).toBeNull();
  });
});

describe('assembleDetail', () => {
  it('combines every section from real responses', () => {
    const result = assembleDetail(responses(), WINDOW_START);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.core.fullName).toBe('ncptunex/foodstarter');
    expect(result.value.isEmpty).toBe(false);
    expect(result.value.sections.manifest).toMatchObject({ status: 'available', value: { fileName: 'package.json' } });
    expect(result.value.sections.recentAuthors.status).toBe('available');
  });

  it('reports issues as not applicable, without a response, when GitHub says they are turned off', () => {
    const result = assembleDetail(
      responses({ repo: capturedResponse('repo.ncptunex.devops-micro-internship-pravinmishra.json'), issues: null }),
      WINDOW_START,
    );
    expect(result.ok && result.value.sections.openIssues).toEqual({ status: 'not-applicable', reason: 'issues-disabled' });
  });

  it('reports zero recent authors without a request when the latest commit is outside the window', () => {
    const result = assembleDetail(responses({ recentAuthors: null }), activityWindowStart(new Date('2030-01-01T00:00:00Z')));
    expect(result.ok && result.value.sections.recentAuthors).toMatchObject({
      status: 'available',
      value: { authorCount: 0, commitsRead: 0 },
    });
  });

  it('marks a section unavailable when a needed response is missing', () => {
    const result = assembleDetail(responses({ recentAuthors: null }), WINDOW_START);
    expect(result.ok && result.value.sections.recentAuthors).toEqual({
      status: 'unavailable',
      reason: 'unexpected-response',
    });
  });

  it('treats an empty repository as empty and its commit sections as not applicable', () => {
    const result = assembleDetail(
      responses({
        latestCommit: constructedResponse('empty-repo-commits-409.json'),
        rootContents: constructedResponse('empty-repo-contents-404.json'),
        recentAuthors: null,
        manifestCommit: null,
      }),
      WINDOW_START,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isEmpty).toBe(true);
    expect(result.value.sections.recentAuthors).toEqual({ status: 'not-applicable', reason: 'empty-repository' });
    expect(result.value.sections.manifest).toEqual({ status: 'not-applicable', reason: 'empty-repository' });
  });

  it('records the requested name when GitHub reports a different official name', () => {
    const result = assembleDetail(responses(), WINDOW_START, 'someone/old-name');
    expect(result.ok && result.value.renamedFrom).toBe('someone/old-name');
  });

  it('returns the core error instead of a detail when the core response fails', () => {
    const result = assembleDetail(responses({ repo: constructedResponse('repo-not-found-404.json') }), WINDOW_START);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('repo-not-found');
  });
});
