// Progress and revive logic (task 6.1, design 6; Req 6, 7.1, 7.4).
// Progress counts the visitor's ticks only. It never reads anything about GitHub.
// All functions are pure.
import type { Plan, ProgressSource, RevivedRecord, RitualProgress } from './types';
import type { RepositorySummary } from '../data/github/types';

function requiredIds(plan: Plan): string[] {
  return plan.items.filter((item) => item.required).map((item) => item.id);
}

/** The saved IDs that exist in the plan. Others stay in storage but are not counted (Req 6.6). */
export function reconcileTicks(plan: Plan, tickedIds: readonly string[]): string[] {
  const inPlan = new Set<string>(plan.items.map((item) => item.id));
  return [...new Set(tickedIds)].filter((id) => inPlan.has(id));
}

/** Unticked required items. */
export function remainingSteps(plan: Plan, tickedIds: readonly string[]): number {
  const ticked = new Set(tickedIds);
  return requiredIds(plan).filter((id) => !ticked.has(id)).length;
}

/**
 * `floor(100 × ticked required items that exist in the plan ÷ required items)`, a whole number
 * from 0 to 100, or `null` when the plan has no required items (Req 6.2–6.4).
 */
export function progressPercent(plan: Plan, tickedIds: readonly string[]): number | null {
  const required = requiredIds(plan);
  if (required.length === 0) return null;
  const done = required.length - remainingSteps(plan, tickedIds);
  return Math.floor((100 * done) / required.length);
}

/** True when not yet revived and every required item is ticked, or none are required (Req 7.1). */
export function canMarkRevived(plan: Plan, progress: Pick<RitualProgress, 'revived' | 'tickedItemIds'>): boolean {
  return progress.revived === null && remainingSteps(plan, progress.tickedItemIds) === 0;
}

/**
 * The small record written when the visitor marks a repository as revived (Req 7.4).
 * It holds only the allowed fields: no email and no other GitHub data.
 * `evidenceFetchedAt` is the reference time the plan was built from.
 */
export function buildRevivedRecord(input: {
  readonly core: Pick<RepositorySummary, 'owner' | 'name' | 'url' | 'isArchived'>;
  readonly plan: Plan;
  readonly source: ProgressSource;
  readonly evidenceFetchedAt: string;
  readonly revivedAt: string;
}): RevivedRecord {
  return {
    owner: input.core.owner,
    repo: input.core.name,
    url: input.core.url,
    wasArchived: input.core.isArchived,
    source: input.source,
    evidenceFetchedAt: input.evidenceFetchedAt,
    requiredCount: requiredIds(input.plan).length,
    revivedAt: input.revivedAt,
  };
}
