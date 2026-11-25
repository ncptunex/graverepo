// `getRepositoryDetail` (task 9.6, design 3.2 and 4.1; Req 4, 6.3, 6.10, 6.11, 9.11, 9.15, 10.2).
// Wraps the three-step runner with the cache, one provenance for the whole detail, the
// official-name cache key, and the advisory `may-not-complete` warning.
import { DETAIL_FRESHNESS_MS } from '../../../shared/github-endpoints/catalogue';
import { isValidRepositoryName, isValidUsername } from '../../../shared/github-endpoints/validators';
import type { FetchOutcome } from '../cache/cached-fetch';
import { repositoryDetailSchema } from '../cache/payload-schemas';
import { failure, guard, type DataLayerContext } from './context';
import { activityWindowStart } from './detail-assembly';
import { mayNotCompleteWarning, maxDetailRequests, type EstimateInput } from './detail-estimate';
import { runDetail } from './detail-runner';
import { makeError } from './errors/error-kinds';
import type { LookupOptions } from './lookup-user';
import type { DataResult, RepositoryDetail, Warning } from './types';

export type DetailOptions = LookupOptions & {
  /**
   * The repository's summary from the list, when the caller has it. It lets the budget check
   * use the issues setting and the last push date. Without it, the check assumes the largest case.
   */
  readonly summary?: EstimateInput;
};

/** A detail is cached only when every section was answered, so a rate-limited section isn't kept for 30 minutes (Req 7.1). */
function isComplete(detail: RepositoryDetail): boolean {
  return Object.values(detail.sections).every((section) => section.status !== 'unavailable');
}

async function fetchDetail(
  context: DataLayerContext,
  owner: string,
  repo: string,
  summary: EstimateInput | undefined,
): Promise<FetchOutcome<RepositoryDetail>> {
  // The budget check happens once, when the detail starts. It never blocks (Req 9.15).
  const known = summary ?? { hasIssues: null, pushedAt: null };
  const estimate = maxDetailRequests(known, context.switches, activityWindowStart(context.now()));
  const warnings: Warning[] = [];
  const budgetWarning = mayNotCompleteWarning(context, estimate);
  if (budgetWarning !== null) warnings.push(budgetWarning);

  const run = await runDetail(context, owner, repo);
  if (!run.ok) return { ok: false, error: run.error };

  const complete = isComplete(run.detail);
  // The entry is also stored under the official name, so opening the repository by its new
  // name finds it without a request (Req 6.10). That entry has no `renamedFrom`.
  if (complete && run.detail.renamedFrom !== null) {
    context.cache.write(
      'detail',
      run.detail.core.fullName,
      { ...run.detail, renamedFrom: null },
      run.fetchedAt,
      run.route,
    );
  }
  return { ok: true, data: run.detail, fetchedAt: run.fetchedAt, route: run.route, warnings, cacheable: complete };
}

export function createGetRepositoryDetail(context: DataLayerContext) {
  return function getRepositoryDetail(
    owner: string,
    repo: string,
    options: DetailOptions = {},
  ): Promise<DataResult<RepositoryDetail>> {
    return guard(context, async () => {
      const ownerName = typeof owner === 'string' ? owner.trim() : '';
      const repoName = typeof repo === 'string' ? repo.trim() : '';
      // A name that can't exist on GitHub is reported without a request.
      if (!isValidUsername(ownerName)) {
        return failure(context, makeError('invalid-username', { username: ownerName }));
      }
      if (!isValidRepositoryName(repoName)) {
        return failure(context, makeError('repo-not-found', { repository: `${ownerName}/${repoName}` }));
      }

      return context.fetcher.fetch({
        dataType: 'detail',
        id: `${ownerName}/${repoName}`,
        schema: repositoryDetailSchema,
        freshnessMs: DETAIL_FRESHNESS_MS,
        forceRefresh: options.forceRefresh,
        signal: options.signal,
        fetcher: () => fetchDetail(context, ownerName, repoName, options.summary),
      });
    });
  };
}
