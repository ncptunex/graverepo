// `loadDemoGraveyard` (data-layer design 4.1, 4.8; Requirements 8.1, 8.4, 8.11–8.15, 10.4).
// Reads the committed snapshot only. It never calls `fetch` and never touches a transport,
// so using the demo cannot send a request to GitHub.
//
// Delivery (D24): while the snapshot is 300 KB or smaller it sits in this folder and is
// imported into the app bundle. If it grows past that, it moves to `public/demo/` and this
// file switches to loading that static file once at startup (task 6.5 records the choice).
import { makeError } from '../github/errors/error-kinds';
import type { DataResult, DemoGraveyard, RateLimitStatus } from '../github/types';
import { buildDemoGraveyard } from './build-demo-graveyard';

// An optional import: when the snapshot file does not exist yet, the list is simply empty.
const bundledSnapshots = import.meta.glob('./graveyard.snapshot.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

/** The demo makes no GitHub request, so there is no rate-limit information to report. */
const NO_REQUESTS_MADE: RateLimitStatus = {
  route: 'direct',
  limit: null,
  remaining: null,
  resetAt: null,
  tokenUsed: false,
  blockedUntil: null,
};

/**
 * Checks a snapshot and returns it as the demo graveyard. A snapshot that fails any check
 * gives `demo-unavailable` and nothing else (Requirement 8.12).
 */
export function loadDemoGraveyardFrom(snapshot: unknown): DataResult<DemoGraveyard> {
  const built = buildDemoGraveyard(snapshot);
  if (!built.ok) {
    // Developers need the reasons. Users only see the friendly `demo-unavailable` message.
    console.error('The demo snapshot failed validation:', built.problems);
    return { ok: false, error: makeError('demo-unavailable'), rateLimit: NO_REQUESTS_MADE };
  }
  return {
    ok: true,
    data: built.graveyard,
    provenance: {
      source: 'demo',
      route: 'bundled',
      // The capture date, not the time the demo was opened (design 4.8).
      fetchedAt: built.graveyard.capturedAt,
      stale: false,
    },
    warnings: [],
    rateLimit: NO_REQUESTS_MADE,
  };
}

export async function loadDemoGraveyard(): Promise<DataResult<DemoGraveyard>> {
  const [snapshot] = Object.values(bundledSnapshots);
  return loadDemoGraveyardFrom(snapshot);
}
