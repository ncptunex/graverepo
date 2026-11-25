// Graveyard filters (graveyard-dashboard task 2.2, design 4.1, R5.1, R5.2).
// Pure: no request, no clock, no storage. Never adds items, never reorders.
import type { RepositorySummary } from '../data/github';

export type GraveyardFilters = {
  readonly text: string;
  readonly includeForks: boolean;
  readonly includeArchived: boolean;
};

/** Nothing is hidden by default. */
export const DEFAULT_FILTERS: GraveyardFilters = { text: '', includeForks: true, includeArchived: true };

export function isFiltered(filters: GraveyardFilters): boolean {
  return (
    filters.text.trim() !== '' ||
    filters.includeForks !== DEFAULT_FILTERS.includeForks ||
    filters.includeArchived !== DEFAULT_FILTERS.includeArchived
  );
}

/**
 * Keeps a repository when its name or description contains the text (case-insensitive).
 * A `null` description never matches a non-empty text. Forks and archived repositories are
 * dropped when their switch is off. Keeps the original order and returns a new list.
 */
export function filterRepositories(
  repositories: readonly RepositorySummary[],
  filters: GraveyardFilters,
): RepositorySummary[] {
  const needle = filters.text.trim().toLowerCase();
  return repositories.filter((repository) => {
    if (!filters.includeForks && repository.isFork) return false;
    if (!filters.includeArchived && repository.isArchived) return false;
    if (needle === '') return true;
    if (repository.name.toLowerCase().includes(needle)) return true;
    return repository.description !== null && repository.description.toLowerCase().includes(needle);
  });
}
