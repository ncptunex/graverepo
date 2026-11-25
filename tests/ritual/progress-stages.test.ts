// Unit tests for progress, the revive gate, the revived record and the stage rules
// (task 6.4; U7, U8, U12, U14, U18 domain parts).
import { describe, expect, it } from 'vitest';
import { analyseRepository } from '../../src/ritual';
import {
  buildRevivedRecord,
  canMarkRevived,
  progressPercent,
  reconcileTicks,
  remainingSteps,
} from '../../src/ritual/progress';
import { canEnterStage, canToggle, STAGES } from '../../src/ritual/stages';
import type { RevivedRecord, Stage } from '../../src/ritual/types';
import { REF, buildDetail, buildDetailWithTwoSteps } from './builders';

const twoSteps = analyseRepository(buildDetailWithTwoSteps(), REF).plan;
const noSteps = analyseRepository(buildDetail(), REF).plan;

const record: RevivedRecord = {
  owner: 'test-owner',
  repo: 'test-repo',
  url: 'https://github.com/test-owner/test-repo',
  wasArchived: false,
  source: 'demo',
  evidenceFetchedAt: REF,
  requiredCount: 2,
  revivedAt: REF,
};

describe('progress (U7)', () => {
  it('counts ticked required items: 0, partial and 100', () => {
    expect(progressPercent(twoSteps, [])).toBe(0);
    expect(progressPercent(twoSteps, ['add-readme'])).toBe(50);
    expect(progressPercent(twoSteps, ['add-readme', 'review-latest-commit'])).toBe(100);
    expect(remainingSteps(twoSteps, ['add-readme'])).toBe(1);
  });

  it('rounds down, so 100 means everything is ticked', () => {
    const three = {
      ...twoSteps,
      items: [...twoSteps.items, { ...twoSteps.items[0]!, id: 'check-dependencies' as const, position: 2 }],
    };
    expect(progressPercent(three, ['add-readme'])).toBe(33);
    expect(progressPercent(three, ['add-readme', 'review-latest-commit'])).toBe(66);
  });

  it('is null, not 0 or 100, when no step is required', () => {
    expect(progressPercent(noSteps, [])).toBeNull();
    expect(progressPercent(noSteps, ['anything'])).toBeNull();
  });

  it('ignores IDs that are not in the plan, and reconcileTicks drops them from the count', () => {
    expect(progressPercent(twoSteps, ['add-readme', 'gone-item'])).toBe(50);
    expect(reconcileTicks(twoSteps, ['add-readme', 'gone-item', 'add-readme'])).toEqual(['add-readme']);
  });
});

describe('revive gate (U8)', () => {
  it('is locked until every required item is ticked, then open', () => {
    expect(canMarkRevived(twoSteps, { revived: null, tickedItemIds: [] })).toBe(false);
    expect(canMarkRevived(twoSteps, { revived: null, tickedItemIds: ['add-readme'] })).toBe(false);
    expect(canMarkRevived(twoSteps, { revived: null, tickedItemIds: ['add-readme', 'review-latest-commit'] })).toBe(true);
  });

  it('is open when the plan has no steps', () => {
    expect(canMarkRevived(noSteps, { revived: null, tickedItemIds: [] })).toBe(true);
  });

  it('is closed once the repository is revived', () => {
    expect(canMarkRevived(noSteps, { revived: record, tickedItemIds: [] })).toBe(false);
  });
});

describe('revived record (U12)', () => {
  it('has exactly the allowed fields, from the official core summary, and no email or GitHub extras', () => {
    const detail = buildDetail({ core: { isArchived: true } });
    const built = buildRevivedRecord({
      core: detail.core,
      plan: twoSteps,
      source: 'live',
      evidenceFetchedAt: REF,
      revivedAt: '2026-11-23T01:00:00.000Z',
    });
    expect(Object.keys(built).sort()).toEqual(
      ['evidenceFetchedAt', 'owner', 'repo', 'requiredCount', 'revivedAt', 'source', 'url', 'wasArchived'].sort(),
    );
    expect(built).toEqual({
      owner: 'test-owner',
      repo: 'test-repo',
      url: 'https://github.com/test-owner/test-repo',
      wasArchived: true,
      source: 'live',
      evidenceFetchedAt: REF,
      requiredCount: 2,
      revivedAt: '2026-11-23T01:00:00.000Z',
    });
    expect(JSON.stringify(built)).not.toMatch(/@/);
  });
});

describe('stage rules (U14, U18)', () => {
  it('lets the visitor enter Necropsy, Plan and Rising from anywhere, including skips, before revival', () => {
    for (const target of ['necropsy', 'plan', 'rising'] as Stage[]) {
      expect(canEnterStage({ revived: null }, target)).toBe(true);
    }
  });

  it('refuses The Living before revival, and allows it after', () => {
    expect(canEnterStage({ revived: null }, 'living')).toBe(false);
    for (const target of STAGES) expect(canEnterStage({ revived: record }, target)).toBe(true);
  });

  it('refuses ticking after revival only', () => {
    expect(canToggle({ revived: null })).toBe(true);
    expect(canToggle({ revived: record })).toBe(false);
  });
});
