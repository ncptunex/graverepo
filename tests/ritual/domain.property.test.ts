// Property tests for the ritual domain (task 7.1 and 7.2; design 9.3: P1, P2, P3, P4, P5, P6, P8, P9, P12).
// Inputs are random test builders, never GitHub data.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyseRepository } from '../../src/ritual';
import { PLAN_RULE_ORDER } from '../../src/ritual/config';
import { canMarkRevived, progressPercent, reconcileTicks } from '../../src/ritual/progress';
import type { Evidence, FindingId, Plan } from '../../src/ritual/types';
import type { RepositoryDetail } from '../../src/data/github/types';
import { arbCase } from './builders';

const RUNS = { numRuns: 200 };

/** Resolves an evidence field name against the detail, so a test can check it really exists. */
function resolve(detail: RepositoryDetail, field: string): { found: boolean; value: unknown } {
  const parts = field.split('.');
  let current: unknown = detail;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}

const SECTION_FINDING: Readonly<Record<string, FindingId>> = {
  latestCommit: 'latest-commit',
  readme: 'readme',
  openIssues: 'open-issues',
  recentAuthors: 'recent-authors',
  branches: 'branches',
  ci: 'ci',
  manifest: 'dependency-file',
};

describe('P1: determinism', () => {
  it('building the necropsy twice gives deeply equal results, and does not change the input', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const before = structuredClone(detail);
        const first = analyseRepository(detail, reference);
        const second = analyseRepository(structuredClone(detail), reference);
        expect(second).toEqual(first);
        expect(detail).toEqual(before);
      }),
      RUNS,
    );
  });
});

describe('P2: unknown stays unknown', () => {
  it('a section or field that is unavailable, null or not applicable never gives an available finding or a plan item', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const { findings, plan } = analyseRepository(detail, reference);
        const find = (id: FindingId) => findings.find((finding) => finding.id === id);

        for (const [section, findingId] of Object.entries(SECTION_FINDING)) {
          const result = detail.sections[section as keyof typeof detail.sections];
          const finding = find(findingId);
          if (result.status === 'available') continue;
          // Unavailable and not-applicable sections are never an available finding. A finding
          // may be missing only for a switched-off optional section.
          if (finding !== undefined) expect(finding.state).not.toBe('available');
          expect(plan.items.some((item) => item.findingId === findingId)).toBe(false);
        }
        if (detail.core.pushedAt === null) expect(find('last-update')?.state).toBe('unavailable');

        for (const finding of findings) {
          if (finding.state !== 'available') {
            expect(finding.value).toBeNull();
            expect(finding.role).toBe('informational');
          }
        }
      }),
      RUNS,
    );
  });
});

describe('P3: traceability', () => {
  it('every finding has evidence that exists in the input and equals it, and plan items copy their finding evidence', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const { findings, plan } = analyseRepository(detail, reference);
        const knownFields = new Set<string>();
        for (const finding of findings) {
          expect(finding.evidence.length).toBeGreaterThan(0);
          for (const evidence of finding.evidence as readonly Evidence[]) {
            const resolved = resolve(detail, evidence.field);
            expect(resolved.found).toBe(true);
            expect(resolved.value).toEqual(evidence.value);
            knownFields.add(evidence.field);
          }
          // Derived values are listed apart from evidence and say what they come from.
          for (const derived of finding.derived) {
            expect(derived.computedFrom.length).toBeGreaterThan(0);
            for (const field of derived.computedFrom) expect(resolve(detail, field).found).toBe(true);
            expect((finding.evidence as readonly Evidence[]).some((evidence) => evidence.field === derived.name)).toBe(false);
          }
        }
        for (const item of plan.items) {
          const finding = findings.find((candidate) => candidate.id === item.findingId);
          expect(finding?.state).toBe('available');
          expect(finding?.role).toBe('actionable');
          expect(item.evidence).toEqual(finding?.evidence);
          expect(item.derived).toEqual(finding?.derived);
        }
      }),
      RUNS,
    );
  });
});

describe('P4: actionable mapping', () => {
  it('actionable findings and plan items map one to one, and every non-actionable finding says why', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const { findings, plan } = analyseRepository(detail, reference);
        const actionable = findings.filter((finding) => finding.role === 'actionable');
        for (const finding of actionable) expect(finding.state).toBe('available');

        expect(plan.items.map((item) => item.findingId).sort()).toEqual(actionable.map((finding) => finding.id).sort());
        expect(new Set(plan.items.map((item) => item.findingId)).size).toBe(plan.items.length);

        for (const finding of findings) {
          if (finding.role === 'informational') expect(finding.informationalReason).not.toBeNull();
          if (finding.state === 'unavailable') expect(finding.informationalReason).toBe('unavailable');
          if (finding.state === 'not-applicable') expect(finding.informationalReason).toBe('not-applicable');
        }
      }),
      RUNS,
    );
  });
});

