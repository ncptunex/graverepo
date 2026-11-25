// Tests for the date helpers and the condition (tasks 2.2, 4.1, 4.3; U1, U4, P14, P16, part of P8).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveCondition } from '../../src/ritual/condition';
import { ageInMonths, isOlderThanMonths, subtractMonths } from '../../src/ritual/dates';
import type { ConditionInput } from '../../src/ritual/types';
import { REF, arbReferenceTime } from './builders';

const CUTOFF_12 = '2025-11-22T13:00:00.000Z';
const CUTOFF_24 = '2024-11-22T13:00:00.000Z';
const secondsFrom = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

describe('subtractMonths (U1)', () => {
  it('keeps the time of day and clamps the day of the month', () => {
    expect(subtractMonths('2026-03-31T10:20:30.123Z', 1)).toBe('2026-02-28T10:20:30.123Z');
    expect(subtractMonths('2028-03-31T10:20:30.000Z', 1)).toBe('2028-02-29T10:20:30.000Z');
    expect(subtractMonths('2028-02-29T00:00:00.000Z', 12)).toBe('2027-02-28T00:00:00.000Z');
    expect(subtractMonths('2028-02-29T00:00:00.000Z', 48)).toBe('2024-02-29T00:00:00.000Z');
    expect(subtractMonths('2026-01-15T08:00:00.000Z', 2)).toBe('2025-11-15T08:00:00.000Z');
    expect(subtractMonths(REF, 12)).toBe(CUTOFF_12);
    expect(subtractMonths(REF, 24)).toBe(CUTOFF_24);
  });
});

describe('isOlderThanMonths and ageInMonths (U1)', () => {
  it('is false exactly at 12 and 24 months and true one second earlier', () => {
    expect(isOlderThanMonths(CUTOFF_12, 12, REF)).toBe(false);
    expect(isOlderThanMonths(secondsFrom(CUTOFF_12, -1), 12, REF)).toBe(true);
    expect(isOlderThanMonths(secondsFrom(CUTOFF_12, 1), 12, REF)).toBe(false);
    expect(isOlderThanMonths(CUTOFF_24, 24, REF)).toBe(false);
    expect(isOlderThanMonths(secondsFrom(CUTOFF_24, -1), 24, REF)).toBe(true);
  });

  it('never calls an unreadable date older', () => {
    expect(isOlderThanMonths('not a date', 12, REF)).toBe(false);
    expect(isOlderThanMonths(REF, 12, 'not a date')).toBe(false);
  });

  it('gives the display age in whole months, and 0 for a date at or after the reference time', () => {
    expect(ageInMonths(CUTOFF_12, REF)).toBe(12);
    expect(ageInMonths(secondsFrom(CUTOFF_12, -1), REF)).toBe(12);
    expect(ageInMonths(secondsFrom(CUTOFF_12, -60 * 60 * 24 * 40), REF)).toBe(13);
    expect(ageInMonths(secondsFrom(CUTOFF_24, 1), REF)).toBe(23);
    expect(ageInMonths(REF, REF)).toBe(0);
    expect(ageInMonths(secondsFrom(REF, 3600), REF)).toBe(0);
    expect(ageInMonths('2026-11-01T00:00:00.000Z', REF)).toBe(0);
  });
});

