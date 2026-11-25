// Unit tests for findings, roles and the plan (tasks 3.5, 4.3, 5.4; U2, U3, U5, U6, U15).
// Inputs are test builders, never GitHub data.
import { describe, expect, it } from 'vitest';
import { analyseRepository } from '../../src/ritual';
import { buildFindings } from '../../src/ritual/findings';
import { buildPlan } from '../../src/ritual/plan';
import type { AnyFinding, FindingId } from '../../src/ritual/types';
import { REF, available, buildDetail, buildDetailWithTwoSteps, daysBefore } from './builders';

const CUTOFF_12 = '2025-11-22T13:00:00.000Z';
const secondsFrom = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

function byId(findings: readonly AnyFinding[], id: FindingId): AnyFinding | undefined {
  return findings.find((finding) => finding.id === id);
}

const openIssues = (count: number, isLowerBound: boolean, oldest: boolean) =>
  available({
    count,
    isLowerBound,
    issuesPageUrl: 'https://github.com/test-owner/test-repo/issues',
    itemsRead: count,
    oldest: oldest ? { createdAt: '2022-01-01T00:00:00.000Z', number: 7, url: 'https://github.com/test-owner/test-repo/issues/7' } : null,
    oldestNotFoundInFirst100: false,
  });

describe('buildFindings: order and omission (U2, U3)', () => {
  it('lists the findings in catalogue order, and omits the ones with nothing to report', () => {
    const findings = buildFindings(buildDetail(), REF);
    expect(findings.map((finding) => finding.id)).toEqual([
      'last-update',
      'latest-commit',
      'readme',
      'open-issues',
      'recent-authors',
      'branches',
      'ci',
      'dependency-file',
    ]);
  });

  it('shows renamed, archived, empty and fork only when true', () => {
    const detail = buildDetail({
      renamedFrom: 'test-owner/old-name',
      isEmpty: true,
      core: { isArchived: true, isFork: true },
      sections: {
        latestCommit: { status: 'not-applicable', reason: 'empty-repository' },
        recentAuthors: { status: 'not-applicable', reason: 'empty-repository' },
        manifest: { status: 'not-applicable', reason: 'empty-repository' },
      },
    });
    const ids = buildFindings(detail, REF).map((finding) => finding.id);
    expect(ids.slice(0, 6)).toEqual(['renamed', 'archived', 'empty', 'last-update', 'latest-commit', 'fork']);
  });

  it('gives the renamed finding the evidence the spec lists (U15)', () => {
    const detail = buildDetail({ renamedFrom: 'test-owner/old-name' });
    const renamed = byId(buildFindings(detail, REF), 'renamed');
    expect(renamed?.evidence).toEqual([
      { field: 'renamedFrom', value: 'test-owner/old-name' },
      { field: 'core.owner', value: 'test-owner' },
      { field: 'core.name', value: 'test-repo' },
    ]);
    expect(renamed?.role).toBe('informational');
    expect(byId(buildFindings(buildDetail(), REF), 'renamed')).toBeUndefined();
  });

  it('omits a section switched off by configuration, and keeps a not-applicable one as a finding (U3)', () => {
    const disabled = { status: 'not-applicable', reason: 'section-disabled' } as const;
    const findings = buildFindings(
      buildDetail({
        isEmpty: true,
        sections: {
          branches: disabled,
          ci: disabled,
          recentAuthors: { status: 'not-applicable', reason: 'empty-repository' },
          manifest: { status: 'not-applicable', reason: 'empty-repository' },
          latestCommit: { status: 'not-applicable', reason: 'empty-repository' },
        },
      }),
      REF,
    );
    const ids = findings.map((finding) => finding.id);
    expect(ids).not.toContain('branches');
    expect(ids).not.toContain('ci');
    expect(byId(findings, 'recent-authors')).toMatchObject({ state: 'not-applicable', reason: 'empty-repository' });
    expect(byId(findings, 'dependency-file')).toMatchObject({ state: 'not-applicable', reason: 'empty-repository' });
    expect(byId(findings, 'latest-commit')).toMatchObject({ state: 'not-applicable', role: 'informational' });
  });

  it('treats an unexpected not-applicable reason as unavailable, carrying the reason as given', () => {
    const findings = buildFindings(
      buildDetail({
        sections: {
          readme: { status: 'not-applicable', reason: 'issues-disabled' },
          openIssues: { status: 'not-applicable', reason: 'section-disabled' },
          branches: { status: 'not-applicable', reason: 'issues-disabled' },
        },
      }),
      REF,
    );
    expect(byId(findings, 'readme')).toMatchObject({ state: 'unavailable', reason: 'issues-disabled' });
    // `section-disabled` on a core section is not a switch-off: it is not trusted.
    expect(byId(findings, 'open-issues')).toMatchObject({ state: 'unavailable', reason: 'section-disabled' });
    expect(byId(findings, 'branches')).toMatchObject({ state: 'unavailable', reason: 'issues-disabled' });
  });

  it('keeps unavailable findings unavailable, with the data layer reason and no value', () => {
    const findings = buildFindings(
      buildDetail({ sections: { readme: { status: 'unavailable', reason: 'rate-limited' } }, core: { pushedAt: null } }),
      REF,
    );
    expect(byId(findings, 'readme')).toMatchObject({
      state: 'unavailable',
      reason: 'rate-limited',
      value: null,
      role: 'informational',
      informationalReason: 'unavailable',
    });
    expect(byId(findings, 'last-update')).toMatchObject({ state: 'unavailable', value: null });
  });

  it('keeps raw evidence apart from derived values', () => {
    const findings = buildFindings(buildDetail(), REF);
    const lastUpdate = byId(findings, 'last-update');
    expect(lastUpdate?.evidence).toEqual([{ field: 'core.pushedAt', value: daysBefore(REF, 10) }]);
    expect(lastUpdate?.derived).toEqual([
      { name: 'ageMonths', value: 0, computedFrom: ['core.pushedAt'], referenceTime: REF },
    ]);
    for (const finding of findings) expect(finding.evidence.length).toBeGreaterThan(0);
  });
});

