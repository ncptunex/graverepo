// `deriveCondition` (task 4.1, design 4.3; Req 3).
// One condition per condition input. First match wins:
//   archived, empty, last-update-unknown, recently-updated, resting, dormant.
// The date comparisons are made against cutoffs in UTC (O17). The age in months is for display
// only and never chooses the condition.
// The dashboard calls this same function for a tombstone, with `isEmpty: null` (O18).
import { RECENTLY_UPDATED_MONTHS, RESTING_MONTHS } from './config';
import { ageInMonths, isOlderThanMonths } from './dates';
import type { Condition, ConditionInput, Evidence } from './types';

function basedOn(input: ConditionInput): Evidence[] {
  const evidence: Evidence[] = [{ field: 'core.isArchived', value: input.isArchived }];
  // `isEmpty` is listed only when it is known.
  if (input.isEmpty !== null) evidence.push({ field: 'isEmpty', value: input.isEmpty });
  evidence.push({ field: 'core.pushedAt', value: input.pushedAt });
  return evidence;
}

export function deriveCondition(input: ConditionInput, referenceTime: string): Condition {
  const evidence = basedOn(input);
  const hasValidPush = input.pushedAt !== null && !Number.isNaN(Date.parse(input.pushedAt));
  const ageMonths = input.pushedAt !== null && hasValidPush ? ageInMonths(input.pushedAt, referenceTime) : null;
  const make = (id: Condition['id']): Condition => ({ id, kind: 'interpretation', basedOn: evidence, ageMonths });

  if (input.isArchived) return make('archived');
  if (input.isEmpty === true) return make('empty');
  if (input.pushedAt === null || !hasValidPush) return make('last-update-unknown');
  if (!isOlderThanMonths(input.pushedAt, RECENTLY_UPDATED_MONTHS, referenceTime)) return make('recently-updated');
  if (!isOlderThanMonths(input.pushedAt, RESTING_MONTHS, referenceTime)) return make('resting');
  return make('dormant');
}
