// The rate-limit tracker (task 7.3, design 4.4; Req 9.1–9.4, 9.7, 9.8, 9.12).
// - Records the rate-limit values of every response, for each route.
// - Reports the budget as unknown (null) until the first response, and again once the
//   reset time has passed, because the allowance is then renewed and the old count is stale.
// - Blocks a route after a primary limit until its reset time.
// - Never retries anything. It only keeps numbers and answers questions about them.
import type { EndpointId } from '../../../shared/github-endpoints/catalogue';
import { classifyResponse } from './errors/classify-response';
import { makeError, type DataError } from './errors/error-kinds';
import type { RateLimitStatus } from './types';
import { toHttpResponse, type RawResponse, type Route } from './transport/types';

type RouteRecord = {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  tokenUsed: boolean;
  blockedUntil: string | null;
};

function emptyRecord(): RouteRecord {
  return { limit: null, remaining: null, resetAt: null, tokenUsed: false, blockedUntil: null };
}

export type RateLimitTracker = {
  /**
   * Records one response. Pass the endpoint ID so a 403 or 429 can be classified.
   * Returns the error when the response is a rate limit (so callers need not classify twice).
   */
  observe(endpointId: EndpointId, raw: RawResponse): DataError | null;
  /** The latest status for a route, with no request (Req 9.3). */
  status(route: Route): RateLimitStatus;
  /** The requests left in the current window, or null when unknown (Req 9.12). */
  budget(route: Route): { remaining: number | null; resetAt: string | null };
  /** A `rate-limited` error while a primary limit blocks the route, otherwise null (Req 9.7). */
  blockedError(route: Route): DataError | null;
};

export function createRateLimitTracker(now: () => Date = () => new Date()): RateLimitTracker {
  const records = new Map<Route, RouteRecord>();

  function record(route: Route): RouteRecord {
    let existing = records.get(route);
    if (existing === undefined) {
      existing = emptyRecord();
      records.set(route, existing);
    }
    return existing;
  }

  function isPast(iso: string | null): boolean {
    return iso !== null && now().getTime() >= Date.parse(iso);
  }

  /** A block ends by itself at its reset time. */
  function clearExpiredBlock(entry: RouteRecord): void {
    if (isPast(entry.blockedUntil)) entry.blockedUntil = null;
  }

  function statusOf(route: Route): RateLimitStatus {
    const entry = record(route);
    clearExpiredBlock(entry);
    const renewed = isPast(entry.resetAt);
    return {
      route,
      limit: entry.limit,
      // After the reset time the old count no longer applies.
      remaining: renewed ? null : entry.remaining,
      resetAt: entry.resetAt,
      tokenUsed: entry.tokenUsed,
      blockedUntil: entry.blockedUntil,
    };
  }

  return {
    observe(endpointId, raw) {
      // A transport failure carries no rate-limit headers, so the last known values stay.
      if (raw.transportFailure !== null) return null;

      const entry = record(raw.rateLimit.route);
      const { limit, remaining, resetAt, tokenUsed } = raw.rateLimit;
      if (limit !== null) entry.limit = limit;
      if (remaining !== null) entry.remaining = remaining;
      if (resetAt !== null) entry.resetAt = resetAt;
      entry.tokenUsed = tokenUsed;

      if (raw.status !== 403 && raw.status !== 429) return null;
      const error = classifyResponse(endpointId, toHttpResponse(raw));
      if (error?.kind === 'rate-limited' && error.details.limitType === 'primary') {
        entry.blockedUntil = error.details.resetAt ?? entry.resetAt;
      }
      return error;
    },

    status: statusOf,

    budget(route) {
      const { remaining, resetAt } = statusOf(route);
      return { remaining, resetAt };
    },

    blockedError(route) {
      const entry = record(route);
      clearExpiredBlock(entry);
      if (entry.blockedUntil === null) return null;
      return makeError('rate-limited', { limitType: 'primary', resetAt: entry.blockedUntil });
    },
  };
}

