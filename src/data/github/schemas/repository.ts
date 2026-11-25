// Repository schema, shared by `user-repos`, `org-repos` and `repo` (task 5.2).
// Required (Req 6.1 and design 5.5): id, name, owner login, web URL, fork and archived flags.
// `private: false` and `visibility: "public"` are required so that only confirmed public
// repositories pass (Req 13.3). They are read for filtering only and are not stored.
import { z } from 'zod';
import {
  optionalBoolean,
  optionalCount,
  optionalIsoDate,
  optionalText,
  requiredHttpsUrl,
  requiredText,
} from './fields';

export const repositorySchema = z.object({
  id: z.number().int().nonnegative(),
  name: requiredText,
  owner: z.object({ login: requiredText }),
  html_url: requiredHttpsUrl,
  private: z.literal(false),
  visibility: z.literal('public'),
  fork: z.boolean(),
  archived: z.boolean(),
  description: optionalText,
  language: optionalText,
  stargazers_count: optionalCount,
  forks_count: optionalCount,
  open_issues_count: optionalCount,
  has_issues: optionalBoolean,
  default_branch: optionalText,
  created_at: optionalIsoDate,
  pushed_at: optionalIsoDate,
  size: optionalCount,
});

export type GitHubRepository = z.output<typeof repositorySchema>;

/**
 * True when GitHub marks the item as private or not public. Checked before the schema,
 * so such an item is counted as private rather than as invalid.
 */
export function isMarkedNonPublic(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  if (record.private === true) return true;
  return typeof record.visibility === 'string' && record.visibility !== 'public';
}
