// Builds a repository detail from the raw responses of its requests (design 3.2, 5.7).
// It holds the rules that decide which dependent requests are needed and how the section
// results combine, so the demo capture script and the demo loader apply exactly the same rules.
// It sends no requests and never throws.
//
// Task 9.5 (the live detail runner) can reuse these functions for the same rules.
import type { KnownManifest } from '../../../shared/github-endpoints/catalogue';
import { adaptBranches } from './adapters/branches';
import {
  adaptLatestCommit,
  adaptManifestLastChange,
  adaptRecentAuthors,
  manifestNotFound,
  recentAuthorsSkipped,
} from './adapters/commits';
import { adaptOpenIssues } from './adapters/issues';
import { adaptReadme } from './adapters/readme';
import { adaptRepository } from './adapters/repository';
import { adaptRootContents } from './adapters/root-contents';
import { adaptWorkflowRuns } from './adapters/workflow-runs';
import { adapted, type AdapterResult } from './adapters/adapter-result';
import { classifyResponse } from './errors/classify-response';
import type { HttpResponseLike } from './http-response';
import type {
  FieldResult,
  ManifestValue,
  RecentAuthorsValue,
  RepositoryDetail,
  RepositorySections,
} from './types';

/** The raw responses behind one repository detail. `null` means the request was not needed. */
export type DetailResponses = {
  readonly repo: HttpResponseLike;
  readonly readme: HttpResponseLike;
  readonly latestCommit: HttpResponseLike;
  /** `null` only when core says issues are turned off (Req 4.5). */
  readonly issues: HttpResponseLike | null;
  readonly branches: HttpResponseLike;
  readonly ci: HttpResponseLike;
  readonly rootContents: HttpResponseLike;
  /** `null` when the latest commit is outside the activity window or the repository is empty. */
  readonly recentAuthors: HttpResponseLike | null;
  /** `null` when the root folder has no known manifest or the repository is empty. */
  readonly manifestCommit: HttpResponseLike | null;
};

/** Start of the 12-month activity window (D15), counted in calendar months in UTC. */
export function activityWindowStart(now: Date): string {
  const start = new Date(now.getTime());
  start.setUTCMonth(start.getUTCMonth() - 12);
  return start.toISOString();
}

export type DependentRequestPlan = {
  /** Whether `commits?since=` is needed (design 3.2 step 3). */
  readonly needsRecentAuthors: boolean;
  /** The manifest whose last change is needed, or null. */
  readonly manifestFileName: KnownManifest | null;
};

/** Decides step 3 of the detail runner from the step 2 responses. */
export function planDependentRequests(
  responses: Pick<DetailResponses, 'latestCommit' | 'rootContents'>,
  windowStart: string,
): DependentRequestPlan {
  const latest = adaptLatestCommit(responses.latestCommit);
  const needsRecentAuthors =
    latest.status === 'available' && Date.parse(latest.value.date) >= Date.parse(windowStart);

  const root = adaptRootContents(responses.rootContents);
  const manifestFileName = root.status === 'available' ? root.value.manifestFileName : null;
  return { needsRecentAuthors, manifestFileName };
}

function missingResponse<T>(): FieldResult<T> {
  return { status: 'unavailable', reason: 'unexpected-response' };
}

/** Combines the section responses into one detail. A failing core response is an error. */
export function assembleDetail(
  responses: DetailResponses,
  windowStart: string,
  requestedFullName: string | null = null,
): AdapterResult<RepositoryDetail> {
  const coreError = classifyResponse('repo', responses.repo);
  if (coreError !== null) return { ok: false, error: coreError };
  const core = adaptRepository(responses.repo.body);
  if (!core.ok) return core;
  const summary = core.value;

  const latestCommit = adaptLatestCommit(responses.latestCommit);
  const isEmpty =
    latestCommit.status === 'not-applicable' && latestCommit.reason === 'empty-repository';

  let openIssues: RepositorySections['openIssues'];
  if (summary.hasIssues === false) {
    openIssues = { status: 'not-applicable', reason: 'issues-disabled' };
  } else if (responses.issues === null) {
    openIssues = missingResponse();
  } else {
    openIssues = adaptOpenIssues(responses.issues, summary.url);
  }

  let recentAuthors: FieldResult<RecentAuthorsValue>;
  if (latestCommit.status !== 'available') {
    recentAuthors =
      latestCommit.status === 'not-applicable'
        ? { status: 'not-applicable', reason: latestCommit.reason }
        : { status: 'unavailable', reason: latestCommit.reason };
  } else if (Date.parse(latestCommit.value.date) < Date.parse(windowStart)) {
    recentAuthors = recentAuthorsSkipped(windowStart);
  } else if (responses.recentAuthors === null) {
    recentAuthors = missingResponse();
  } else {
    recentAuthors = adaptRecentAuthors(responses.recentAuthors, windowStart);
  }

  const root = adaptRootContents(responses.rootContents);
  let manifest: FieldResult<ManifestValue>;
  if (root.status !== 'available') {
    manifest =
      root.status === 'not-applicable'
        ? { status: 'not-applicable', reason: root.reason }
        : { status: 'unavailable', reason: root.reason };
  } else if (root.value.manifestFileName === null) {
    manifest = manifestNotFound();
  } else if (responses.manifestCommit === null) {
    manifest = missingResponse();
  } else {
    manifest = adaptManifestLastChange(responses.manifestCommit, root.value.manifestFileName);
  }

  const renamed =
    requestedFullName !== null &&
    requestedFullName.toLowerCase() !== summary.fullName.toLowerCase();

  return adapted({
    core: summary,
    renamedFrom: renamed ? requestedFullName : null,
    isEmpty,
    sections: {
      readme: adaptReadme(responses.readme),
      latestCommit,
      recentAuthors,
      openIssues,
      branches: adaptBranches(responses.branches),
      ci: adaptWorkflowRuns(responses.ci),
      manifest,
    },
  });
}
