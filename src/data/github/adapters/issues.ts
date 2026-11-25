// Adapter for the merged `issues` request (task 5.5, design 3.2):
// `issues?state=open&sort=created&direction=asc&per_page=100`.
// - Items are oldest first and include pull requests, which are not counted (Req 5.6).
// - The oldest open issue is the first non-pull-request item.
// - 100 items returned means the count is a lower bound (Req 5.9).
// - If all 100 are pull requests, the oldest issue was "not found in the first 100 open
//   items". That is different from "no open issues".
import type { HttpResponseLike } from '../http-response';
import { issueListSchema } from '../schemas/sections';
import type { FieldResult, OpenIssuesValue } from '../types';
import { available, isUsableSuccess, sectionFailure } from './adapter-result';

const PAGE_LIMIT = 100;

/** GitHub answers 410 when issues are turned off for the repository. */
const ISSUES_DISABLED_STATUS = 410;

export function adaptOpenIssues(
  response: HttpResponseLike,
  repositoryUrl: string,
): FieldResult<OpenIssuesValue> {
  if (response.status === ISSUES_DISABLED_STATUS) {
    return { status: 'not-applicable', reason: 'issues-disabled' };
  }
  if (!isUsableSuccess('issues', response)) return sectionFailure('issues', response);

  const parsed = issueListSchema.safeParse(response.body);
  if (!parsed.success) return { status: 'unavailable', reason: 'unexpected-response' };

  const items = parsed.data;
  const issues = items.filter((item) => item.pull_request === undefined || item.pull_request === null);
  const isLowerBound = items.length >= PAGE_LIMIT;
  const first = issues[0];
  return available({
    count: issues.length,
    isLowerBound,
    issuesPageUrl: `${repositoryUrl}/issues`,
    itemsRead: items.length,
    oldest: first ? { createdAt: first.created_at, number: first.number, url: first.html_url } : null,
    oldestNotFoundInFirst100: first === undefined && isLowerBound,
  });
}
