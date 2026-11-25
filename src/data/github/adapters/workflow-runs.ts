// Adapter for `actions/runs?per_page=1` (task 5.7, optional section).
// No runs, or "not found", is the fact "no workflow runs found" (Req 6.5, design 3.2).
import type { HttpResponseLike } from '../http-response';
import { workflowRunsSchema } from '../schemas/sections';
import type { CiValue, FieldResult } from '../types';
import { available, isUsableSuccess, sectionFailure } from './adapter-result';

export function adaptWorkflowRuns(response: HttpResponseLike): FieldResult<CiValue> {
  if (response.status === 404) return available({ found: false });
  if (!isUsableSuccess('workflow-runs', response)) return sectionFailure('workflow-runs', response);

  const parsed = workflowRunsSchema.safeParse(response.body);
  if (!parsed.success) return { status: 'unavailable', reason: 'unexpected-response' };

  const latest = parsed.data.workflow_runs[0];
  if (parsed.data.total_count === 0 || latest === undefined) return available({ found: false });
  return available({
    found: true,
    conclusion: latest.conclusion,
    date: latest.created_at,
    url: latest.html_url,
  });
}
