// Shared plumbing for the public data-layer functions (tasks 9.1–9.7).
// - `DataLayerContext` holds the pieces every function uses: route selector, rate-limit
//   tracker, cache, cached fetcher, clock and section switches.
// - `sendRequest` sends one request through the route selector and the transport, records
//   the rate-limit headers, and turns "no answer" into a typed error. It never throws.
// - `guard` is the last safety net: no public function throws (Req 6.9).
import type { EndpointId } from '../../../shared/github-endpoints/catalogue';
import type { PathValues, QueryValues } from '../../../shared/github-endpoints/build-url';
import type { SectionSwitches } from '../../../shared/github-endpoints/catalogue';
import type { CachedFetcher } from '../cache/cached-fetch';
import type { GitHubCache } from '../cache/github-cache';
import { makeError, type DataError } from './errors/error-kinds';
import type { HttpResponseLike } from './http-response';
import type { RateLimitTracker } from './rate-limit';
import { transportFailureToError, type RouteSelector } from './route-selector';
import { toHttpResponse, type RawResponse } from './transport/types';
import type { DataResult } from './types';

export type DataLayerContext = {
  readonly selector: RouteSelector;
  readonly tracker: RateLimitTracker;
  readonly cache: GitHubCache;
  readonly fetcher: CachedFetcher;
  readonly now: () => Date;
  readonly switches: SectionSwitches;
};

export type SentRequest =
  | { readonly ok: true; readonly raw: RawResponse; readonly response: HttpResponseLike }
  | {
      readonly ok: false;
      readonly error: DataError;
      /** True when a request really left the app (a network failure or timeout). False when it was refused first. */
      readonly sent: boolean;
    };

/**
 * Sends one request. The caller's cancellation signal is deliberately not passed on:
 * a shared network request keeps running for other callers, and only the transport's
 * 10-second timeout stops it (Req 7.13, D21).
 */
export async function sendRequest(
  context: DataLayerContext,
  endpointId: EndpointId,
  pathValues: PathValues,
  query?: QueryValues,
): Promise<SentRequest> {
  const choice = context.selector.select();
  if (!choice.ok) return { ok: false, error: choice.error, sent: false };

  let raw: RawResponse;
  try {
    raw = await choice.transport.request({ endpointId, pathValues, query });
  } catch (error) {
    // A transport should never throw, but a failure here must not reach the UI.
    console.error('The transport threw an error:', error);
    return { ok: false, error: makeError('network'), sent: true };
  }
  context.tracker.observe(endpointId, raw);
  if (raw.transportFailure !== null) {
    return { ok: false, error: transportFailureToError(raw.transportFailure), sent: true };
  }
  return { ok: true, raw, response: toHttpResponse(raw) };
}

/** Runs a public function body. An unexpected bug becomes an error result, never an exception. */
export async function guard<T>(
  context: DataLayerContext,
  work: () => Promise<DataResult<T>>,
): Promise<DataResult<T>> {
  try {
    return await work();
  } catch (error) {
    console.error('Unexpected data-layer error:', error);
    return {
      ok: false,
      error: makeError('unexpected-response'),
      rateLimit: context.tracker.status('direct'),
    };
  }
}

/** A failed result with the current rate-limit status. */
export function failure<T>(context: DataLayerContext, error: DataError): DataResult<T> {
  return { ok: false, error, rateLimit: context.tracker.status('direct') };
}
