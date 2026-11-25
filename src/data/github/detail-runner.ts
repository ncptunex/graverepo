// The three-step repository detail runner (task 9.5, design 3.2 and 3.5; Req 4.2–4.11, 4.13, 4.14, 9.13, 9.14).
//
// Step 1: core metadata, alone. If it fails, the error is returned and nothing else is sent.
// Step 2: the independent sections, at most 4 requests at a time.
// Step 3: the dependent sections (recent authors, manifest last change), only when needed.
//
// Rules applied here:
// - Skip rules: issues are not requested when core says they are turned off; recent authors
//   only when the latest commit is inside the 12-month window; the manifest commit only when
//   the root folder has a known manifest. These come from `detail-assembly`, which the demo
//   capture also uses, so live and demo details follow the same rules.
// - Section switches: a switched-off optional section sends no request and is reported as
//   `not-applicable: section-disabled`.
// - Budget: before every request after core, the runner re-reads the budget the rate-limit
//   tracker updated from the last response. At 0, or while a primary limit blocks the route,
//   it stops. Sections not yet requested become `unavailable: rate-limited`, and the sections
//   already received are kept.
// It never throws, and never sends more than 9 requests.
import { makeError, type DataError, type ErrorKind } from './errors/error-kinds';
import { classifyResponse } from './errors/classify-response';
import { adaptRepository } from './adapters/repository';
import { sendRequest, type DataLayerContext } from './context';
import {
  activityWindowStart,
  assembleDetail,
  planDependentRequests,
} from './detail-assembly';
import type { HttpResponseLike } from './http-response';
import type { Route } from './transport/types';
import type { RepositoryDetail, RepositorySections } from './types';

/** The most requests running at once (Req 4.4). */
export const MAX_CONCURRENT_REQUESTS = 4;

/** Stands in for a response that was not received. Every adapter turns it into `unavailable`. */
const NOT_RECEIVED: HttpResponseLike = { status: 0, headers: {}, body: null, bodyParseFailed: true };

type RequestKey =
  | 'readme'
  | 'latestCommit'
  | 'issues'
  | 'branches'
  | 'ci'
  | 'rootContents'
  | 'recentAuthors'
  | 'manifestCommit';

export type DetailRun =
  | {
      readonly ok: true;
      readonly detail: RepositoryDetail;
      /** When GitHub was contacted for the core metadata. */
      readonly fetchedAt: string;
      readonly route: Route;
    }
  | { readonly ok: false; readonly error: DataError };

