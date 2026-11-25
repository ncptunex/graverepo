// The ritual wording module (resurrection-ritual task 8, design 10.1). It lives in components/
// next to the other pure text helpers, because src/ritual/ may not use Intl (purity test U13).
// Every piece of ritual text comes from here, and every line is from voice-and-honesty.md
// (sections 5.1 to 5.5, 5.8 and 5.10). Change a line in the voice document first, then here.
// Pure: no clock, locale or time zone is read. Dates use the display context passed in, and
// "UTC" is shown when that context is the UTC fallback (O21). Unknown stays unknown: nothing
// here turns a missing value into 0 or "None".
import { ageInMonths } from '../ritual/dates';
import type { DisplayContext } from '../ritual/types';
import type {
  AnyFinding,
  Condition,
  ConditionId,
  Evidence,
  FindingId,
  PlanItem,
  PlanRuleId,
  RevivedRecord,
  Stage,
} from '../ritual/types';

// ---------------------------------------------------------------- dates and ages

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "1 minute", "5 minutes". Uses the singular for exactly 1. */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Time between two instants as a plain phrase without "ago": "8 minutes", "2 hours", "3 days". */
export function describeAge(from: string, now: string): string {
  const elapsed = Math.max(0, new Date(now).getTime() - new Date(from).getTime());
  if (!Number.isFinite(elapsed)) return countOf(0, 'minute');
  if (elapsed < HOUR_MS) return countOf(Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return countOf(Math.floor(elapsed / HOUR_MS), 'hour');
  return countOf(Math.floor(elapsed / DAY_MS), 'day');
}

/** True when the fallback zone is in use, so every date carries the label "UTC" (O21). */
function isUtcFallback(context: DisplayContext): boolean {
  return context.timeZone === 'UTC';
}

export function utcSuffix(context: DisplayContext): string {
  return isUtcFallback(context) ? ' UTC' : '';
}

export function formatDate(iso: string, context: DisplayContext): string {
  try {
    const text = new Intl.DateTimeFormat(context.locale, { dateStyle: 'medium', timeZone: context.timeZone }).format(new Date(iso));
    return `${text}${utcSuffix(context)}`;
  } catch {
    return `${iso.slice(0, 10)} UTC`;
  }
}

/** "14 months ago" or "3 days ago". Null for a date in the future (the date alone is shown then). */
export function relativeAge(date: string, referenceTime: string): string | null {
  if (new Date(date).getTime() > new Date(referenceTime).getTime()) return null;
  const months = ageInMonths(date, referenceTime);
  if (months >= 1) return `${countOf(months, 'month')} ago`;
  return `${describeAge(date, referenceTime)} ago`;
}

export function lastUpdatedFact(pushedAt: string | null, referenceTime: string, context: DisplayContext): string {
  if (pushedAt === null) return 'Last update date not available';
  const relative = relativeAge(pushedAt, referenceTime);
  const date = formatDate(pushedAt, context);
  return relative === null ? `Last updated ${date}` : `Last updated ${relative} (${date})`;
}

// ---------------------------------------------------------------- stages and conditions

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  necropsy: 'Necropsy',
  plan: 'Plan',
  rising: 'Rising',
  living: 'The Living',
};

export const STAGE_ORDER: readonly Stage[] = ['necropsy', 'plan', 'rising', 'living'];

const CONDITION_LABELS: Readonly<Record<ConditionId, string>> = {
  archived: 'Archived',
  empty: 'Empty',
  'last-update-unknown': 'Last update not available',
  'recently-updated': 'Recently updated',
  resting: 'Resting',
  dormant: 'Dormant',
};

export function conditionLabel(id: ConditionId): string {
  return CONDITION_LABELS[id];
}

/** The label always sits next to the observed fact: "Resting · Last updated 14 months ago (…)". */
export function conditionLine(
  condition: Pick<Condition, 'id'>,
  pushedAt: string | null,
  referenceTime: string,
  context: DisplayContext,
): string {
  const fact = lastUpdatedFact(pushedAt, referenceTime, context);
  // "Last update not available" is both the label and the fact. Show it once.
  if (condition.id === 'last-update-unknown') return fact;
  return `${CONDITION_LABELS[condition.id]} · ${fact}`;
}

