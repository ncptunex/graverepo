// The capture script strips each response to the fields GRAVEREPO reads (design 4.8).
// These tests check that stripping never changes what an adapter returns, so a field the
// adapters need can't be dropped by mistake. They use the real captured fixtures.
import { describe, expect, it } from 'vitest';
import {
  stripBranches,
  stripCommits,
  stripIssues,
  stripReadme,
  stripRepository,
  stripRootContents,
  stripUser,
  stripWorkflowRuns,
} from '../../scripts/capture-demo/strip';
import { adaptBranches } from '../../src/data/github/adapters/branches';
import {
  adaptLatestCommit,
  adaptManifestLastChange,
  adaptRecentAuthors,
} from '../../src/data/github/adapters/commits';
import { adaptOpenIssues } from '../../src/data/github/adapters/issues';
import { adaptReadme } from '../../src/data/github/adapters/readme';
import { adaptRepository } from '../../src/data/github/adapters/repository';
import { adaptRootContents } from '../../src/data/github/adapters/root-contents';
import { adaptUser } from '../../src/data/github/adapters/user';
import { adaptWorkflowRuns } from '../../src/data/github/adapters/workflow-runs';
import type { HttpResponseLike } from '../../src/data/github/http-response';
import { loadCaptured } from './helpers/fixtures';

function response(status: number, body: unknown): HttpResponseLike {
  return { status, headers: {}, body };
}

/** Runs one adapter on a fixture before and after stripping and compares the results. */
function expectSameAfterStripping(
  fixtureName: string,
  strip: (body: unknown) => unknown,
  adapt: (response: HttpResponseLike) => unknown,
): void {
  const fixture = loadCaptured(fixtureName);
  const stripped = strip(fixture.body);
  expect(adapt(response(fixture.meta.status, stripped))).toEqual(
    adapt(response(fixture.meta.status, fixture.body)),
  );
  expect(JSON.stringify(stripped).length).toBeLessThanOrEqual(JSON.stringify(fixture.body).length);
}

describe('stripping keeps what the adapters read', () => {
  it.each(['user.ncptunex.json', 'user.vitest-dev.json'])('user: %s', (name) => {
    expectSameAfterStripping(name, stripUser, (r) => adaptUser(r.body));
  });

  it.each([
    'repo.atom.atom.json',
    'repo.dubzzz.fast-check.json',
    'repo.zeit.next.js.json',
    'repo.ncptunex.foodstarter.json',
    'repo.ncptunex.Kiroween-2026-GRAVEREPO.json',
    'repo.ncptunex.devops-micro-internship-pravinmishra.json',
  ])('repository: %s', (name) => {
    expectSameAfterStripping(name, stripRepository, (r) => adaptRepository(r.body));
  });

  it.each(['readme.dubzzz.fast-check.json', 'readme.ncptunex.Kiroween-2026-GRAVEREPO.json'])(
    'README: %s',
    (name) => {
      const fixture = loadCaptured(name);
      // A 404 body keeps only its message, as the capture script does.
      const strip = fixture.meta.status === 200 ? stripReadme : (b: unknown) => ({ message: (b as { message?: string }).message });
      expectSameAfterStripping(name, strip, adaptReadme);
    },
  );

  it('latest commit', () => {
    expectSameAfterStripping('commits-latest.dubzzz.fast-check.json', stripCommits, adaptLatestCommit);
  });

  it('recent authors', () => {
    expectSameAfterStripping('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json', stripCommits, (r) =>
      adaptRecentAuthors(r, '2025-11-22T00:00:00.000Z'),
    );
  });

  it('manifest last change', () => {
    expectSameAfterStripping('commits-manifest.ncptunex.foodstarter.json', stripCommits, (r) =>
      adaptManifestLastChange(r, 'package.json'),
    );
  });

  it.each(['issues.dubzzz.fast-check.json', 'issues.ncptunex.Kiroween-2026-GRAVEREPO.json'])(
    'open issues: %s',
    (name) => {
      expectSameAfterStripping(name, stripIssues, (r) => adaptOpenIssues(r, 'https://github.com/example/example'));
    },
  );

  it.each(['branches.dubzzz.fast-check.json', 'branches.ncptunex.Kiroween-2026-GRAVEREPO.json'])(
    'branches: %s',
    (name) => {
      expectSameAfterStripping(name, stripBranches, adaptBranches);
    },
  );

  it.each([
    'workflow-runs.dubzzz.fast-check.json',
    'workflow-runs.ncptunex.foodstarter.json',
    'workflow-runs.ncptunex.Kiroween-2026-GRAVEREPO.json',
  ])('workflow runs: %s', (name) => {
    expectSameAfterStripping(name, stripWorkflowRuns, adaptWorkflowRuns);
  });

  it('root folder listing', () => {
    expectSameAfterStripping('root-contents.ncptunex.foodstarter.json', stripRootContents, adaptRootContents);
  });
});

describe('stripping size and safety', () => {
  it('makes the large issues response much smaller', () => {
    const fixture = loadCaptured('issues.dubzzz.fast-check.json');
    const stripped = JSON.stringify(stripIssues(fixture.body));
    expect(stripped.length).toBeLessThan(JSON.stringify(fixture.body).length / 10);
  });

  it('never keeps an email field or a commit signature', () => {
    const fixture = loadCaptured('commits-latest.dubzzz.fast-check.json');
    const text = JSON.stringify(stripCommits(fixture.body));
    expect(text).not.toMatch(/email|signature|verification/i);
  });

  it('turns a body of the wrong shape into an empty or null value instead of throwing', () => {
    expect(stripCommits('not a list')).toBeNull();
    expect(stripUser(null)).toEqual({});
    expect(stripWorkflowRuns(42)).toEqual({});
  });
});
