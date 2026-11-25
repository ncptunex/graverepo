// GRAVEREPO's own data types for GitHub data (data-layer design 5.1–5.8 and 5.10).
// The UI, the ritual and application state rely on these shapes. Raw GitHub objects
// never leave `src/data/github/`.
//
// Conventions (Req 5.3, 5.4, 5.7):
// - Dates are ISO 8601 strings in UTC.
// - Counts are whole numbers of zero or more, or null when unknown. Unknown is never 0.
// - Missing optional text is null, never placeholder text.

import type { DataError, ErrorKind } from './errors/error-kinds';

/** Design 5.1. One provenance per result; a repository detail has one for the whole detail. */
export type Provenance = {
  readonly source: 'live' | 'cache' | 'demo';
  readonly route: 'direct' | 'proxy' | 'bundled';
  /** When GitHub was contacted, or the capture date for demo data. */
  readonly fetchedAt: string;
  /** True if served from cache after its freshness window. */
  readonly stale: boolean;
};

/** Design 5.2. */
export type RateLimitStatus = {
  readonly route: 'direct' | 'proxy';
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetAt: string | null;
  readonly tokenUsed: boolean;
  readonly blockedUntil: string | null;
};

/** Design 5.10. Warnings sit alongside successful data and are not errors. */
export type Warning =
  | { readonly kind: 'partial-list'; readonly retrievedCount: number }
  | {
      readonly kind: 'truncated-list';
      readonly retrievedCount: number;
      readonly totalCount: number;
    }
  | {
      readonly kind: 'dropped-items';
      readonly invalidCount: number;
      readonly privateCount: number;
    }
  | {
      readonly kind: 'may-not-complete';
      readonly estimate: number;
      readonly budget: number;
      readonly resetAt: string | null;
    }
  | {
      readonly kind: 'stale-data';
      /** Age of the served entry in milliseconds. */
      readonly ageMs: number;
      readonly refreshErrorKind: ErrorKind;
    };

/** Design 5.3. What every public data-layer function returns. Functions never throw. */
export type DataResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly provenance: Provenance;
      readonly warnings: readonly Warning[];
      readonly rateLimit: RateLimitStatus;
      /** Set when stale cached data is served because a refresh failed (Req 7.5). */
      readonly refreshError?: DataError;
    }
  | {
      readonly ok: false;
      readonly error: DataError;
      readonly rateLimit: RateLimitStatus;
    };

/** Design 5.4. */
export type UserProfile = {
  /** The login exactly as GitHub spells it. */
  readonly login: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly profileUrl: string;
  readonly accountType: 'user' | 'organisation';
  readonly publicRepoCount: number | null;
};

/** Design 5.5. Used for tombstones and as the core of a repository detail. */
export type RepositorySummary = {
  readonly id: number;
  readonly owner: string;
  readonly name: string;
  /** Calculated: `owner/name`. */
  readonly fullName: string;
  readonly url: string;
  readonly description: string | null;
  readonly primaryLanguage: string | null;
  readonly stars: number | null;
  readonly forks: number | null;
  /** GitHub's `open_issues_count`, which includes pull requests (Req 5.5). */
  readonly openIssuesAndPullRequestsCount: number | null;
  readonly hasIssues: boolean | null;
  readonly isFork: boolean;
  readonly isArchived: boolean;
  readonly defaultBranch: string | null;
  readonly createdAt: string | null;
  readonly pushedAt: string | null;
  readonly sizeKb: number | null;
};

/** Design 5.6. */
export type RepositoryList = {
  readonly owner: UserProfile;
  readonly repositories: readonly RepositorySummary[];
  readonly retrievedCount: number;
  readonly totalPublicCount: number | null;
  readonly truncated: boolean;
  readonly partial: boolean;
  readonly droppedInvalidCount: number;
  readonly droppedPrivateCount: number;
};

