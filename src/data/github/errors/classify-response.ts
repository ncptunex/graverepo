// Turns an HTTP status, headers and body into an error kind (task 4.3, design 4.4 and 5.9).
// Returns null for a usable success response.
//
// Section-specific "not really errors" (README 404, empty-repository 409, no workflow runs)
// are handled by the section adapters before they fall back to this function.

import type { EndpointId } from '../../../../shared/github-endpoints/catalogue';
import { isSuccessStatus, type HttpResponseLike } from '../http-response';
import { makeError, type DataError } from './error-kinds';

const ACCOUNT_ENDPOINTS: ReadonlySet<EndpointId> = new Set(['user', 'user-repos', 'org-repos']);

const SECONDARY_LIMIT_MESSAGE = /secondary rate limit/i;

function readMessage(response: HttpResponseLike): string | null {
  if (response.bodyParseFailed) return null;
  const body = response.body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

function readWholeNumber(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** `x-ratelimit-reset` is a Unix time in seconds. */
function readResetAt(headers: HttpResponseLike['headers']): string | null {
  const seconds = readWholeNumber(headers['x-ratelimit-reset']);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

/**
 * 403 and 429 rules, in this order (design 4.4, Req 9.4–9.6):
 * 1. remaining is 0 → primary rate limit, with the reset time;
 * 2. a `retry-after` header, or a message mentioning a secondary rate limit → secondary;
 * 3. any other 403 → forbidden, never described as a rate limit.
 * A 429 is "Too Many Requests" by definition, so a 429 that matches neither rule 1 nor 2
 * is treated as a secondary limit with an unknown wait time rather than as forbidden
 * (design table 5.9 limits `forbidden` to "other 403").
 */
function classifyLimitOrForbidden(response: HttpResponseLike): DataError {
  const { headers, status } = response;
  if (readWholeNumber(headers['x-ratelimit-remaining']) === 0) {
    return makeError('rate-limited', {
      limitType: 'primary',
      resetAt: readResetAt(headers),
      status,
    });
  }
  const hasRetryAfter = headers['retry-after'] !== undefined;
  const message = readMessage(response);
  if (hasRetryAfter || (message !== null && SECONDARY_LIMIT_MESSAGE.test(message)) || status === 429) {
    return makeError('rate-limited', {
      limitType: 'secondary',
      retryAfterSeconds: readWholeNumber(headers['retry-after']),
      status,
    });
  }
  return makeError('forbidden', { status });
}

export function classifyResponse(
  endpointId: EndpointId,
  response: HttpResponseLike,
): DataError | null {
  const { status } = response;

  if (isSuccessStatus(status)) {
    return response.bodyParseFailed ? makeError('unexpected-response', { status }) : null;
  }
  if (status === 403 || status === 429) return classifyLimitOrForbidden(response);
  if (status === 404 || status === 410) {
    return ACCOUNT_ENDPOINTS.has(endpointId)
      ? makeError('user-not-found', { status })
      : makeError('repo-not-found', { status });
  }
  // 451: access to the repository is blocked for legal reasons.
  if (status === 451) return makeError('forbidden', { status });
  if (status >= 500) return makeError('github-unavailable', { status });
  return makeError('unexpected-response', { status });
}