describe('P12: plan structure', () => {
  it('IDs are unique, positions run 0..n-1, and the order follows the rule table', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const { plan } = analyseRepository(detail, reference);
        const ids = plan.items.map((item) => item.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(plan.items.map((item) => item.position)).toEqual(ids.map((_id, index) => index));
        const order = ids.map((id) => PLAN_RULE_ORDER.indexOf(id));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(order.every((index) => index >= 0)).toBe(true);
        expect(plan.items.every((item) => item.required)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('P8: archived is never active', () => {
  it('an archived repository is `archived`, its plan starts with review-archived, and it is flagged suggestions-only', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const archived: RepositoryDetail = { ...detail, core: { ...detail.core, isArchived: true } };
        const result = analyseRepository(archived, reference);
        expect(result.condition.id).toBe('archived');
        expect(result.plan.isArchived).toBe(true);
        expect(result.plan.items[0]?.id).toBe('review-archived');
        expect(result.findings.some((finding) => finding.id === 'archived' && finding.state === 'available')).toBe(true);
      }),
      RUNS,
    );
  });

  it('a repository that is not archived never gets the archived condition, finding or note', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const open: RepositoryDetail = { ...detail, core: { ...detail.core, isArchived: false } };
        const result = analyseRepository(open, reference);
        expect(result.condition.id).not.toBe('archived');
        expect(result.plan.isArchived).toBe(false);
        expect(result.findings.some((finding) => finding.id === 'archived')).toBe(false);
      }),
      RUNS,
    );
  });
});

/** A plan, and a ticked set drawn from its item IDs plus unknown IDs. */
const arbPlanAndTicks = arbCase.chain(({ reference, detail }) => {
  const plan: Plan = analyseRepository(detail, reference).plan;
  const ids = [...plan.items.map((item) => item.id), 'unknown-1', 'unknown-2'];
  return fc.record({
    plan: fc.constant(plan),
    ticked: fc.subarray(ids),
    extra: fc.subarray(ids),
  });
});

describe('P5: progress bounds', () => {
  it('is null or a whole number 0 to 100, null exactly when nothing is required, and 100 only when all are ticked', () => {
    fc.assert(
      fc.property(arbPlanAndTicks, ({ plan, ticked }) => {
        const percent = progressPercent(plan, ticked);
        const required = plan.items.filter((item) => item.required);
        if (required.length === 0) {
          expect(percent).toBeNull();
          return;
        }
        expect(percent).not.toBeNull();
        expect(Number.isInteger(percent)).toBe(true);
        expect(percent as number).toBeGreaterThanOrEqual(0);
        expect(percent as number).toBeLessThanOrEqual(100);
        const allTicked = required.every((item) => ticked.includes(item.id));
        expect(percent === 100).toBe(allTicked);
      }),
      RUNS,
    );
  });
});

describe('P6: monotonic progress', () => {
  it('ticking more items never lowers progress, and unknown IDs never change it', () => {
    fc.assert(
      fc.property(arbPlanAndTicks, ({ plan, ticked, extra }) => {
        const bigger = [...new Set([...ticked, ...extra])];
        const small = progressPercent(plan, ticked);
        const large = progressPercent(plan, bigger);
        if (small !== null && large !== null) expect(small).toBeLessThanOrEqual(large);
        // Unknown IDs alone change nothing.
        expect(progressPercent(plan, [...ticked, 'not-a-plan-item'])).toEqual(small);
        expect(reconcileTicks(plan, ticked).every((id) => plan.items.some((item) => item.id === id))).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('P9: revive gate', () => {
  it('is open exactly when not revived and every required item is ticked, or none are required', () => {
    fc.assert(
      fc.property(arbPlanAndTicks, fc.boolean(), ({ plan, ticked }, revived) => {
        const progress = {
          tickedItemIds: ticked,
          revived: revived
            ? {
                owner: 'o',
                repo: 'r',
                url: 'https://github.com/o/r',
                wasArchived: false,
                source: 'demo' as const,
                evidenceFetchedAt: '2026-11-22T13:00:00.000Z',
                requiredCount: 0,
                revivedAt: '2026-11-22T13:00:00.000Z',
              }
            : null,
        };
        const allTicked = plan.items.filter((item) => item.required).every((item) => ticked.includes(item.id));
        expect(canMarkRevived(plan, progress)).toBe(!revived && allTicked);
      }),
      RUNS,
    );
  });
});
