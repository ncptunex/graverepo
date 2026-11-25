// Adapter for `branches?per_page=100` (task 5.6, optional section). Count only (D4).
// 100 branches returned means the count is a lower bound (Req 4.4, 5.9).
import type { HttpResponseLike } from '../http-response';
import { branchListSchema } from '../schemas/sections';
import type { BranchesValue, FieldResult } from '../types';
import { available, isUsableSuccess, sectionFailure } from './adapter-result';

const PAGE_LIMIT = 100;

export function adaptBranches(response: HttpResponseLike): FieldResult<BranchesValue> {
  if (!isUsableSuccess('branches', response)) return sectionFailure('branches', response);

  const parsed = branchListSchema.safeParse(response.body);
  if (!parsed.success) return { status: 'unavailable', reason: 'unexpected-response' };
  return available({ count: parsed.data.length, isLowerBound: parsed.data.length >= PAGE_LIMIT });
}