describe('open issues cases (U2, O15)', () => {
  const issuesOf = (count: number, lower: boolean, oldest: boolean) =>
    buildFindings(buildDetail({ sections: { openIssues: openIssues(count, lower, oldest) } }), REF);

  it('count 0 without a lower bound is "no open issues": informational, no oldest finding', () => {
    const findings = issuesOf(0, false, false);
    expect(byId(findings, 'open-issues')).toMatchObject({
      state: 'available',
      isLowerBound: false,
      role: 'informational',
      informationalReason: 'no-action-needed',
    });
    expect(byId(findings, 'oldest-open-issue')).toBeUndefined();
  });

  it('count 0 with a lower bound stays distinguishable, is fact-only and has no oldest finding', () => {
    const findings = issuesOf(0, true, false);
    expect(byId(findings, 'open-issues')).toMatchObject({
      isLowerBound: true,
      role: 'informational',
      informationalReason: 'fact-only',
    });
    expect(byId(findings, 'oldest-open-issue')).toBeUndefined();
  });

  it('count at least 1 is actionable, and the oldest issue is a finding when the data layer has one', () => {
    const findings = issuesOf(3, true, true);
    expect(byId(findings, 'open-issues')).toMatchObject({ role: 'actionable', isLowerBound: true });
    expect(byId(findings, 'oldest-open-issue')).toMatchObject({ state: 'available', value: { number: 7 } });
  });

  it('omits the oldest issue when it is missing', () => {
    expect(byId(issuesOf(3, false, false), 'oldest-open-issue')).toBeUndefined();
  });

  it('issues turned off is the not-applicable state of open-issues, with no second finding', () => {
    const findings = buildFindings(
      buildDetail({
        core: { hasIssues: false },
        sections: { openIssues: { status: 'not-applicable', reason: 'issues-disabled' } },
      }),
      REF,
    );
    expect(byId(findings, 'open-issues')).toMatchObject({ state: 'not-applicable', reason: 'issues-disabled' });
    expect(byId(findings, 'oldest-open-issue')).toBeUndefined();
  });

  it('unavailable issues give no oldest finding', () => {
    const findings = buildFindings(buildDetail({ sections: { openIssues: { status: 'unavailable', reason: 'network' } } }), REF);
    expect(byId(findings, 'open-issues')).toMatchObject({ state: 'unavailable' });
    expect(byId(findings, 'oldest-open-issue')).toBeUndefined();
  });
});

