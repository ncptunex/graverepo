// Date helpers for the ritual (task 2.2, design 4.3; Req 3.3, 3.4, 3.8, 11.9).
// Everything works on ISO strings and UTC instants. Nothing reads a clock: the reference time
// is always passed in.

function isValidDate(iso: string): boolean {
  return !Number.isNaN(Date.parse(iso));
}

/**
 * The reference instant minus `months` calendar months, in UTC. The time of day is kept and
 * the day of the month is clamped (31 March minus 1 month is 28 or 29 February; 29 February
 * minus 12 months is 28 February). The input must be a valid ISO date.
 */
export function subtractMonths(referenceTime: string, months: number): string {
  const reference = new Date(referenceTime);
  const totalMonths = reference.getUTCFullYear() * 12 + reference.getUTCMonth() - months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(reference.getUTCDate(), daysInTargetMonth);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      reference.getUTCHours(),
      reference.getUTCMinutes(),
      reference.getUTCSeconds(),
      reference.getUTCMilliseconds(),
    ),
  ).toISOString();
}

/**
 * True exactly when `date` is strictly earlier than `subtractMonths(referenceTime, months)`.
 * The condition rules and the role rules both use this one function, so they cannot disagree.
 * An invalid date is never "older": nothing is claimed from a value that can't be read.
 */
export function isOlderThanMonths(date: string, months: number, referenceTime: string): boolean {
  if (!isValidDate(date) || !isValidDate(referenceTime)) return false;
  return Date.parse(date) < Date.parse(subtractMonths(referenceTime, months));
}

/**
 * The largest whole `n` for which `subtractMonths(referenceTime, n)` is not earlier than `date`.
 * 0 for a date at or after the reference time. For display text only ("14 months ago").
 * It never chooses a condition.
 */
export function ageInMonths(date: string, referenceTime: string): number {
  if (!isValidDate(date) || !isValidDate(referenceTime)) return 0;
  const target = Date.parse(date);
  if (target >= Date.parse(referenceTime)) return 0;

  const from = new Date(date);
  const to = new Date(referenceTime);
  // Start from the difference in calendar months, then adjust by at most a month either way.
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  while (months > 0 && Date.parse(subtractMonths(referenceTime, months)) < target) months -= 1;
  while (Date.parse(subtractMonths(referenceTime, months + 1)) >= target) months += 1;
  return Math.max(0, months);
}
