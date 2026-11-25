// Tests for the wording module and the tombstone view (ritual task 8.2: U10, P10; dashboard 2.6/2.7: D-U5, D-P4).
// Uses the ritual test builders. All data is made up for tests.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tombstoneView } from '../../src/components/tombstone-view';
import {
  conditionLine,
  describeAge,
  findingText,
  formatDate,
  lastUpdatedFact,
  planItemText,
  relativeAge,
  reviveDisabledText,
  risingProgressText,
} from '../../src/components/wording';
import { analyseRepository } from '../../src/ritual';
import type { DisplayContext } from '../../src/ritual/types';
import { REF, arbCase, buildDetail, buildSummary, buildDetailWithTwoSteps, available } from '../ritual/builders';

const UTC: DisplayContext = { locale: 'en-GB', timeZone: 'UTC' };
const KL: DisplayContext = { locale: 'en-GB', timeZone: 'Asia/Kuala_Lumpur' };
const AVOIDED = /\b(dead|deceased|killed|abandoned|forsaken|rotting|neglected|gave up|quit|stopped working|broken|failing|poor quality)\b/i;

describe('dates and ages', () => {
  it('pluralises naturally', () => {
    const at = (ms: number) => describeAge(new Date(Date.parse(REF) - ms).toISOString(), REF);
    expect(at(0)).toBe('0 minutes');
    expect(at(60_000)).toBe('1 minute');
    expect(at(2 * 60_000)).toBe('2 minutes');
    expect(at(3_600_000)).toBe('1 hour');
    expect(at(2 * 3_600_000)).toBe('2 hours');
    expect(at(86_400_000)).toBe('1 day');
    expect(at(5 * 86_400_000)).toBe('5 days');
  });

  it('labels UTC only when the fallback zone is used', () => {
    expect(formatDate('2025-03-03T10:00:00Z', UTC)).toMatch(/UTC$/);
    expect(formatDate('2025-03-03T10:00:00Z', KL)).not.toMatch(/UTC/);
  });

  it('gives the date only for a future update, with no relative phrase', () => {
    const fact = lastUpdatedFact('2027-01-01T00:00:00Z', REF, KL);
    expect(fact).toMatch(/^Last updated 1 Jan 2027$/);
    expect(relativeAge('2027-01-01T00:00:00Z', REF)).toBeNull();
  });

  it('gives months, singular for one, and "not available" for null', () => {
    expect(relativeAge('2026-10-10T00:00:00Z', REF)).toBe('1 month ago');
    expect(lastUpdatedFact('2025-09-22T00:00:00Z', REF, KL)).toMatch(/^Last updated 14 months ago \(/);
    expect(lastUpdatedFact(null, REF, KL)).toBe('Last update date not available');
  });

  it('pairs the condition label with the fact', () => {
    expect(conditionLine({ id: 'resting' }, '2025-06-01T00:00:00Z', REF, KL)).toMatch(/^Resting · Last updated /);
    expect(conditionLine({ id: 'last-update-unknown' }, null, REF, KL)).toBe('Last update date not available');
  });
});

describe('findings wording', () => {
  const texts = (detail = buildDetail()) =>
    Object.fromEntries(analyseRepository(detail, REF).findings.map((f) => [f.id, findingText(f, REF, KL)]));

  it('states open issues for count 0 with a lower bound without claiming a number checked', () => {
    const lowerBound = buildDetail({
      sections: { openIssues: available({ count: 0, isLowerBound: true, issuesPageUrl: 'https://github.com/o/r/issues', itemsRead: 100, oldest: null, oldestNotFoundInFirst100: true }) },
    });
    expect(texts(lowerBound)['open-issues']?.fact).toBe('No open issue found. The count may be incomplete.');
    expect(texts(lowerBound)['open-issues']?.fact).not.toMatch(/100/);
  });

  it('says "No README found" and "README couldn\'t be checked" apart', () => {
    const none = buildDetail({ sections: { readme: available({ found: false, url: null }) } });
    expect(texts(none).readme?.fact).toBe('No README found');
    const failed = buildDetail({ sections: { readme: { status: 'unavailable', reason: 'network' } } });
    expect(texts(failed).readme?.fact).toBe("README couldn't be checked.");
    expect(texts(failed).readme?.status).toBe('unavailable');
  });

  it('explains a rate-limited section', () => {
    const limited = buildDetail({ sections: { branches: { status: 'unavailable', reason: 'rate-limited' } } });
    expect(texts(limited).branches?.fact).toBe("Branches couldn't be checked because GitHub ran out of lookups.");
  });

  it('never shows 0 or None for unavailable values', () => {
    const failed = buildDetail({ sections: { openIssues: { status: 'unavailable', reason: 'timeout' } } });
    expect(texts(failed)['open-issues']?.fact).toBe("Open issues couldn't be checked.");
  });

  it('shows issues turned off as not applicable', () => {
    const off = buildDetail({ sections: { openIssues: { status: 'not-applicable', reason: 'issues-disabled' } } });
    expect(texts(off)['open-issues']).toMatchObject({ fact: 'Not applicable: issues are turned off', status: 'not-applicable' });
  });
});

describe('plan wording', () => {
  it('writes "Because {fact}, you could {step}." for every item and ties it to a fact', () => {
    const plan = analyseRepository(buildDetailWithTwoSteps(), REF).plan;
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) {
      const text = planItemText(item, KL);
      expect(text.sentence).toMatch(/^Because .+, you could .+\.$/);
      expect(text.sentence).not.toMatch(AVOIDED);
    }
  });

  it('keeps the dependency file name and drops "starting with the oldest" when no oldest issue exists', () => {
    const detail = buildDetail({
      sections: {
        manifest: available({ fileName: 'Package.json', lastChangedAt: '2023-01-01T00:00:00Z', commitUrl: null }),
        openIssues: available({ count: 2, isLowerBound: false, issuesPageUrl: 'https://github.com/o/r/issues', itemsRead: 2, oldest: null, oldestNotFoundInFirst100: false }),
      },
    });
    const items = analyseRepository(detail, REF).plan.items;
    const deps = items.find((item) => item.id === 'check-dependencies');
    const issues = items.find((item) => item.id === 'review-open-issues');
    expect(deps && planItemText(deps, KL).sentence).toContain('Because Package.json last changed on');
    expect(issues && planItemText(issues, KL).step).toBe('look through the open issues');
  });
});