// ---------------------------------------------------------------- findings

const FINDING_LABELS: Readonly<Record<FindingId, string>> = {
  renamed: 'Renamed',
  archived: 'Archived',
  empty: 'Empty repository',
  'last-update': 'Last update',
  'latest-commit': 'Latest commit',
  fork: 'Fork',
  readme: 'README',
  'open-issues': 'Open issues',
  'oldest-open-issue': 'Oldest open issue',
  'recent-authors': 'Recent authors',
  branches: 'Branches',
  ci: 'Automated checks (CI)',
  'dependency-file': 'Dependency file',
};

const COULDNT_CHECK: Readonly<Record<FindingId, string>> = {
  renamed: 'Rename information couldn\'t be checked',
  archived: 'Archive status couldn\'t be checked',
  empty: 'Whether this repository has commits couldn\'t be checked',
  'last-update': 'Last update date not available',
  'latest-commit': 'Latest commit couldn\'t be checked',
  fork: 'Fork status couldn\'t be checked',
  readme: 'README couldn\'t be checked',
  'open-issues': 'Open issues couldn\'t be checked',
  'oldest-open-issue': 'Oldest open issue couldn\'t be checked',
  'recent-authors': 'Recent authors couldn\'t be checked',
  branches: 'Branch count couldn\'t be checked',
  ci: 'Workflow runs couldn\'t be checked',
  'dependency-file': 'Dependency file couldn\'t be checked',
};

export type FindingStatus = 'available' | 'unavailable' | 'not-applicable';
export type FindingText = {
  readonly label: string;
  /** The observed fact, or the "couldn't be checked" / "not applicable" line. */
  readonly fact: string;
  readonly status: FindingStatus;
};

function atLeast(count: number, isLowerBound: boolean, singular: string, plural: string): string {
  const noun = count === 1 ? singular : plural;
  return isLowerBound ? `At least ${count} ${noun}` : `${count} ${noun}`;
}

function notApplicableText(finding: AnyFinding): string {
  if (finding.reason === 'issues-disabled') return 'Not applicable: issues are turned off';
  return 'Not applicable: this repository has no commits yet';
}

/** The observed fact for an `available` finding. */
function availableFact(finding: AnyFinding, referenceTime: string, context: DisplayContext): string {
  switch (finding.id) {
    case 'renamed': {
      const value = finding.value;
      return value === null ? COULDNT_CHECK.renamed : `Now named ${value.owner}/${value.name} (you opened ${value.renamedFrom})`;
    }
    case 'archived':
      return 'Archived on GitHub';
    case 'empty':
      return 'This repository has no commits yet';
    case 'last-update':
      return lastUpdatedFact(finding.value?.pushedAt ?? null, referenceTime, context);
    case 'fork':
      return 'A fork of another repository';
    case 'latest-commit': {
      const value = finding.value;
      if (value === null) return COULDNT_CHECK['latest-commit'];
      const date = formatDate(value.date, context);
      return value.author === null ? `Latest commit on ${date}` : `Latest commit on ${date} by ${value.author}`;
    }
    case 'readme':
      return finding.value?.found ? 'README found' : 'No README found';
    case 'open-issues': {
      const value = finding.value;
      if (value === null) return COULDNT_CHECK['open-issues'];
      if (value.count === 0) {
        return value.isLowerBound ? 'No open issue found. The count may be incomplete.' : 'No open issues';
      }
      return atLeast(value.count, value.isLowerBound, 'open issue', 'open issues');
    }
    case 'oldest-open-issue':
      return finding.value === null ? COULDNT_CHECK['oldest-open-issue'] : `Oldest open issue from ${formatDate(finding.value.createdAt, context)}`;
    case 'recent-authors': {
      const value = finding.value;
      if (value === null) return COULDNT_CHECK['recent-authors'];
      const noun = value.authorCount === 1 ? 'person' : 'people';
      return `${value.isLowerBound ? 'At least ' : ''}${value.authorCount} ${noun} committed in the last 12 months`;
    }
    case 'branches': {
      const value = finding.value;
      return value === null ? COULDNT_CHECK.branches : atLeast(value.count, value.isLowerBound, 'branch', 'branches');
    }
    case 'ci': {
      const value = finding.value;
      if (value === null) return COULDNT_CHECK.ci;
      if (!value.found) return 'No workflow runs found';
      const result = value.conclusion ?? 'no result yet';
      return value.date === null ? `Latest workflow run: ${result}` : `Latest workflow run: ${result} on ${formatDate(value.date, context)}`;
    }
    case 'dependency-file': {
      const value = finding.value;
      if (value === null) return COULDNT_CHECK['dependency-file'];
      if (value.fileName === null) return 'No dependency file found in the root folder';
      return value.lastChangedAt === null
        ? `${value.fileName} found`
        : `${value.fileName} last changed on ${formatDate(value.lastChangedAt, context)}`;
    }
  }
}

