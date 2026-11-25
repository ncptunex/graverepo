// Adapters for `commits` (task 5.4): latest commit, recent authors and manifest last change.
// - The commit date is the committer date (Req 5.10), matching how GitHub's `since` works.
// - Authors are identified by login, otherwise by name, never by email (D14, Req 13.2).
// - GitHub answers 409 for a repository with no commits. That marks the repository empty
//   and makes these sections `not-applicable: empty-repository` (Req 6.3).
// - 100 commits returned means the author count is a lower bound (Req 5.9).
import type { HttpResponseLike } from '../http-response';
import { commitListSchema, type GitHubCommit } from '../schemas/sections';
import type {
  FieldResult,
  LatestCommitValue,
  ManifestValue,
  RecentAuthorsValue,
} from '../types';
import { available, emptyRepository, isUsableSuccess, sectionFailure } from './adapter-result';

const PAGE_LIMIT = 100;
const SHORT_SHA_LENGTH = 7;

/** GitHub's status for "Git Repository is empty". */
export const EMPTY_REPOSITORY_STATUS = 409;

type CommitList = readonly GitHubCommit[];

function readCommitList(response: HttpResponseLike): CommitList | null {
  const parsed = commitListSchema.safeParse(response.body);
  return parsed.success ? parsed.data : null;
}

function authorOf(commit: GitHubCommit): string | null {
  return commit.author?.login ?? commit.commit.author?.name ?? null;
}

/** From `commits?per_page=1`. */
export function adaptLatestCommit(response: HttpResponseLike): FieldResult<LatestCommitValue> {
  if (response.status === EMPTY_REPOSITORY_STATUS) return emptyRepository();
  if (!isUsableSuccess('commits', response)) return sectionFailure('commits', response);

  const commits = readCommitList(response);
  // A non-empty repository always has a commit, so an empty list is not a usable answer.
  const latest = commits?.[0];
  if (latest === undefined) return { status: 'unavailable', reason: 'unexpected-response' };
  return available({
    date: latest.commit.committer.date,
    shortSha: latest.sha.slice(0, SHORT_SHA_LENGTH),
    url: latest.html_url,
    author: authorOf(latest),
  });
}

/** From `commits?since={windowStart}&per_page=100`. Counts distinct authors. */
export function adaptRecentAuthors(
  response: HttpResponseLike,
  windowStart: string,
): FieldResult<RecentAuthorsValue> {
  if (response.status === EMPTY_REPOSITORY_STATUS) return emptyRepository();
  if (!isUsableSuccess('commits', response)) return sectionFailure('commits', response);

  const commits = readCommitList(response);
  if (commits === null) return { status: 'unavailable', reason: 'unexpected-response' };

  // Logins are case-insensitive on GitHub. Names are kept as written.
  // Commits with neither a login nor a name can't be told apart, so they aren't counted.
  const authors = new Set<string>();
  for (const commit of commits) {
    const login = commit.author?.login;
    const name = commit.commit.author?.name;
    if (login) authors.add(`login:${login.toLowerCase()}`);
    else if (name) authors.add(`name:${name}`);
  }
  return available({
    windowStart,
    authorCount: authors.size,
    isLowerBound: commits.length >= PAGE_LIMIT,
    commitsRead: commits.length,
  });
}

/**
 * The latest commit is outside the activity window, so no request is sent and zero
 * recent authors are reported (Req 4.7). This is a calculated value, not a guess.
 */
export function recentAuthorsSkipped(windowStart: string): FieldResult<RecentAuthorsValue> {
  return available({ windowStart, authorCount: 0, isLowerBound: false, commitsRead: 0 });
}

/** From `commits?path={manifest}&per_page=1`. */
export function adaptManifestLastChange(
  response: HttpResponseLike,
  fileName: string,
): FieldResult<ManifestValue> {
  if (response.status === EMPTY_REPOSITORY_STATUS) return emptyRepository();
  if (!isUsableSuccess('commits', response)) return sectionFailure('commits', response);

  const latest = readCommitList(response)?.[0];
  if (latest === undefined) return { status: 'unavailable', reason: 'unexpected-response' };
  return available({
    fileName,
    lastChangedAt: latest.commit.committer.date,
    commitUrl: latest.html_url,
  });
}

/** The root folder has no known manifest (Req 4.9). No request is sent. */
export function manifestNotFound(): FieldResult<ManifestValue> {
  return available({ fileName: null, lastChangedAt: null, commitUrl: null });
}