/** Reasons a section is `not-applicable` (design 5.7). */
export type NotApplicableReason = 'empty-repository' | 'issues-disabled' | 'section-disabled';

/**
 * Design 5.7. The outcome of one detail section.
 * `unavailable` carries an error kind; `rate-limited` is also used when the budget ran out
 * part-way through a detail and the section's request was never sent (design 3.5).
 */
export type FieldResult<T> =
  | { readonly status: 'available'; readonly value: T }
  | { readonly status: 'unavailable'; readonly reason: ErrorKind }
  | { readonly status: 'not-applicable'; readonly reason: NotApplicableReason };

export type ReadmeValue = {
  readonly found: boolean;
  /** Web URL of the README, when found. */
  readonly url: string | null;
};

export type LatestCommitValue = {
  /** The committer date (Req 5.10). */
  readonly date: string;
  readonly shortSha: string;
  readonly url: string;
  /** GitHub login where available, otherwise the author name (D14). Never an email. */
  readonly author: string | null;
};

export type RecentAuthorsValue = {
  /** Start of the 12-month activity window that was searched. */
  readonly windowStart: string;
  readonly authorCount: number;
  /** True when 100 commits came back, so more authors may exist (Req 5.9). */
  readonly isLowerBound: boolean;
  /** Number of commits read. 0 when the request was skipped (Req 4.7). */
  readonly commitsRead: number;
};

export type OldestOpenIssue = {
  readonly createdAt: string;
  readonly number: number;
  readonly url: string;
};

export type OpenIssuesValue = {
  /** Open items excluding pull requests (Req 5.6). */
  readonly count: number;
  /** True when 100 items came back, so more may exist (Req 5.9). */
  readonly isLowerBound: boolean;
  /** Calculated from the repository's web URL. */
  readonly issuesPageUrl: string;
  /** Number of open items (issues and pull requests) GitHub returned. At most 100. */
  readonly itemsRead: number;
  /** The first non-pull-request item in oldest-first order, or null if none was returned. */
  readonly oldest: OldestOpenIssue | null;
  /**
   * True only when 100 items came back and all were pull requests. The oldest issue is then
   * "not found in the first 100 open items", which is different from "no open issues" (design 3.2).
   */
  readonly oldestNotFoundInFirst100: boolean;
};

export type BranchesValue = {
  readonly count: number;
  readonly isLowerBound: boolean;
};

export type CiValue =
  | { readonly found: false }
  | {
      readonly found: true;
      /** The latest run's conclusion, or null while it is still running. */
      readonly conclusion: string | null;
      readonly date: string | null;
      readonly url: string;
    };

export type ManifestValue = {
  /** The first known manifest in the root folder, or null when none was found. */
  readonly fileName: string | null;
  readonly lastChangedAt: string | null;
  readonly commitUrl: string | null;
};

export type RepositorySections = {
  readonly readme: FieldResult<ReadmeValue>;
  readonly latestCommit: FieldResult<LatestCommitValue>;
  readonly recentAuthors: FieldResult<RecentAuthorsValue>;
  readonly openIssues: FieldResult<OpenIssuesValue>;
  readonly branches: FieldResult<BranchesValue>;
  readonly ci: FieldResult<CiValue>;
  readonly manifest: FieldResult<ManifestValue>;
};

/** Design 5.7. The provenance for the whole detail is held in the data result. */
export type RepositoryDetail = {
  /** Repository summary under its official name. */
  readonly core: RepositorySummary;
  /** The requested `owner/name` when it differs from the official name (Req 6.11). */
  readonly renamedFrom: string | null;
  readonly isEmpty: boolean;
  readonly sections: RepositorySections;
};

/** Design 5.8. */
export type DemoGraveyard = {
  readonly capturedAt: string;
  readonly sourceAccounts: readonly UserProfile[];
  readonly repositories: readonly RepositorySummary[];
  /** One detail per repository. */
  readonly details: readonly RepositoryDetail[];
};
