// Provenance label text (graveyard-dashboard task 2.3, design 4.2, R3.3, DD9).
// Uses the labels in voice-and-honesty.md section 4.2. The label always follows the provenance of
// the result actually returned, never the action that was called: a live search can return a
// saved copy. Pure: `now` and the display context are arguments. The ritual's Necropsy reuses it.
import type { DataError, Provenance } from '../data/github';
import type { DisplayContext } from '../ritual/types';
import { describeAge, formatDate } from './wording';
import { errorText } from './error-text';

export { describeAge };

export type ProvenanceKind = 'fresh' | 'saved-copy' | 'saved-copy-stale' | 'demo' | 'none';

export type ProvenanceLabel = {
  readonly kind: ProvenanceKind;
  /** The label, or null for a combination the voice document has no label for. */
  readonly text: string | null;
  /** The exact fetch time (ISO), for a title attribute. */
  readonly exactTime: string;
};

export function describeProvenance(
  provenance: Provenance,
  refreshError: DataError | undefined,
  displayContext: DisplayContext,
  now: string,
): ProvenanceLabel {
  const exactTime = provenance.fetchedAt;

  if (provenance.source === 'demo') {
    return {
      kind: 'demo',
      text: `Demo graveyard, captured on ${formatDate(provenance.fetchedAt, displayContext)}`,
      exactTime,
    };
  }

  if (provenance.source === 'cache') {
    const base = `Saved copy from ${describeAge(provenance.fetchedAt, now)} ago`;
    if (provenance.stale && refreshError !== undefined) {
      const reason = errorText(refreshError, { displayContext, now }).lead;
      if (reason !== null) {
        return { kind: 'saved-copy-stale', text: `${base}. We couldn't refresh it: ${reason}`, exactTime };
      }
    }
    return { kind: 'saved-copy', text: base, exactTime };
  }

  // source is live. Only a result that is not stale is "fresh from GitHub".
  if (!provenance.stale) return { kind: 'fresh', text: 'Fresh from GitHub, just now', exactTime };

  // Live and stale is not a combination the voice document labels. Make no freshness claim.
  return { kind: 'none', text: null, exactTime };
}
