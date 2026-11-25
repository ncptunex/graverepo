// `buildPlan` (tasks 5.1, 5.2; design 5; Req 5).
// A fixed rule table turns actionable findings into plan items. Rules read findings only,
// never the raw detail, and each item copies its finding's evidence.
// - A plan item exists only for an `available`, `actionable` finding, and every such finding
//   gets exactly one item (Req 4.4, 5.5).
// - Items follow the order in `PLAN_RULE_ORDER`. IDs equal rule IDs, so the plan is the same
//   every time for the same findings (Req 5.2).
// - All items are required for MVP (O5).
// The function is pure: no randomness, clock or network.
import { PLAN_RULE_ORDER } from './config';
import type { AnyFinding, Finding, FindingId, Plan, PlanItem, PlanRuleId } from './types';

type RuleDetails = {
  readonly because: PlanItem['because'];
  readonly step: PlanItem['step'];
};

type Rule = {
  readonly id: PlanRuleId;
  readonly findingId: FindingId;
  /** The data for the "because" fact and the step, read from the finding (and, for issues, the oldest-issue finding). */
  readonly details: (finding: AnyFinding, all: readonly AnyFinding[]) => RuleDetails;
};

const NO_DETAILS: RuleDetails = { because: {}, step: {} };

/** The rule table (design 5.1). One rule per actionable finding. */
const RULES: Readonly<Record<PlanRuleId, Rule>> = {
  'review-archived': { id: 'review-archived', findingId: 'archived', details: () => NO_DETAILS },
  'add-first-commit': { id: 'add-first-commit', findingId: 'empty', details: () => NO_DETAILS },
  'add-readme': { id: 'add-readme', findingId: 'readme', details: () => NO_DETAILS },
  'review-latest-commit': {
    id: 'review-latest-commit',
    findingId: 'latest-commit',
    details: (finding) => ({
      because: { date: finding.id === 'latest-commit' && finding.value ? finding.value.date : null },
      step: {},
    }),
  },
  'check-dependencies': {
    id: 'check-dependencies',
    findingId: 'dependency-file',
    details: (finding) => {
      const value = finding.id === 'dependency-file' ? finding.value : null;
      return {
        because: { file: value?.fileName ?? null, date: value?.lastChangedAt ?? null },
        step: { file: value?.fileName ?? null },
      };
    },
  },
  'check-workflow-run': {
    id: 'check-workflow-run',
    findingId: 'ci',
    details: (finding) => {
      const value = finding.id === 'ci' ? finding.value : null;
      const run = value !== null && value.found ? value : null;
      return { because: { conclusion: run?.conclusion ?? null, date: run?.date ?? null }, step: {} };
    },
  },
  'review-open-issues': {
    id: 'review-open-issues',
    findingId: 'open-issues',
    details: (finding, all) => {
      const value = finding.id === 'open-issues' ? finding.value : null;
      const oldest = all.find((other) => other.id === 'oldest-open-issue' && other.state === 'available');
      return {
        because: { count: value?.count ?? null, isLowerBound: value?.isLowerBound ?? null },
        // The step mentions the oldest issue only when the data layer found one.
        step: { startWithOldest: oldest !== undefined },
      };
    },
  },
};

function isActionable(finding: AnyFinding): boolean {
  return finding.state === 'available' && finding.role === 'actionable';
}

export function buildPlan(findings: readonly AnyFinding[]): Plan {
  const items: PlanItem[] = [];
  for (const ruleId of PLAN_RULE_ORDER) {
    const rule = RULES[ruleId];
    const finding = findings.find((candidate) => candidate.id === rule.findingId);
    if (finding === undefined || !isActionable(finding)) continue;
    const { because, step } = rule.details(finding, findings);
    items.push({
      id: rule.id,
      position: items.length,
      findingId: finding.id,
      evidence: finding.evidence,
      derived: (finding as Finding).derived,
      because,
      step,
      required: true,
    });
  }

  return {
    items,
    isArchived: findings.some((finding) => finding.id === 'archived' && finding.state === 'available'),
    unavailableFindingIds: findings.filter((finding) => finding.state === 'unavailable').map((finding) => finding.id),
  };
}