describe('roles (U5, O24)', () => {
  const latestCommitAt = (date: string, pushedAt: string | null = daysBefore(REF, 1)) =>
    byId(
      buildFindings(
        buildDetail({
          core: { pushedAt },
          sections: { latestCommit: available({ date, shortSha: 'a', url: 'https://github.com/x', author: null }) },
        }),
        REF,
      ),
      'latest-commit',
    );

  it('latest-commit is actionable one second before cutoff12, and not at exactly cutoff12', () => {
    expect(latestCommitAt(secondsFrom(CUTOFF_12, -1))?.role).toBe('actionable');
    expect(latestCommitAt(CUTOFF_12)?.role).toBe('informational');
    expect(latestCommitAt(CUTOFF_12)?.informationalReason).toBe('no-action-needed');
  });

  it('uses the latest commit date, not pushedAt', () => {
    // Old commit, recent push: actionable.
    expect(latestCommitAt(daysBefore(REF, 500), daysBefore(REF, 1))?.role).toBe('actionable');
    // Recent commit, old push: informational.
    expect(latestCommitAt(daysBefore(REF, 5), daysBefore(REF, 900))?.role).toBe('informational');
  });

  it('is informational when last-update is unavailable (pushedAt null)', () => {
    const finding = latestCommitAt(daysBefore(REF, 500), null);
    expect(finding).toMatchObject({ role: 'informational', informationalReason: 'fact-only' });
  });

  it('lists pushedAt as evidence of availability only', () => {
    const finding = latestCommitAt(daysBefore(REF, 500));
    expect(finding?.evidence.map((item) => item.field)).toEqual(['sections.latestCommit', 'core.pushedAt']);
  });

  it('is never actionable when latest-commit is unavailable or not applicable', () => {
    for (const section of [
      { status: 'unavailable', reason: 'network' },
      { status: 'not-applicable', reason: 'empty-repository' },
    ] as const) {
      const finding = byId(buildFindings(buildDetail({ sections: { latestCommit: section } }), REF), 'latest-commit');
      expect(finding?.role).toBe('informational');
    }
  });

  it('readme: actionable only when no README was found', () => {
    const find = (found: boolean) =>
      byId(buildFindings(buildDetail({ sections: { readme: available({ found, url: null }) } }), REF), 'readme');
    expect(find(false)?.role).toBe('actionable');
    expect(find(true)).toMatchObject({ role: 'informational', informationalReason: 'no-action-needed' });
  });

  it('ci: only a latest run that ended in failure is actionable', () => {
    const find = (conclusion: string | null) =>
      byId(
        buildFindings(
          buildDetail({
            sections: { ci: available({ found: true, conclusion, date: daysBefore(REF, 1), url: 'https://github.com/x' }) },
          }),
          REF,
        ),
        'ci',
      );
    expect(find('failure')?.role).toBe('actionable');
    for (const other of ['success', 'cancelled', 'timed_out', null]) expect(find(other)?.role).toBe('informational');
    const none = byId(buildFindings(buildDetail({ sections: { ci: available({ found: false }) } }), REF), 'ci');
    expect(none).toMatchObject({ role: 'informational', informationalReason: 'no-action-needed' });
  });

  it('dependency-file: actionable only when a file is found and last changed over 12 months ago', () => {
    const find = (fileName: string | null, lastChangedAt: string | null) =>
      byId(
        buildFindings(
          buildDetail({ sections: { manifest: available({ fileName, lastChangedAt, commitUrl: null }) } }),
          REF,
        ),
        'dependency-file',
      );
    expect(find('package.json', secondsFrom(CUTOFF_12, -1))?.role).toBe('actionable');
    expect(find('package.json', CUTOFF_12)?.role).toBe('informational');
    expect(find(null, null)).toMatchObject({ role: 'informational', informationalReason: 'no-action-needed' });
    expect(find('package.json', null)).toMatchObject({ role: 'informational', informationalReason: 'fact-only' });
  });

  it('every available informational finding has a reason, and every actionable one has none', () => {
    for (const detail of [buildDetail(), buildDetailWithTwoSteps()]) {
      for (const finding of buildFindings(detail, REF)) {
        if (finding.state === 'available' && finding.role === 'informational') {
          expect(finding.informationalReason).not.toBeNull();
        }
        if (finding.role === 'actionable') expect(finding.informationalReason).toBeNull();
      }
    }
  });
});

