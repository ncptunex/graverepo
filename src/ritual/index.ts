// The ritual's single entry point (task 5.3, design 4.1; Req 9.1, 9.2).
// `analyseRepository` gives findings, the condition and the plan for one detail.
// The reference time is passed in by the state layer, from the data result's
// `provenance.fetchedAt`. `RepositoryDetail` has no fetch time of its own. The result depends
// only on the detail and the reference time, never on provenance source, route or stale flag.
import type { RepositoryDetail } from '../data/github/types';
import { deriveCondition } from './condition';
import { buildFindings } from './findings';
import { buildPlan } from './plan';
import type { NecropsyResult } from './types';

export function analyseRepository(detail: RepositoryDetail, referenceTime: string): NecropsyResult {
  const findings = buildFindings(detail, referenceTime);
  const condition = deriveCondition(
    { isArchived: detail.core.isArchived, isEmpty: detail.isEmpty, pushedAt: detail.core.pushedAt },
    referenceTime,
  );
  return { findings, condition, plan: buildPlan(findings), referenceTime };
}
