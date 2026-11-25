// The Phase 1 route selector (task 7.4, design 2.1; Req 8.16, 12.6).
// - Refuses a route that a primary rate limit blocks, and reports when it resets.
// - Otherwise uses direct mode.
// - Supports the demo-only configuration, where live requests are switched off
//   (for local development and tests).
// Creating a selector sends no request and does not check the rate limit (Req 8.16).
// The Phase 2 proxy-first rule and its one-time direct fallback are added in task 12.4.
import { makeError, type DataError } from './errors/error-kinds';
import type { RateLimitTracker } from './rate-limit';
import type { Route, Transport, TransportFailure } from './transport/types';

export type DataLayerMode = 'direct' | 'demo-only';

export type RouteChoice =
  | { readonly ok: true; readonly route: Route; readonly transport: Transport }
  | { readonly ok: false; readonly error: DataError };

export type RouteSelector = {
  select(): RouteChoice;
};

export function createRouteSelector(options: {
  readonly mode: DataLayerMode;
  readonly direct: Transport;
  readonly tracker: RateLimitTracker;
}): RouteSelector {
  return {
    select() {
      if (options.mode === 'demo-only') {
        // Live requests are off. The closest honest answer is that GitHub can't be reached,
        // and the demo graveyard is offered with it.
        return { ok: false, error: makeError('network') };
      }
      const blocked = options.tracker.blockedError('direct');
      if (blocked !== null) return { ok: false, error: blocked };
      return { ok: true, route: 'direct', transport: options.direct };
    },
  };
}

/** The error for a request that got no answer from GitHub. */
export function transportFailureToError(failure: TransportFailure): DataError {
  switch (failure) {
    case 'timeout':
      return makeError('timeout');
    case 'cancelled':
      return makeError('cancelled');
    case 'network':
      return makeError('network');
  }
}
