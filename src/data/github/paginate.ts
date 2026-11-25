// The pagination helper (task 9.2, design 4.5; Req 3, 2.6, 13.3).
// It follows the `nextPage` number from GitHub's `Link` header, never a guessed page number,
// stops at 300 repositories, and keeps what it has when a later page fails.
// It is a pure function over a `fetchPage` callback, so it can be tested without a network.
import type { DataError } from './errors/error-kinds';
import type { RepositorySummary } from './types';

/** Repository cap per account (D2, Req 3.4). */
export const REPOSITORY_CAP = 300;
/** Pages of 100 needed to reach the cap. The catalogue allows page 1 to 3 only. */
export const MAX_REPOSITORY_PAGES = 3;

export type PageOutcome =
  | {
      readonly ok: true;
      readonly repositories: readonly RepositorySummary[];
      readonly droppedInvalidCount: number;
      readonly droppedPrivateCount: number;
      /** Page number from the `Link` header's `rel="next"`, or null. */
      readonly nextPage: number | null;
      readonly fetchedAt: string;
    }
  | { readonly ok: false; readonly error: DataError };

export type CollectedRepositories = {
  /** Sorted, at most 300. */
  readonly repositories: readonly RepositorySummary[];
  readonly retrievedCount: number;
  readonly totalPublicCount: number | null;
  readonly truncated: boolean;
  readonly partial: boolean;
  readonly droppedInvalidCount: number;
  readonly droppedPrivateCount: number;
  /** When GitHub was contacted for the first page. */
  readonly fetchedAt: string;
};

export type CollectResult =
  | { readonly ok: true; readonly value: CollectedRepositories }
  | { readonly ok: false; readonly error: DataError };

function pushTime(repository: RepositorySummary): number | null {
  if (repository.pushedAt === null) return null;
  const time = Date.parse(repository.pushedAt);
  return Number.isNaN(time) ? null : time;
}

/** Most recent push first. Repositories with no push date go last. The sort is stable (Req 2.6). */
export function sortRepositoriesByPush(
  repositories: readonly RepositorySummary[],
): RepositorySummary[] {
  return [...repositories].sort((a, b) => {
    const timeA = pushTime(a);
    const timeB = pushTime(b);
    if (timeA === null && timeB === null) return 0;
    if (timeA === null) return 1;
    if (timeB === null) return -1;
    return timeB - timeA;
  });
}

export async function collectRepositoryPages(
  fetchPage: (page: number) => Promise<PageOutcome>,
  totalPublicCount: number | null,
): Promise<CollectResult> {
  const collected: RepositorySummary[] = [];
  let droppedInvalidCount = 0;
  let droppedPrivateCount = 0;
  let pagesRead = 0;
  let partial = false;
  // True when GitHub still had more pages but the cap stopped us.
  let moreAvailable = false;

  // A failing first page is an error (there is nothing to keep).
  const firstPage = await fetchPage(1);
  if (!firstPage.ok) return { ok: false, error: firstPage.error };
  const fetchedAt = firstPage.fetchedAt;

  let page = 1;
  let outcome: PageOutcome = firstPage;
  for (;;) {
    if (!outcome.ok) {
      // A failing later page keeps what we have (Req 3.6).
      partial = true;
      break;
    }
    pagesRead += 1;
    collected.push(...outcome.repositories);
    droppedInvalidCount += outcome.droppedInvalidCount;
    droppedPrivateCount += outcome.droppedPrivateCount;

    const next = outcome.nextPage;
    // No next link, or one that does not move forward: this was the last page.
    if (next === null || next <= page) break;
    if (collected.length >= REPOSITORY_CAP || pagesRead >= MAX_REPOSITORY_PAGES || next > MAX_REPOSITORY_PAGES) {
      moreAvailable = true;
      break;
    }
    page = next;
    outcome = await fetchPage(page);
  }

  let truncated = moreAvailable;
  if (collected.length > REPOSITORY_CAP) {
    collected.length = REPOSITORY_CAP;
    truncated = true;
  } else if (
    collected.length === REPOSITORY_CAP &&
    totalPublicCount !== null &&
    totalPublicCount > collected.length
  ) {
    truncated = true;
  }

  // Sorting happens after the cap so the 300 kept are in page order, which GitHub already
  // sorted by push. The final sort also orders items from different pages consistently.
  const repositories = sortRepositoriesByPush(collected);
  return {
    ok: true,
    value: {
      repositories,
      retrievedCount: repositories.length,
      totalPublicCount,
      truncated,
      partial,
      droppedInvalidCount,
      droppedPrivateCount,
      fetchedAt,
    },
  };
}
