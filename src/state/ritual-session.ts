// The ritual session (task 10.1, design 3 and 8.1; Req 1, 6.13, 7, 8, 9, 10).
// It connects the pure domain to the data layer, the progress store and request cancellation.
// - Demo repositories come from `loadDemoGraveyard`. `getRepositoryDetail` is never called for them.
// - Live repositories come from `getRepositoryDetail` with default options (no `forceRefresh`).
//   The data layer's cache rules apply as they are.
// - Stage, tick and revive rules are enforced here through the domain functions, not by controls.
// - A failed or cancelled request creates no progress. A progress entry is written only when the
//   visitor moves stage, ticks or revives.
// - Marking as revived writes only to the progress store. It makes no request.
// The session holds plain state and notifies listeners, so any UI can read it.
import type {
  DataError,
  DataResult,
  DemoGraveyard,
  DetailEstimate,
  DetailOptions,
  Provenance,
  RepositoryDetail,
  RepositorySummary,
  Warning,
} from '../data/github';
import { makeError } from '../data/github';
import { analyseRepository } from '../ritual';
import { buildRevivedRecord, canMarkRevived } from '../ritual/progress';
import { canEnterStage, canToggle } from '../ritual/stages';
import type { DisplayContext, NecropsyResult, ProgressSource, RevivedRecord, RitualProgress, Stage } from '../ritual/types';
import type { ProgressRef, ProgressStore } from './progress-store';
import { readDisplayContext } from './display-context';
import { createRequestTracker } from './ritual-requests';

/** The part of the data layer's public interface the ritual uses. */
export type RitualDataLayer = {
  getRepositoryDetail(owner: string, repo: string, options?: DetailOptions): Promise<DataResult<RepositoryDetail>>;
  estimateDetailRequests(repository: RepositorySummary): DetailEstimate;
  loadDemoGraveyard(): Promise<DataResult<DemoGraveyard>>;
};

export type RepositoryRef = { readonly owner: string; readonly repo: string };

export type RitualState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'loading';
      readonly source: ProgressSource;
      readonly requested: RepositoryRef;
      /** The estimate from `estimateDetailRequests`, kept while the request is pending (Req 10.9). */
      readonly estimate: DetailEstimate | null;
    }
  | {
      readonly status: 'error';
      readonly source: ProgressSource;
      readonly requested: RepositoryRef;
      readonly error: DataError;
    }
  | {
      readonly status: 'open';
      readonly source: ProgressSource;
      readonly requested: RepositoryRef;
      readonly detail: RepositoryDetail;
      readonly analysis: NecropsyResult;
      readonly provenance: Provenance;
      /** The data result's warnings. Shown once, replacing the pending estimate note. */
      readonly warnings: readonly Warning[];
      /** Saved progress, or null when the visitor has not changed anything yet. */
      readonly progress: RitualProgress | null;
      readonly stage: Stage;
      /** True when the plan-changed note applies (Req 8.11, O23). */
      readonly planChanged: boolean;
      /** True while the latest write failed (O22). */
      readonly saveProblem: boolean;
    };

export type RefusalReason =
  | 'not-open'
  | 'stage-not-allowed'
  | 'locked'
  | 'unknown-item'
  | 'gate-closed'
  | 'already-revived';

export type ActionResult =
  | { readonly ok: true; /** False when the write failed and the change is held in memory. */ readonly saved: boolean }
  | { readonly ok: false; readonly reason: RefusalReason };

export type RitualSession = {
  getState(): RitualState;
  subscribe(listener: () => void): () => void;
  openRitual(
    repository: RepositoryRef,
    source: ProgressSource,
    options?: { readonly summary?: RepositorySummary },
  ): Promise<void>;
  /** Moves between stages. Refused moves change nothing. Entering the current stage writes nothing. */
  applyStageChange(target: Stage): ActionResult;
  toggleItem(itemId: string): ActionResult;
  markRevived(): ActionResult;
  listRevived(): RevivedRecord[];
  closeRitual(): void;
};

// Moved to display-context.ts (shared with the dashboard). Re-exported so existing imports keep working.
export { readDisplayContext };

