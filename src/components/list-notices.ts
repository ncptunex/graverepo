// List notices (graveyard-dashboard task 2.5, design 4.3, R3.5, R3.6).
// Builds notices from the data layer's warnings and the list, using voice-and-honesty.md 5.9.
// Private repositories are never mentioned or counted. A stale copy is covered by the
// provenance label, so it is not repeated here.
import type { RepositoryList, Warning } from '../data/github';

export type ListNotice = {
  readonly id: 'truncated' | 'partial' | 'dropped-invalid';
  readonly variant: 'info' | 'warning';
  readonly text: string;
};

/**
 * Order: truncated, partial, dropped. A truncated notice needs the total, which the data layer
 * supplies in its warning only when it knows it, so no number is invented.
 * A partial list with an unknown total uses only the first sentence of the voice line, which
 * states no number. The "Showing {n}" variant is waiting for voice approval (dashboard design 8.1).
 */
export function listNotices(list: RepositoryList, warnings: readonly Warning[]): ListNotice[] {
  const notices: ListNotice[] = [];

  for (const warning of warnings) {
    if (warning.kind === 'truncated-list') {
      notices.push({
        id: 'truncated',
        variant: 'info',
        text: `Showing the ${warning.retrievedCount} most recently updated of ${warning.totalCount} repositories.`,
      });
    }
  }

  if (warnings.some((warning) => warning.kind === 'partial-list')) {
    const shown = list.retrievedCount;
    notices.push({
      id: 'partial',
      variant: 'warning',
      text:
        list.totalPublicCount === null
          ? "Some repositories couldn't be loaded."
          : `Some repositories couldn't be loaded. Showing ${shown} of ${list.totalPublicCount}.`,
    });
  }

  if (list.droppedInvalidCount > 0) {
    const count = list.droppedInvalidCount;
    notices.push({
      id: 'dropped-invalid',
      variant: 'info',
      text: count === 1 ? "1 repository couldn't be shown." : `${count} repositories couldn't be shown.`,
    });
  }

  return notices;
}