/** Runs async tasks in order with at most `limit` running at once. */
async function runLimited(tasks: readonly (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      if (task) await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

function withUnavailable(sections: RepositorySections, key: keyof RepositorySections, reason: ErrorKind): RepositorySections {
  return { ...sections, [key]: { status: 'unavailable', reason } };
}

function withDisabled(sections: RepositorySections, key: keyof RepositorySections): RepositorySections {
  return { ...sections, [key]: { status: 'not-applicable', reason: 'section-disabled' } };
}

export async function runDetail(
  context: DataLayerContext,
  requestedOwner: string,
  requestedRepo: string,
): Promise<DetailRun> {
  const windowStart = activityWindowStart(context.now());

  // Step 1: core metadata.
  const coreSent = await sendRequest(context, 'repo', { owner: requestedOwner, repo: requestedRepo });
  if (!coreSent.ok) return { ok: false, error: coreSent.error };
  const coreError = classifyResponse('repo', coreSent.response);
  if (coreError !== null) {
    const withName =
      coreError.kind === 'repo-not-found'
        ? makeError(coreError.kind, { ...coreError.details, repository: `${requestedOwner}/${requestedRepo}` })
        : coreError;
    return { ok: false, error: withName };
  }
  const core = adaptRepository(coreSent.response.body);
  if (!core.ok) return { ok: false, error: core.error };

  // From here on the official name is used, not the requested one (Req 6.10).
  const path = { owner: core.value.owner, repo: core.value.name };
  const hasIssues = core.value.hasIssues !== false;
  const { switches } = context;

  const received = new Map<RequestKey, HttpResponseLike>();
  const failed = new Map<RequestKey, ErrorKind>();

  /** True once the budget is 0 or a primary limit blocks the route (Req 9.14). */
  function mustStop(): DataError | null {
    const blocked = context.tracker.blockedError('direct');
    if (blocked !== null) return blocked;
    const { remaining, resetAt } = context.tracker.budget('direct');
    return remaining === 0 ? makeError('rate-limited', { limitType: 'primary', resetAt }) : null;
  }

  /** One section request. The budget is read just before it is sent. */
  function section(
    key: RequestKey,
    endpointId: Parameters<typeof sendRequest>[1],
    query?: Parameters<typeof sendRequest>[3],
  ): () => Promise<void> {
    return async () => {
      const stop = mustStop();
      if (stop !== null) {
        failed.set(key, 'rate-limited');
        return;
      }
      const sent = await sendRequest(context, endpointId, path, query);
      if (sent.ok) received.set(key, sent.response);
      else failed.set(key, sent.error.kind);
    };
  }

  // Step 2: independent sections, at most 4 at a time.
  const step2: (() => Promise<void>)[] = [
    section('readme', 'readme'),
    section('latestCommit', 'commits', { per_page: 1 }),
  ];
  if (hasIssues) {
    step2.push(section('issues', 'issues', { state: 'open', sort: 'created', direction: 'asc', per_page: 100 }));
  }
  if (switches.branches) step2.push(section('branches', 'branches', { per_page: 100 }));
  if (switches.ci) step2.push(section('ci', 'workflow-runs', { per_page: 1 }));
  if (switches.manifest) step2.push(section('rootContents', 'root-contents'));
  await runLimited(step2, MAX_CONCURRENT_REQUESTS);

  // Step 3: dependent sections, decided from the step 2 responses.
  const plan = planDependentRequests(
    {
      latestCommit: received.get('latestCommit') ?? NOT_RECEIVED,
      rootContents: received.get('rootContents') ?? NOT_RECEIVED,
    },
    windowStart,
  );
  const step3: (() => Promise<void>)[] = [];
  if (switches.recentAuthors && plan.needsRecentAuthors) {
    step3.push(section('recentAuthors', 'commits', { since: windowStart, per_page: 100 }));
  }
  if (switches.manifest && plan.manifestFileName !== null) {
    step3.push(section('manifestCommit', 'commits', { path: plan.manifestFileName, per_page: 1 }));
  }
  await runLimited(step3, MAX_CONCURRENT_REQUESTS);

  const get = (key: RequestKey): HttpResponseLike => received.get(key) ?? NOT_RECEIVED;
  const assembled = assembleDetail(
    {
      repo: coreSent.response,
      readme: get('readme'),
      latestCommit: get('latestCommit'),
      issues: hasIssues ? get('issues') : null,
      branches: get('branches'),
      ci: get('ci'),
      rootContents: get('rootContents'),
      recentAuthors: received.get('recentAuthors') ?? null,
      manifestCommit: received.get('manifestCommit') ?? null,
    },
    windowStart,
    `${requestedOwner}/${requestedRepo}`,
  );
  if (!assembled.ok) return { ok: false, error: assembled.error };

  // Replace the placeholder results with the real reason a request did not produce data.
  let sections = assembled.value.sections;
  const reasonOf = (...keys: RequestKey[]): ErrorKind | undefined => {
    for (const key of keys) {
      const reason = failed.get(key);
      if (reason !== undefined) return reason;
    }
    return undefined;
  };
  const failures: [keyof RepositorySections, ErrorKind | undefined][] = [
    ['readme', reasonOf('readme')],
    ['latestCommit', reasonOf('latestCommit')],
    ['openIssues', reasonOf('issues')],
    ['branches', reasonOf('branches')],
    ['ci', reasonOf('ci')],
    // Recent authors need the latest commit, and the manifest needs the root folder.
    ['recentAuthors', reasonOf('recentAuthors', 'latestCommit')],
    ['manifest', reasonOf('manifestCommit', 'rootContents')],
  ];
  for (const [key, reason] of failures) {
    if (reason !== undefined) sections = withUnavailable(sections, key, reason);
  }

  // A switched-off section sends no request and says so (Req 4.14).
  if (!switches.branches) sections = withDisabled(sections, 'branches');
  if (!switches.ci) sections = withDisabled(sections, 'ci');
  if (!switches.recentAuthors) sections = withDisabled(sections, 'recentAuthors');
  if (!switches.manifest) sections = withDisabled(sections, 'manifest');

  return {
    ok: true,
    detail: { ...assembled.value, sections },
    fetchedAt: coreSent.raw.fetchedAt,
    route: coreSent.raw.rateLimit.route,
  };
}