export function createRitualSession(dependencies: {
  readonly dataLayer: RitualDataLayer;
  readonly store: ProgressStore;
  readonly now?: () => Date;
  readonly displayContext?: DisplayContext;
}): RitualSession & { readonly displayContext: DisplayContext } {
  const { dataLayer, store } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const displayContext = dependencies.displayContext ?? readDisplayContext();
  const requests = createRequestTracker();
  const listeners = new Set<() => void>();
  let state: RitualState = { status: 'idle' };

  function setState(next: RitualState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** The detail of one demo repository, from the demo graveyard held in memory. */
  async function loadDemoDetail(repository: RepositoryRef): Promise<DataResult<RepositoryDetail>> {
    const graveyard = await dataLayer.loadDemoGraveyard();
    if (!graveyard.ok) return graveyard;
    const wanted = `${repository.owner}/${repository.repo}`.toLowerCase();
    const detail = graveyard.data.details.find((candidate) => candidate.core.fullName.toLowerCase() === wanted);
    if (detail === undefined) {
      return {
        ok: false,
        error: makeError('repo-not-found', { repository: `${repository.owner}/${repository.repo}` }),
        rateLimit: graveyard.rateLimit,
      };
    }
    // The provenance of the demo result carries the capture date, which is the reference time.
    return { ...graveyard, data: detail };
  }

  async function openRitual(
    repository: RepositoryRef,
    source: ProgressSource,
    options: { readonly summary?: RepositorySummary } = {},
  ): Promise<void> {
    const ticket = requests.begin();
    const estimate =
      source === 'live' && options.summary !== undefined ? dataLayer.estimateDetailRequests(options.summary) : null;
    setState({ status: 'loading', source, requested: repository, estimate });

    let result: DataResult<RepositoryDetail>;
    try {
      result =
        source === 'demo'
          ? await loadDemoDetail(repository)
          : await dataLayer.getRepositoryDetail(repository.owner, repository.repo, {
              signal: ticket.signal,
              summary: options.summary,
            });
    } catch (error) {
      console.error('Unexpected error while opening a repository:', error);
      result = { ok: false, error: makeError('unexpected-response'), rateLimit: emptyRateLimit() };
    }

    // A late result from a replaced or closed request must change nothing (Req 10.4).
    if (!requests.isCurrent(ticket)) return;
    if (!result.ok) {
      // A cancelled result is ignored. Any other error is shown, and no progress is created (Req 10.6).
      if (result.error.kind === 'cancelled') return;
      setState({ status: 'error', source, requested: repository, error: result.error });
      return;
    }

    const detail = result.data;
    const referenceTime = result.provenance.fetchedAt;
    const analysis = analyseRepository(detail, referenceTime);
    const ref: ProgressRef = { source, owner: detail.core.owner, repo: detail.core.name };

    // Read before any write of this session, so the stored evidence time is the saved one (O23).
    const saved = store.read(ref);
    const planIds = new Set<string>(analysis.plan.items.map((item) => item.id));
    const planChanged =
      saved !== null &&
      saved.revived === null &&
      saved.evidenceFetchedAt !== referenceTime &&
      saved.tickedItemIds.some((id) => !planIds.has(id));

    setState({
      status: 'open',
      source,
      requested: repository,
      detail,
      analysis,
      provenance: result.provenance,
      warnings: result.warnings,
      progress: saved,
      stage: saved?.stage ?? 'necropsy',
      planChanged,
      saveProblem: store.hasSaveProblem(),
    });
  }

  /** Writes one change and updates the session. A failed write keeps the change in memory. */
  function commit(
    open: Extract<RitualState, { status: 'open' }>,
    change: { stage: Stage; tickedItemIds: readonly string[]; revived: RevivedRecord | null },
  ): ActionResult {
    const ref: ProgressRef = { source: open.source, owner: open.detail.core.owner, repo: open.detail.core.name };
    const outcome = store.save(ref, change, open.analysis.referenceTime);
    setState({
      ...open,
      progress: outcome.progress,
      stage: outcome.progress.stage,
      saveProblem: store.hasSaveProblem(),
    });
    return { ok: true, saved: outcome.saved };
  }

  function currentTicks(open: Extract<RitualState, { status: 'open' }>): readonly string[] {
    return open.progress?.tickedItemIds ?? [];
  }

  return {
    displayContext,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openRitual,

    applyStageChange(target) {
      if (state.status !== 'open') return { ok: false, reason: 'not-open' };
      const revivedOnly = { revived: state.progress?.revived ?? null };
      if (!canEnterStage(revivedOnly, target)) return { ok: false, reason: 'stage-not-allowed' };
      if (target === state.stage) return { ok: true, saved: !store.hasSaveProblem() };
      return commit(state, { stage: target, tickedItemIds: currentTicks(state), revived: revivedOnly.revived });
    },

    toggleItem(itemId) {
      if (state.status !== 'open') return { ok: false, reason: 'not-open' };
      const revived = state.progress?.revived ?? null;
      if (!canToggle({ revived })) return { ok: false, reason: 'locked' };
      if (!state.analysis.plan.items.some((item) => item.id === itemId)) return { ok: false, reason: 'unknown-item' };
      const ticks = currentTicks(state);
      const next = ticks.includes(itemId) ? ticks.filter((id) => id !== itemId) : [...ticks, itemId];
      return commit(state, { stage: state.stage, tickedItemIds: next, revived: null });
    },

    markRevived() {
      if (state.status !== 'open') return { ok: false, reason: 'not-open' };
      if (state.progress?.revived) return { ok: false, reason: 'already-revived' };
      const ticks = currentTicks(state);
      if (!canMarkRevived(state.analysis.plan, { revived: null, tickedItemIds: ticks })) {
        return { ok: false, reason: 'gate-closed' };
      }
      const record = buildRevivedRecord({
        core: state.detail.core,
        plan: state.analysis.plan,
        source: state.source,
        evidenceFetchedAt: state.analysis.referenceTime,
        revivedAt: now().toISOString(),
      });
      return commit(state, { stage: 'living', tickedItemIds: ticks, revived: record });
    },

    listRevived: () => store.listRevived(),

    closeRitual() {
      requests.cancel();
      setState({ status: 'idle' });
    },
  };
}

function emptyRateLimit() {
  return {
    route: 'direct' as const,
    limit: null,
    remaining: null,
    resetAt: null,
    tokenUsed: false,
    blockedUntil: null,
  };
}
