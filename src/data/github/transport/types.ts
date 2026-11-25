// The transport interface and the raw-response format (task 7.1, design 4.3, Req 12.4).
// Every GitHub request goes through a transport, so a proxy transport can be added in
// Phase 2 without changing the adapters, the cache or the public functions.
import type { EndpointId } from '../../../../shared/github-endpoints/catalogue';
import type { PathValues, QueryValues } from '../../../../shared/github-endpoints/build-url';
import type { HttpResponseLike } from '../http-response';

export type Route = 'direct' | 'proxy';

/** Rate-limit values read from one response. `null` means the response did not say. */
export type RawRateLimit = {
  readonly route: Route;
  readonly limit: number | null;
  readonly remaining: number | null;
  /** When the allowance resets (ISO UTC). */
  readonly resetAt: string | null;
  /** Seconds to wait, from `retry-after`. */
  readonly retryAfterSeconds: number | null;
  readonly tokenUsed: boolean;
};

/** Why no HTTP answer was received (design 4.3 `transportFailure`). */
export type TransportFailure = 'network' | 'timeout' | 'cancelled';

export type RawResponse = {
  /** HTTP status from GitHub, or 0 when there was a transport failure. */
  readonly status: number;
  /** Parsed JSON body. Ignored when `dataParseFailed` is true. */
  readonly data: unknown;
  readonly dataParseFailed: boolean;
  /** When GitHub was contacted (ISO UTC). */
  readonly fetchedAt: string;
  readonly rateLimit: RawRateLimit;
  /** Page number from the `Link` header's `rel="next"`, or null when there is none. */
  readonly nextPage: number | null;
  /** Set only when the request failed before any answer (network, timeout, cancelled). */
  readonly transportFailure: TransportFailure | null;
};

export type TransportRequest = {
  readonly endpointId: EndpointId;
  readonly pathValues: PathValues;
  readonly query?: QueryValues;
  /** Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Aborts this request. The data layer does not pass a caller's signal for shared requests (D21). */
  readonly signal?: AbortSignal;
};

/**
 * A transport never throws. A refused request (a URL the catalogue does not allow) comes
 * back as a `network` failure, because nothing was sent.
 */
export interface Transport {
  readonly route: Route;
  request(request: TransportRequest): Promise<RawResponse>;
}

/**
 * The headers that error classification and the rate-limit tracker read, in the shape the
 * section adapters and `classifyResponse` expect.
 */
export function toHttpResponse(raw: RawResponse): HttpResponseLike {
  const headers: Record<string, string> = {};
  const { limit, remaining, resetAt, retryAfterSeconds } = raw.rateLimit;
  if (limit !== null) headers['x-ratelimit-limit'] = String(limit);
  if (remaining !== null) headers['x-ratelimit-remaining'] = String(remaining);
  if (resetAt !== null) headers['x-ratelimit-reset'] = String(Math.floor(Date.parse(resetAt) / 1000));
  if (retryAfterSeconds !== null) headers['retry-after'] = String(retryAfterSeconds);
  return { status: raw.status, headers, body: raw.data, bodyParseFailed: raw.dataParseFailed };
}
