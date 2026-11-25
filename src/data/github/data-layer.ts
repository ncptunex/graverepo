// Builds the public data-layer functions from their parts (tasks 9.1–9.7, design 4.1).
// `createGitHubDataLayer` takes every dependency as an option so tests can pass a fake
// transport, a fake storage and a fixed clock. Creating a data layer sends no request and
// does not check the rate limit (Req 8.16).
// The app uses the default instance from `index.ts`.
import { SECTION_SWITCHES, type SectionSwitches } from '../../../shared/github-endpoints/catalogue';
import { createCachedFetcher } from '../cache/cached-fetch';
import { createGitHubCache, type StorageLike } from '../cache/github-cache';
import { createInFlight } from '../cache/in-flight';
import { loadDemoGraveyard } from '../demo/load-demo-graveyard';
import type { DataLayerContext } from './context';
import { createEstimateDetailRequests } from './detail-estimate';
import { createListRepositories } from './list-repositories';
import { createLookupUser } from './lookup-user';
import { createRateLimitTracker } from './rate-limit';
import { createGetRepositoryDetail } from './repository-detail';
import { createRouteSelector, type DataLayerMode } from './route-selector';
import { createDirectTransport } from './transport/direct-transport';
import type { Route, Transport } from './transport/types';
import type { RateLimitStatus } from './types';

export type DataLayerOptions = {
  /** `direct` is the normal app. `demo-only` switches live requests off. */
  readonly mode?: DataLayerMode;
  /** Replaces the direct transport. Tests pass a fake. */
  readonly transport?: Transport;
  /** Replaces `localStorage`. Pass `null` for a memory-only cache. */
  readonly storage?: StorageLike | null;
  readonly now?: () => Date;
  readonly switches?: SectionSwitches;
};

export type GitHubDataLayer = {
  readonly lookupUser: ReturnType<typeof createLookupUser>;
  readonly listRepositories: ReturnType<typeof createListRepositories>;
  readonly getRepositoryDetail: ReturnType<typeof createGetRepositoryDetail>;
  readonly estimateDetailRequests: ReturnType<typeof createEstimateDetailRequests>;
  readonly loadDemoGraveyard: typeof loadDemoGraveyard;
  /** The latest rate-limit status for each route. Sends no request (Req 9.3). */
  readonly getRateLimitStatus: () => Readonly<Record<Route, RateLimitStatus>>;
};

export function createGitHubDataLayer(options: DataLayerOptions = {}): GitHubDataLayer {
  const now = options.now ?? (() => new Date());
  const tracker = createRateLimitTracker(now);
  const cache = createGitHubCache(options.storage);
  const selector = createRouteSelector({
    mode: options.mode ?? 'direct',
    direct: options.transport ?? createDirectTransport({ now }),
    tracker,
  });
  const fetcher = createCachedFetcher({
    cache,
    inFlight: createInFlight(),
    now,
    rateLimit: () => tracker.status('direct'),
  });
  const context: DataLayerContext = {
    selector,
    tracker,
    cache,
    fetcher,
    now,
    switches: options.switches ?? SECTION_SWITCHES,
  };

  return {
    lookupUser: createLookupUser(context),
    listRepositories: createListRepositories(context),
    getRepositoryDetail: createGetRepositoryDetail(context),
    estimateDetailRequests: createEstimateDetailRequests(context),
    loadDemoGraveyard,
    getRateLimitStatus: () => ({ direct: tracker.status('direct'), proxy: tracker.status('proxy') }),
  };
}
