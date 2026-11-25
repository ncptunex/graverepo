// Shared result helpers for adapters (design 4.6). Adapters never throw.
import type { EndpointId } from '../../../../shared/github-endpoints/catalogue';
import { classifyResponse } from '../errors/classify-response';
import { makeError, type DataError } from '../errors/error-kinds';
import type { HttpResponseLike } from '../http-response';
import type { FieldResult } from '../types';

/** Result of a core adapter (user, repository, repository list). */
export type AdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DataError };

export function adapted<T>(value: T): AdapterResult<T> {
  return { ok: true, value };
}

export function unexpectedResponse<T>(): AdapterResult<T> {
  return { ok: false, error: makeError('unexpected-response') };
}

export function available<T>(value: T): FieldResult<T> {
  return { status: 'available', value };
}

export function emptyRepository<T>(): FieldResult<T> {
  return { status: 'not-applicable', reason: 'empty-repository' };
}

/**
 * A section response that the section adapter does not handle itself becomes `unavailable`
 * with the mapped error kind. A success response that failed its schema is `unexpected-response`.
 */
export function sectionFailure<T>(endpointId: EndpointId, response: HttpResponseLike): FieldResult<T> {
  const error = classifyResponse(endpointId, response);
  return { status: 'unavailable', reason: error?.kind ?? 'unexpected-response' };
}

/** True when the response is a usable 2xx with a parsed body. */
export function isUsableSuccess(endpointId: EndpointId, response: HttpResponseLike): boolean {
  return classifyResponse(endpointId, response) === null;
}
