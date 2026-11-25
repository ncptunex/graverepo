// Zod schemas for the normalised data stored in the browser cache.
// Data read back from `localStorage` is untrusted (tech.md section 5), so it is checked
// before use. A value that does not match is treated as missing and deleted.
// Each schema is typed against the data-layer type, so a change to a type breaks the build here.
import { z } from 'zod';
import { ERROR_KINDS } from '../github/errors/error-kinds';
import type {
  FieldResult,
  RepositoryDetail,
  RepositoryList,
  RepositorySummary,
  UserProfile,
} from '../github/types';

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date');
const count = z.number().int().nonnegative();

export const userProfileSchema: z.ZodType<UserProfile> = z.object({
  login: z.string().min(1),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  profileUrl: z.string(),
  accountType: z.enum(['user', 'organisation']),
  publicRepoCount: count.nullable(),
});

export const repositorySummarySchema: z.ZodType<RepositorySummary> = z.object({
  id: count,
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  url: z.string(),
  description: z.string().nullable(),
  primaryLanguage: z.string().nullable(),
  stars: count.nullable(),
  forks: count.nullable(),
  openIssuesAndPullRequestsCount: count.nullable(),
  hasIssues: z.boolean().nullable(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  defaultBranch: z.string().nullable(),
  createdAt: isoDate.nullable(),
  pushedAt: isoDate.nullable(),
  sizeKb: count.nullable(),
});

export const repositoryListSchema: z.ZodType<RepositoryList> = z.object({
  owner: userProfileSchema,
  repositories: z.array(repositorySummarySchema),
  retrievedCount: count,
  totalPublicCount: count.nullable(),
  truncated: z.boolean(),
  partial: z.boolean(),
  droppedInvalidCount: count,
  droppedPrivateCount: count,
});

function fieldResult<T>(value: z.ZodType<T>): z.ZodType<FieldResult<T>> {
  return z.union([
    z.object({ status: z.literal('available'), value }),
    z.object({ status: z.literal('unavailable'), reason: z.enum(ERROR_KINDS) }),
    z.object({
      status: z.literal('not-applicable'),
      reason: z.enum(['empty-repository', 'issues-disabled', 'section-disabled']),
    }),
  ]);
}

export const repositoryDetailSchema: z.ZodType<RepositoryDetail> = z.object({
  core: repositorySummarySchema,
  renamedFrom: z.string().nullable(),
  isEmpty: z.boolean(),
  sections: z.object({
    readme: fieldResult(z.object({ found: z.boolean(), url: z.string().nullable() })),
    latestCommit: fieldResult(
      z.object({ date: isoDate, shortSha: z.string(), url: z.string(), author: z.string().nullable() }),
    ),
    recentAuthors: fieldResult(
      z.object({ windowStart: isoDate, authorCount: count, isLowerBound: z.boolean(), commitsRead: count }),
    ),
    openIssues: fieldResult(
      z.object({
        count,
        isLowerBound: z.boolean(),
        issuesPageUrl: z.string(),
        itemsRead: count,
        oldest: z.object({ createdAt: isoDate, number: count, url: z.string() }).nullable(),
        oldestNotFoundInFirst100: z.boolean(),
      }),
    ),
    branches: fieldResult(z.object({ count, isLowerBound: z.boolean() })),
    ci: fieldResult(
      z.union([
        z.object({ found: z.literal(false) }),
        z.object({
          found: z.literal(true),
          conclusion: z.string().nullable(),
          date: isoDate.nullable(),
          url: z.string(),
        }),
      ]),
    ),
    manifest: fieldResult(
      z.object({
        fileName: z.string().nullable(),
        lastChangedAt: isoDate.nullable(),
        commitUrl: z.string().nullable(),
      }),
    ),
  }),
});