describe('rising and revive wording', () => {
  it('uses the approved progress lines', () => {
    expect(risingProgressText(0, 0)).toBe('No steps');
    expect(risingProgressText(0, 3)).toBe('Nothing planted yet');
    expect(risingProgressText(1, 3)).toBe('1 of 3 steps done');
    expect(risingProgressText(1, 1)).toBe('All steps done. Ready to mark as revived.');
  });

  it('uses the approved revive-disabled lines with singular and plural', () => {
    expect(reviveDisabledText(1)).toBe('1 step left before you can mark this repository as revived in GRAVEREPO.');
    expect(reviveDisabledText(3)).toBe('3 steps left before you can mark this repository as revived in GRAVEREPO.');
  });
});

describe('wording properties (P10)', () => {
  it('never uses an avoided word or an undefined value, for any detail', () => {
    fc.assert(
      fc.property(arbCase, ({ reference, detail }) => {
        const analysis = analyseRepository(detail, reference);
        const lines = [
          conditionLine(analysis.condition, detail.core.pushedAt, reference, KL),
          ...analysis.findings.map((f) => {
            const t = findingText(f, reference, UTC);
            return `${t.label} ${t.fact}`;
          }),
          ...analysis.plan.items.map((item) => planItemText(item, KL).sentence),
        ];
        for (const line of lines) {
          expect(line).not.toMatch(AVOIDED);
          expect(line).not.toMatch(/undefined|null|NaN/);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('never calls an archived repository active, healthy or recently updated on its card', () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 0, max: 4000 }), { nil: null }), (days) => {
        const pushedAt = days === null ? null : new Date(Date.parse(REF) - days * 86_400_000).toISOString();
        const view = tombstoneView(buildSummary({ isArchived: true, pushedAt }), REF, KL, 'demo');
        const text = `${view.conditionLabel} ${view.fact} ${view.accessibleName}`;
        expect(text).not.toMatch(/\b(active|healthy|recently updated|dead)\b/i);
        expect(view.conditionId).toBe('archived');
      }),
      { numRuns: 60 },
    );
  });
});

describe('tombstoneView (D-U5)', () => {
  it('derives the condition from the summary with isEmpty unknown, and pairs it with the date fact', () => {
    const view = tombstoneView(buildSummary({ name: 'old', pushedAt: '2024-01-01T00:00:00Z' }), REF, KL, 'live');
    expect(view.conditionLabel).toBe('Dormant');
    expect(view.fact).toMatch(/^Last updated /);
    expect(view.accessibleName).toContain('old.');
    expect(view.accessibleName).toContain('Dormant.');
    expect(view.accessibleName).toContain('Open to look at the evidence.');
    expect(view.showOwner).toBe(false);
  });

  it('shows no resting label for an unknown update date', () => {
    const view = tombstoneView(buildSummary({ pushedAt: null }), REF, KL, 'live');
    expect(view.conditionLabel).toBe('Last update not available');
    expect(view.accessibleName.match(/not available/gi)?.length).toBe(1);
  });

  it('never gives Empty from size alone', () => {
    expect(tombstoneView(buildSummary({ sizeKb: 0 }), REF, KL, 'live').conditionId).not.toBe('empty');
  });

  it('adds flags, hides the owner for live and shows it for the demo, leaves unknown values out', () => {
    const view = tombstoneView(buildSummary({ isFork: true, isArchived: true, primaryLanguage: null, description: null }), REF, KL, 'demo');
    expect(view.flags).toEqual(['archived', 'fork']);
    expect(view.language).toBeNull();
    expect(view.description).toBeNull();
    expect(view.showOwner).toBe(true);
    expect(view.accessibleName).toContain('Archived on GitHub.');
    expect(view.accessibleName).toContain('Fork.');
  });
});