export function findingText(finding: AnyFinding, referenceTime: string, context: DisplayContext): FindingText {
  const label = FINDING_LABELS[finding.id];
  if (finding.state === 'not-applicable') return { label, fact: notApplicableText(finding), status: 'not-applicable' };
  if (finding.state === 'unavailable') {
    const fact =
      finding.reason === 'rate-limited'
        ? `${label} couldn't be checked because GitHub ran out of lookups.`
        : `${COULDNT_CHECK[finding.id]}.`;
    return { label, fact: fact.replace(/\.\.$/, '.'), status: 'unavailable' };
  }
  return { label, fact: availableFact(finding, referenceTime, context), status: 'available' };
}

export const FINDING_UI = {
  leadsToStep: 'Leads to a suggested step',
  noteLabel: 'Note:',
  factsHeading: 'What we could see',
  notApplicableHeading: 'Not applicable',
  conditionHeading: 'Condition',
  conditionNoteLabel: 'Note:',
} as const;

// ---------------------------------------------------------------- plan

export const PLAN_TEXT = {
  intro: "Here's a suggested plan based on what we could see on GitHub.",
  empty: "We didn't find anything to suggest from what we could see.",
  archivedNote:
    "These steps are suggestions only. We can't tell whether they can be done while this repository stays archived.",
  changedNote:
    'This plan changed because newer GitHub data was available. Your ticks are kept, and progress now counts the current steps.',
  notChecked: "These couldn't be checked, so we have no suggestion based on them:",
  showEvidence: 'Show evidence',
  hideEvidence: 'Hide evidence',
  evidenceHeading: 'From GitHub',
  derivedHeading: 'Calculated by GRAVEREPO',
} as const;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The observed fact behind a plan item, in the form used after "Because". */
export function planBecauseFact(item: PlanItem, context: DisplayContext): string {
  const date = stringOf(item.because.date);
  const dateText = date === null ? null : formatDate(date, context);
  switch (item.id) {
    case 'review-archived':
      return 'Archived on GitHub';
    case 'add-first-commit':
      return 'This repository has no commits yet';
    case 'add-readme':
      return 'No README found';
    case 'review-latest-commit':
      return dateText === null ? 'Latest commit found' : `Latest commit on ${dateText}`;
    case 'check-dependencies': {
      const file = stringOf(item.because.file) ?? 'The dependency file';
      return dateText === null ? `${file} found` : `${file} last changed on ${dateText}`;
    }
    case 'check-workflow-run': {
      const result = stringOf(item.because.conclusion) ?? 'no result yet';
      return dateText === null ? `Latest workflow run: ${result}` : `Latest workflow run: ${result} on ${dateText}`;
    }
    case 'review-open-issues': {
      const count = typeof item.because.count === 'number' ? item.because.count : null;
      if (count === null) return 'Open issues found';
      return atLeast(count, item.because.isLowerBound === true, 'open issue', 'open issues');
    }
  }
}

