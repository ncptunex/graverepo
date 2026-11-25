// Adapter for `readme` (task 5.3, Req 6.4).
// "Not found" is a fact ("no README found"), not an error.
import type { HttpResponseLike } from '../http-response';
import { readmeSchema } from '../schemas/sections';
import type { FieldResult, ReadmeValue } from '../types';
import { available, isUsableSuccess, sectionFailure } from './adapter-result';

export function adaptReadme(response: HttpResponseLike): FieldResult<ReadmeValue> {
  if (response.status === 404) return available({ found: false, url: null });
  if (!isUsableSuccess('readme', response)) return sectionFailure('readme', response);

  const parsed = readmeSchema.safeParse(response.body);
  if (!parsed.success) return { status: 'unavailable', reason: 'unexpected-response' };
  return available({ found: true, url: parsed.data.html_url });
}