describe('property P14: dates', () => {
  it('subtractMonths never moves later, and "older than" gets weaker as the months grow', () => {
    fc.assert(
      fc.property(
        arbReferenceTime,
        fc.date({ min: new Date('2015-01-01'), max: new Date('2031-01-01'), noInvalidDate: true }),
        fc.integer({ min: 0, max: 48 }),
        fc.integer({ min: 0, max: 24 }),
        (reference, date, months, extra) => {
          expect(Date.parse(subtractMonths(reference, months))).toBeLessThanOrEqual(Date.parse(reference));
          const iso = date.toISOString();
          if (isOlderThanMonths(iso, months + extra, reference)) {
            expect(isOlderThanMonths(iso, months, reference)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

const input = (overrides: Partial<ConditionInput> = {}): ConditionInput => ({
  isArchived: false,
  isEmpty: false,
  pushedAt: secondsFrom(REF, -86_400),
  ...overrides,
});

describe('deriveCondition (U4)', () => {
  it('follows the precedence: archived, empty, unknown, then the date', () => {
    expect(deriveCondition(input({ isArchived: true, isEmpty: true, pushedAt: null }), REF).id).toBe('archived');
    expect(deriveCondition(input({ isEmpty: true, pushedAt: null }), REF).id).toBe('empty');
    expect(deriveCondition(input({ pushedAt: null }), REF).id).toBe('last-update-unknown');
    expect(deriveCondition(input(), REF).id).toBe('recently-updated');
  });

  it('keeps an archived repository archived, even with a recent push', () => {
    const condition = deriveCondition(input({ isArchived: true, pushedAt: secondsFrom(REF, -60) }), REF);
    expect(condition.id).toBe('archived');
  });

  it('never gives `empty` for an unknown `isEmpty` (a tombstone summary), whatever else is missing', () => {
    expect(deriveCondition(input({ isEmpty: null, pushedAt: null }), REF).id).toBe('last-update-unknown');
    expect(deriveCondition(input({ isEmpty: null }), REF).id).toBe('recently-updated');
  });

  it.each([
    ['a future push', secondsFrom(REF, 86_400), 'recently-updated'],
    ['exactly cutoff12', CUTOFF_12, 'recently-updated'],
    ['one second before cutoff12', secondsFrom(CUTOFF_12, -1), 'resting'],
    ['one second after cutoff12', secondsFrom(CUTOFF_12, 1), 'recently-updated'],
    ['exactly cutoff24', CUTOFF_24, 'resting'],
    ['one second before cutoff24', secondsFrom(CUTOFF_24, -1), 'dormant'],
  ] as const)('boundary table: %s', (_name, pushedAt, expected) => {
    expect(deriveCondition(input({ pushedAt }), REF).id).toBe(expected);
  });

  it('gives a display age of 0 for a future push, and lists the raw fields it was based on', () => {
    const future = deriveCondition(input({ pushedAt: secondsFrom(REF, 86_400) }), REF);
    expect(future.ageMonths).toBe(0);
    expect(future.kind).toBe('interpretation');
    expect(future.basedOn.map((item) => item.field)).toEqual(['core.isArchived', 'isEmpty', 'core.pushedAt']);
    // `isEmpty` is listed only when known.
    expect(deriveCondition(input({ isEmpty: null }), REF).basedOn.map((item) => item.field)).toEqual([
      'core.isArchived',
      'core.pushedAt',
    ]);
  });

  it('chooses the condition by date comparison, not by the displayed age', () => {
    // One second before cutoff12 reads "12 months" but is already resting.
    const condition = deriveCondition(input({ pushedAt: secondsFrom(CUTOFF_12, -1) }), REF);
    expect(condition.ageMonths).toBe(12);
    expect(condition.id).toBe('resting');
  });

  it('gives the same condition from a detail-style input and a tombstone-style input with isEmpty null', () => {
    const pushedAt = secondsFrom(CUTOFF_12, -5);
    expect(deriveCondition(input({ pushedAt, isEmpty: false }), REF).id).toBe(
      deriveCondition(input({ pushedAt, isEmpty: null }), REF).id,
    );
  });
});

describe('property P16: condition boundaries', () => {
  const rank = { 'recently-updated': 0, resting: 1, dormant: 2 } as const;

  it('agrees with direct comparisons against the cutoffs, and keeps the precedence', () => {
    fc.assert(
      fc.property(
        arbReferenceTime,
        fc.boolean(),
        fc.constantFrom(true, false, null),
        fc.option(fc.date({ min: new Date('2015-01-01'), max: new Date('2031-01-01'), noInvalidDate: true }), { nil: null }),
        (reference, isArchived, isEmpty, pushed) => {
          const pushedAt = pushed === null ? null : pushed.toISOString();
          const { id } = deriveCondition({ isArchived, isEmpty, pushedAt }, reference);
          let expected: string;
          if (isArchived) expected = 'archived';
          else if (isEmpty === true) expected = 'empty';
          else if (pushedAt === null) expected = 'last-update-unknown';
          else if (Date.parse(pushedAt) >= Date.parse(subtractMonths(reference, 12))) expected = 'recently-updated';
          else if (Date.parse(pushedAt) >= Date.parse(subtractMonths(reference, 24))) expected = 'resting';
          else expected = 'dormant';
          expect(id).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never ranks an older push lower than a newer one', () => {
    fc.assert(
      fc.property(
        arbReferenceTime,
        fc.date({ min: new Date('2015-01-01'), max: new Date('2031-01-01'), noInvalidDate: true }),
        fc.date({ min: new Date('2015-01-01'), max: new Date('2031-01-01'), noInvalidDate: true }),
        (reference, first, second) => {
          const [older, newer] = first <= second ? [first, second] : [second, first];
          const olderId = deriveCondition({ isArchived: false, isEmpty: null, pushedAt: older.toISOString() }, reference).id;
          const newerId = deriveCondition({ isArchived: false, isEmpty: null, pushedAt: newer.toISOString() }, reference).id;
          expect(rank[olderId as keyof typeof rank]).toBeGreaterThanOrEqual(rank[newerId as keyof typeof rank]);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('property P8 (condition part): archived is never active', () => {
  it('an archived repository always has the condition `archived`, whatever its dates are', () => {
    fc.assert(
      fc.property(
        arbReferenceTime,
        fc.constantFrom(true, false, null),
        fc.option(fc.date({ min: new Date('2015-01-01'), max: new Date('2031-01-01'), noInvalidDate: true }), { nil: null }),
        (reference, isEmpty, pushed) => {
          const condition = deriveCondition(
            { isArchived: true, isEmpty, pushedAt: pushed === null ? null : pushed.toISOString() },
            reference,
          );
          expect(condition.id).toBe('archived');
          expect(condition.id).not.toBe('recently-updated');
        },
      ),
      { numRuns: 200 },
    );
  });
});