describe('buildPlan (U6)', () => {
  const planOf = (detail: ReturnType<typeof buildDetail>) => analyseRepository(detail, REF).plan;

  it('is empty when nothing is actionable', () => {
    const plan = planOf(buildDetail());
    expect(plan.items).toEqual([]);
    expect(plan.isArchived).toBe(false);
  });

  it('creates items in the fixed rule order with stable IDs, positions and the required flag', () => {
    const plan = planOf(buildDetailWithTwoSteps());
    expect(plan.items.map((item) => [item.id, item.position, item.required])).toEqual([
      ['add-readme', 0, true],
      ['review-latest-commit', 1, true],
    ]);
  });

  it('triggers every rule, and nothing else, in order', () => {
    const detail = buildDetail({
      isEmpty: true,
      core: { isArchived: true },
      sections: {
        readme: available({ found: false, url: null }),
        latestCommit: available({
          date: daysBefore(REF, 600),
          shortSha: 'a',
          url: 'https://github.com/x',
          author: null,
        }),
        manifest: available({ fileName: 'package.json', lastChangedAt: daysBefore(REF, 700), commitUrl: null }),
        ci: available({ found: true, conclusion: 'failure', date: daysBefore(REF, 2), url: 'https://github.com/x' }),
        openIssues: openIssues(4, false, true),
      },
    });
    const plan = planOf(detail);
    expect(plan.items.map((item) => item.id)).toEqual([
      'review-archived',
      'add-first-commit',
      'add-readme',
      'review-latest-commit',
      'check-dependencies',
      'check-workflow-run',
      'review-open-issues',
    ]);
    expect(plan.isArchived).toBe(true);
    expect(plan.items[4]?.step).toEqual({ file: 'package.json' });
    expect(plan.items[5]?.because).toMatchObject({ conclusion: 'failure' });
    expect(plan.items[6]?.step).toEqual({ startWithOldest: true });
  });

  it('starts an archived plan with review-archived and flags it as suggestions only', () => {
    const plan = planOf(buildDetail({ core: { isArchived: true }, sections: { readme: available({ found: false, url: null }) } }));
    expect(plan.items[0]?.id).toBe('review-archived');
    expect(plan.isArchived).toBe(true);
  });

  it('copies the finding evidence and keeps derived values labelled as derived', () => {
    const analysis = analyseRepository(buildDetailWithTwoSteps(), REF);
    const item = analysis.plan.items.find((candidate) => candidate.id === 'review-latest-commit');
    const finding = byId(analysis.findings, 'latest-commit');
    expect(item?.evidence).toEqual(finding?.evidence);
    expect(item?.derived).toEqual(finding?.derived);
    expect(item?.derived[0]).toMatchObject({ name: 'ageMonths', computedFrom: ['sections.latestCommit'] });
    expect(item?.because).toEqual({ date: daysBefore(REF, 500) });
    expect(item?.evidence.some((entry) => entry.field === 'ageMonths')).toBe(false);
  });

  it('review-latest-commit does not trigger from an old pushedAt alone', () => {
    const plan = planOf(buildDetail({ core: { pushedAt: daysBefore(REF, 900) } }));
    expect(plan.items.map((item) => item.id)).not.toContain('review-latest-commit');
  });

  it('creates no item from unavailable or not-applicable findings, and lists the unavailable ones', () => {
    const plan = planOf(
      buildDetail({
        sections: {
          readme: { status: 'unavailable', reason: 'rate-limited' },
          ci: { status: 'unavailable', reason: 'timeout' },
        },
      }),
    );
    expect(plan.items).toEqual([]);
    expect(plan.unavailableFindingIds).toEqual(['readme', 'ci']);
  });

  it('mentions the oldest issue in the step only when the data layer found one', () => {
    const without = planOf(buildDetail({ sections: { openIssues: openIssues(3, true, false) } }));
    expect(without.items[0]).toMatchObject({ id: 'review-open-issues', step: { startWithOldest: false } });
    expect(without.items[0]?.because).toEqual({ count: 3, isLowerBound: true });
  });

  it('is built by buildPlan from findings alone', () => {
    const findings = buildFindings(buildDetailWithTwoSteps(), REF);
    expect(buildPlan(findings)).toEqual(analyseRepository(buildDetailWithTwoSteps(), REF).plan);
  });
});
