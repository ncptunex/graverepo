// Adapters for `user-repos`, `org-repos` (one page of a list) and `repo` (task 5.2).
// Each list item is checked on its own, so one bad item is dropped without failing the
// whole page (design 4.6). Private and non-public items are dropped and counted
// separately from invalid items (Req 13.3, 6.1).
import { z } from 'zod';
import { makeError } from '../errors/error-kinds';
import { isMarkedNonPublic, repositorySchema, type GitHubRepository } from '../schemas/repository';
import type { RepositorySummary } from '../types';
import { adapted, unexpectedResponse, type AdapterResult } from './adapter-result';

export type RepositoryPage = {
  readonly repositories: readonly RepositorySummary[];
  readonly droppedInvalidCount: number;
  readonly droppedPrivateCount: number;
};

function toSummary(repo: GitHubRepository): RepositorySummary {
  return {
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: `${repo.owner.login}/${repo.name}`,
    url: repo.html_url,
    description: repo.description,
    primaryLanguage: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssuesAndPullRequestsCount: repo.open_issues_count,
    hasIssues: repo.has_issues,
    isFork: repo.fork,
    isArchived: repo.archived,
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    sizeKb: repo.size,
  };
}

/** One page of `user-repos` or `org-repos`. The body itself must be a list. */
export function adaptRepositoryPage(body: unknown): AdapterResult<RepositoryPage> {
  const list = z.array(z.unknown()).safeParse(body);
  if (!list.success) return unexpectedResponse();

  const repositories: RepositorySummary[] = [];
  let droppedInvalidCount = 0;
  let droppedPrivateCount = 0;
  for (const item of list.data) {
    if (isMarkedNonPublic(item)) {
      droppedPrivateCount += 1;
      continue;
    }
    const parsed = repositorySchema.safeParse(item);
    if (parsed.success) {
      repositories.push(toSummary(parsed.data));
    } else {
      droppedInvalidCount += 1;
    }
  }
  return adapted({ repositories, droppedInvalidCount, droppedPrivateCount });
}

/**
 * Core metadata from `repo`. A repository that GitHub marks as private or not public is
 * never returned (Req 13.3); it is reported as not found, as it isn't publicly visible.
 */
export function adaptRepository(body: unknown): AdapterResult<RepositorySummary> {
  if (isMarkedNonPublic(body)) return { ok: false, error: makeError('repo-not-found') };
  const parsed = repositorySchema.safeParse(body);
  if (!parsed.success) return unexpectedResponse();
  return adapted(toSummary(parsed.data));
}
