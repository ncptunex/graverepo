// `estimateDetailRequests` and the request-budget check (task 9.4, design 3.5; Req 9.10–9.12, 9.15).
// The estimate is the most requests a repository detail could need, worked out from what is
// already known. It sends nothing and is advisory only: it never stops a detail from starting.
import type { SectionSwitches } from '../../../shared/github-endpoints/catalogue';
import { DETAIL_FRESHNESS_MS } from '../../../shared/github-endpoints/catalogue';
import { isFresh } from '../cache/github-cache';
import { repositoryDetailSchema } from '../cache/payload-schemas';
import type { DataLayerContext } from './context';
import { activityWindowStart } from './detail-assembly';
import type { RepositorySummary, Warning } from './types';

/** What the estimate needs to know about the repository. A list summary has all of it. */
export type EstimateInput = Pick<RepositorySummary, 'owner' | 'name' | 'hasIssues' | 'pushedAt'>;

export type DetailEstimate = {
  /** The most requests the detail could send. 0 when a fresh cached copy exists. */
  readonly requests: number;
  /** Requests left in the current window, or null when unknown (no request made yet). */
  readonly budget: number | null;
  readonly resetAt: string | null;
  /** True when the budget is known and smaller than the estimate. */
  readonly mayNotComplete: boolean;
};

export type EstimateOptions = {
  /** A forced refresh ignores a fresh cached copy, so the estimate is not 0. */
  readonly forceRefresh?: boolean;
};

/**
 * The upper bound, ignoring the cache. Counts per design 3.5:
 * core, README and latest commit always; issues unless turned off; branches, CI and the root
 * folder unless their section is switched off; recent authors unless switched off or the last
 * push is outside the window; the manifest's last change unless switched off.
 * The root folder belongs to the manifest section, so switching manifest off removes both.
 */
export function maxDetailRequests(
  repository: Pick<RepositorySummary, 'hasIssues' | 'pushedAt'>,
  switches: SectionSwitches,
  windowStart: string,
): number {
  let total = 3; // core, README, latest commit
  if (repository.hasIssues !== false) total += 1;
  if (switches.branches) total += 1;
  if (switches.ci) total += 1;
  if (switches.manifest) total += 2; // root folder, and the manifest's last change

  if (switches.recentAuthors) {
    const pushed = repository.pushedAt === null ? Number.NaN : Date.parse(repository.pushedAt);
    // An unknown push date can't rule the request out, so it still counts.
    const outsideWindow = !Number.isNaN(pushed) && pushed < Date.parse(windowStart);
    if (!outsideWindow) total += 1;
  }
  return total;
}

/** The `may-not-complete` warning, or null when the budget is unknown or large enough (Req 9.11, 9.12). */
export function mayNotCompleteWarning(
  context: DataLayerContext,
  estimate: number,
): Extract<Warning, { kind: 'may-not-complete' }> | null {
  const { remaining, resetAt } = context.tracker.budget('direct');
  if (remaining === null || remaining >= estimate) return null;
  return { kind: 'may-not-complete', estimate, budget: remaining, resetAt };
}

export function createEstimateDetailRequests(context: DataLayerContext) {
  return function estimateDetailRequests(
    repository: EstimateInput,
    options: EstimateOptions = {},
  ): DetailEstimate {
    const { remaining, resetAt } = context.tracker.budget('direct');

    const cached =
      options.forceRefresh === true
        ? null
        : context.cache.read('detail', `${repository.owner}/${repository.name}`, repositoryDetailSchema);
    const hasFreshCopy =
      cached !== null && isFresh(cached.fetchedAt, context.now().getTime(), DETAIL_FRESHNESS_MS);

    const requests = hasFreshCopy
      ? 0
      : maxDetailRequests(repository, context.switches, activityWindowStart(context.now()));
    return {
      requests,
      budget: remaining,
      resetAt,
      mayNotComplete: remaining !== null && remaining < requests,
    };
  };
}
