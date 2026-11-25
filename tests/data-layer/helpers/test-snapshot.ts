// A small snapshot for TESTS ONLY, built from the real captured fixtures.
// It is never the demo snapshot and never reaches the app. It lets the loader and the capture
// script be tested before (and apart from) the real demo capture.
//
// The responses are real, but they are mixed across repositories where no fixture exists for
// one repository (for example, one repository's README with another's commits). So the tests
// that use it check structure and rules, never what a repository "really" looks like.
import {
  stripBranches,
  stripCommits,
  stripIssues,
  stripReadme,
  stripRepository,
  stripRootContents,
  stripUser,
  stripWorkflowRuns,
} from '../../../scripts/capture-demo/strip';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type DemoSnapshot,
  type StoredResponse,
} from '../../../src/data/demo/snapshot-schema';
import { loadCaptured } from './fixtures';

type Strip = (body: unknown) => unknown;

function stored(fixtureName: string, strip: Strip): StoredResponse {
  const fixture = loadCaptured(fixtureName);
  // A 404 or 409 keeps only the message, as the capture script does.
  const body =
    fixture.meta.status === 200
      ? strip(fixture.body)
      : { message: (fixture.body as { message?: string }).message };
  return { status: fixture.meta.status, body };
}

export const TEST_CAPTURED_AT = '2026-11-22T13:00:00.000Z';

export function makeTestSnapshot(): DemoSnapshot {
  const shared = {
    branches: stored('branches.ncptunex.Kiroween-2026-GRAVEREPO.json', stripBranches),
    rootContents: stored('root-contents.ncptunex.foodstarter.json', stripRootContents),
    recentAuthors: stored('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json', stripCommits),
    manifestCommit: stored('commits-manifest.ncptunex.foodstarter.json', stripCommits),
    issues: stored('issues.ncptunex.Kiroween-2026-GRAVEREPO.json', stripIssues),
  };
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    capturedAt: TEST_CAPTURED_AT,
    captureScriptVersion: 'test',
    apiVersion: '2026-03-10',
    sourceAccounts: ['ncptunex'],
    curatedRepositories: ['ncptunex/Kiroween-2026-GRAVEREPO', 'ncptunex/foodstarter'],
    users: { ncptunex: stored('user.ncptunex.json', stripUser) },
    repositories: [
      {
        fullName: 'ncptunex/Kiroween-2026-GRAVEREPO',
        responses: {
          ...shared,
          repo: stored('repo.ncptunex.Kiroween-2026-GRAVEREPO.json', stripRepository),
          readme: stored('readme.ncptunex.Kiroween-2026-GRAVEREPO.json', stripReadme),
          latestCommit: stored('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json', stripCommits),
          ci: stored('workflow-runs.ncptunex.Kiroween-2026-GRAVEREPO.json', stripWorkflowRuns),
        },
      },
      {
        fullName: 'ncptunex/foodstarter',
        responses: {
          ...shared,
          repo: stored('repo.ncptunex.foodstarter.json', stripRepository),
          readme: stored('readme.dubzzz.fast-check.json', stripReadme),
          latestCommit: stored('commits-latest.dubzzz.fast-check.json', stripCommits),
          ci: stored('workflow-runs.ncptunex.foodstarter.json', stripWorkflowRuns),
        },
      },
    ],
  };
}
