// Schemas for the detail sections: readme, commits, issues, branches, workflow-runs and
// root-contents. Each describes only the fields GRAVEREPO reads.
import { z } from 'zod';
import {
  optionalHttpsUrl,
  optionalIsoDate,
  optionalText,
  requiredHttpsUrl,
  requiredIsoDate,
  requiredText,
} from './fields';

export const readmeSchema = z.object({
  html_url: optionalHttpsUrl,
});

/**
 * One commit from `commits`. The date is the committer date (Req 5.10).
 * Authors are identified by GitHub login, otherwise by name, never by email (D14).
 */
export const commitSchema = z.object({
  sha: z.string().min(7),
  html_url: requiredHttpsUrl,
  commit: z.object({
    committer: z.object({ date: requiredIsoDate }),
    author: z.object({ name: optionalText }).nullable().catch(null),
  }),
  author: z.object({ login: optionalText }).nullable().catch(null),
});

export const commitListSchema = z.array(commitSchema);

export type GitHubCommit = z.output<typeof commitSchema>;

/** One open item from `issues`. GitHub includes pull requests and marks them with `pull_request`. */
export const issueSchema = z.object({
  number: z.number().int().positive(),
  html_url: requiredHttpsUrl,
  created_at: requiredIsoDate,
  pull_request: z.unknown().optional(),
});

export const issueListSchema = z.array(issueSchema);

export const branchListSchema = z.array(z.object({ name: requiredText }));

export const workflowRunsSchema = z.object({
  total_count: z.number().int().nonnegative(),
  workflow_runs: z.array(
    z.object({
      html_url: requiredHttpsUrl,
      conclusion: optionalText,
      created_at: optionalIsoDate,
    }),
  ),
});

export const rootContentsSchema = z.array(
  z.object({
    name: requiredText,
    type: requiredText,
  }),
);