const STEP_TEXT: Readonly<Record<PlanRuleId, string>> = {
  'review-archived': 'decide whether this repository should stay archived',
  'add-first-commit': 'add a first commit so there is something to build on',
  'add-readme': 'add a README that says what this project does',
  'review-latest-commit': 'read the latest commit and note where you left off',
  'check-dependencies': 'check whether the dependencies in {file} still install',
  'check-workflow-run': 'look at the latest workflow run and see what its result tells you',
  'review-open-issues': 'look through the open issues, starting with the oldest',
};

/** The suggested step, in the form used after "you could". */
export function planStepText(item: PlanItem): string {
  if (item.id === 'review-open-issues' && item.step.startWithOldest !== true) {
    return 'look through the open issues';
  }
  return STEP_TEXT[item.id].replace('{file}', stringOf(item.step.file) ?? 'the dependency file');
}

export type PlanItemText = {
  readonly fact: string;
  readonly step: string;
  /** "Because {fact}, you could {step}." */
  readonly sentence: string;
  /** The short form for a checkbox label. */
  readonly checklistLabel: string;
};

export function planItemText(item: PlanItem, context: DisplayContext): PlanItemText {
  const fact = planBecauseFact(item, context);
  const step = planStepText(item);
  // A dependency file name keeps its own capitals. Fixed facts start with a capital that is lowered mid-sentence.
  const factInSentence = item.id === 'check-dependencies' ? fact : lowerFirst(fact);
  return {
    fact,
    step,
    sentence: `Because ${factInSentence}, you could ${step}.`,
    checklistLabel: step.charAt(0).toUpperCase() + step.slice(1),
  };
}

/** Short text for an evidence entry: the raw field and the value read from it. */
export function evidenceText(evidence: Evidence): { field: string; value: string } {
  const raw = evidence.value;
  const value = raw === null || raw === undefined ? 'Not available' : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return { field: evidence.field, value };
}

/** Section names for the "couldn't be checked" list. */
export function findingLabel(id: FindingId): string {
  return FINDING_LABELS[id];
}

// ---------------------------------------------------------------- rising, revive, living

export function risingProgressText(done: number, total: number): string {
  if (total === 0) return 'No steps';
  if (done === 0) return 'Nothing planted yet';
  if (done >= total) return 'All steps done. Ready to mark as revived.';
  return `${done} of ${countOf(total, 'step')} done`;
}

export function reviveDisabledText(remaining: number): string {
  return `${remaining} ${remaining === 1 ? 'step' : 'steps'} left before you can mark this repository as revived in GRAVEREPO.`;
}

export const RISING_TEXT = {
  saved: 'Progress saved on this device',
  cannotSave: "We couldn't save your progress on this device. It will be lost when you close this page.",
  markRevived: 'Mark as revived in GRAVEREPO',
  confirmation: 'Marked as revived in GRAVEREPO. This is saved on this device only.',
  progressLabel: 'Progress',
  checklistLabel: 'Steps to tick off',
  lockedNote: 'This repository is marked as revived here, so its steps are locked.',
} as const;

export const LIVING_TEXT = {
  title: 'The Living',
  note: "GRAVEREPO doesn't change anything on GitHub.",
  empty: 'No revived repositories yet. Finish a ritual and it will grow here.',
  archivedLabel: 'Archived on GitHub',
  viewOnGitHub: 'View on GitHub',
} as const;

export function livingCaption(record: Pick<RevivedRecord, 'revivedAt'>, context: DisplayContext): string {
  return `Revived in GRAVEREPO on ${formatDate(record.revivedAt, context)}`;
}

export function sourceLabel(source: 'demo' | 'live'): string {
  return source === 'demo' ? 'Demo graveyard' : 'GitHub search';
}

// ---------------------------------------------------------------- loading and states

export const NECROPSY_TEXT = {
  heading: 'Necropsy',
  loading: 'Checking this repository…',
  pendingEstimate: "GitHub may run out of lookups before we finish checking this repository. We'll show what we can.",
  nothingToShow: 'Nothing to show yet.',
  back: 'Back to the graveyard',
  continue: 'Continue to the plan',
  renamedNote: 'This repository has a new official name.',
  stillChecking: 'Still checking',
} as const;
