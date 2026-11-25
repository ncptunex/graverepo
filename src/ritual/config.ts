// Ritual configuration (task 2.3, design 4.3 and 5.1). The thresholds live here and nowhere else.
// No garden stages, bands or placeholder values: they depend on O12, which is not decided.
import type { PlanRuleId } from './types';

/** Condition thresholds in calendar months (O1, O17). */
export const RECENTLY_UPDATED_MONTHS = 12;
export const RESTING_MONTHS = 24;

/** The "older than" length used by the role rules (latest commit, dependency file). Same as the 12-month threshold. */
export const ROLE_AGE_MONTHS = RECENTLY_UPDATED_MONTHS;

/** The plan rule order (O4). The position in a plan is the order among triggered rules. */
export const PLAN_RULE_ORDER: readonly PlanRuleId[] = [
  'review-archived',
  'add-first-commit',
  'add-readme',
  'review-latest-commit',
  'check-dependencies',
  'check-workflow-run',
  'review-open-issues',
];
