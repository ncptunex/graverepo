// Tombstone view model (graveyard-dashboard task 2.6, design 4.4, R4).
// Turns a repository summary into plain data for one card. It calls the ritual's
// `deriveCondition` (no thresholds here) and the wording module. No markup, no clock.
// The condition uses `isEmpty: null`, so "Empty" never appears on a card (O18).
import type { ProgressSource } from '../ritual/types';
import { deriveCondition } from '../ritual/condition';
import type { ConditionId, DisplayContext } from '../ritual/types';
import type { RepositorySummary } from '../data/github';
import { conditionLabel, lastUpdatedFact } from './wording';

export type TombstoneFlag = 'archived' | 'fork';

export type TombstoneView = {
  readonly key: string;
  readonly name: string;
  readonly owner: string;
  /** True for the demo, where repositories from several accounts are mixed (R8). */
  readonly showOwner: boolean;
  readonly description: string | null;
  readonly conditionId: ConditionId;
  readonly conditionLabel: string;
  /** "Last updated 14 months ago (3 Mar 2025)", date only for a future date, or "Last update date not available". */
  readonly fact: string;
  readonly flags: readonly TombstoneFlag[];
  readonly language: string | null;
  readonly accessibleName: string;
};

export const TOMBSTONE_TEXT = {
  noDescription: 'No description provided',
  archivedFlag: 'Archived on GitHub',
  forkFlag: 'Fork',
  openPrompt: 'Open to look at the evidence.',
} as const;

export function tombstoneView(
  summary: RepositorySummary,
  referenceTime: string,
  displayContext: DisplayContext,
  source: ProgressSource,
): TombstoneView {
  const condition = deriveCondition(
    { isArchived: summary.isArchived, isEmpty: null, pushedAt: summary.pushedAt },
    referenceTime,
  );
  const fact = lastUpdatedFact(summary.pushedAt, referenceTime, displayContext);
  const label = conditionLabel(condition.id);
  const flags: TombstoneFlag[] = [];
  if (summary.isArchived) flags.push('archived');
  if (summary.isFork) flags.push('fork');

  // The name must contain the text shown on the card, owner included in the demo (WCAG 2.5.3).
  const parts = [source === 'demo' ? `${summary.owner}/${summary.name}` : summary.name, label];
  // "Last update not available" is both the label and the fact. Say it once.
  if (condition.id !== 'last-update-unknown') parts.push(fact);
  if (flags.includes('archived')) parts.push(TOMBSTONE_TEXT.archivedFlag);
  if (flags.includes('fork')) parts.push(TOMBSTONE_TEXT.forkFlag);
  // The language and description are visible on the card too, so they are part of the name (WCAG 2.5.3),
  // in the same order as on screen.
  if (summary.primaryLanguage !== null) parts.push(summary.primaryLanguage);
  const description = summary.description !== null && summary.description.trim() !== '' ? summary.description : null;
  parts.push(description ?? TOMBSTONE_TEXT.noDescription);
  parts.push(TOMBSTONE_TEXT.openPrompt);

  return {
    key: `${summary.owner}/${summary.name}`.toLowerCase(),
    name: summary.name,
    owner: summary.owner,
    showOwner: source === 'demo',
    description: summary.description !== null && summary.description.trim() !== '' ? summary.description : null,
    conditionId: condition.id,
    conditionLabel: label,
    fact,
    flags,
    language: summary.primaryLanguage,
    accessibleName: parts.map((part) => (part.endsWith('.') ? part : `${part}.`)).join(' '),
  };
}
