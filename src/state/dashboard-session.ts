// The dashboard session (graveyard-dashboard tasks 3.1 to 3.3, design 3).
// Holds the current view, the graveyard (live or demo), the filters and the revived list.
// - Creating the session calls no data-layer function and reads no storage (R1.6).
// - This layer, not components, creates AbortControllers, drops late results and owns the
//   8-second "taking a while" timer (tech.md section 6).
// - Results are kept as the data layer returned them. Nothing is saved to storage (R11.6).
// - The ritual does its own loading. Opening a tombstone only hands it the repository and source.
import type { DataError, DataResult, DemoGraveyard, RepositoryList, RepositorySummary } from '../data/github';
import { makeError } from '../data/github';
import type { ProgressSource, RevivedRecord } from '../ritual/types';
import { DEFAULT_FILTERS, type GraveyardFilters } from './graveyard-filters';
import type { RepositoryRef } from './ritual-session';

export type DashboardView = 'landing' | 'graveyard' | 'ritual' | 'living';

type OkResult<T> = Extract<DataResult<T>, { ok: true }>;

export type GraveyardState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly source: ProgressSource; readonly name?: string; readonly isSlow: boolean }
  | { readonly status: 'error'; readonly error: DataError; readonly query: string }
  | { readonly status: 'ready'; readonly source: 'live'; readonly result: OkResult<RepositoryList> }
  | { readonly status: 'ready'; readonly source: 'demo'; readonly result: OkResult<DemoGraveyard> };

export type DashboardState = {
  readonly view: DashboardView;
  readonly graveyard: GraveyardState;
  readonly filters: GraveyardFilters;
  readonly revivedCount: number;
  /** The revived records in the order the ritual returned them (newest first). Not sorted here. */
  readonly revived: readonly RevivedRecord[];
};

/** The part of the data layer's public interface the dashboard uses. */
export type DashboardDataLayer = {
  listRepositories(username: string, options?: { readonly signal?: AbortSignal }): Promise<DataResult<RepositoryList>>;
  loadDemoGraveyard(): Promise<DataResult<DemoGraveyard>>;
};

/** The part of the ritual session the dashboard uses (ritual task 10.1). */
export type DashboardRitual = {
  openRitual(
    repository: RepositoryRef,
    source: ProgressSource,
    options?: { readonly summary?: RepositorySummary },
  ): Promise<void>;
  closeRitual(): void;
  listRevived(): RevivedRecord[];
};

export type DashboardSession = {
  getState(): DashboardState;
  subscribe(listener: () => void): () => void;
  searchAccount(text: string): Promise<void>;
  openDemo(): Promise<void>;
  setFilters(partial: Partial<GraveyardFilters>): void;
  clearFilters(): void;
  /** Hands one tombstone to the ritual. Ignored unless the graveyard is ready. */
  openTombstone(owner: string, repo: string): Promise<void>;
  backToGraveyard(): void;
  showLiving(): void;
  goHome(): void;
  refreshRevivedCount(): void;
  /** Aborts any running search and clears the timer. */
  dispose(): void;
};

/** Eight seconds, then "GitHub is taking a while" (R9.2). */
export const SLOW_AFTER_MS = 8000;

export function createDashboardSession(dependencies: {
  readonly dataLayer: DashboardDataLayer;
  readonly ritual: DashboardRitual;
  readonly slowAfterMs?: number;
}): DashboardSession {
  const { dataLayer, ritual } = dependencies;
  const slowAfterMs = dependencies.slowAfterMs ?? SLOW_AFTER_MS;

  const listeners = new Set<() => void>();
  let state: DashboardState = {
    view: 'landing',
    graveyard: { status: 'idle' },
    filters: DEFAULT_FILTERS,
    revivedCount: 0,
    revived: [],
  };

  // One token per started load. A result or timer with an old token does nothing.
  let token = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function setState(next: Partial<DashboardState>): void {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  }

  function clearSlowTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  /** Aborts the running search, clears the timer and invalidates every earlier token. */
  function startNewLoad(): number {
    controller?.abort();
    controller = null;
    clearSlowTimer();
    token += 1;
    return token;
  }

  function closeRitualIfOpen(): void {
    if (state.view === 'ritual') ritual.closeRitual();
  }

  function readRevived(): { revived: RevivedRecord[]; revivedCount: number } {
    const revived = ritual.listRevived();
    return { revived, revivedCount: revived.length };
  }

  async function searchAccount(text: string): Promise<void> {
    closeRitualIfOpen();
    const mine = startNewLoad();
    const abort = new AbortController();
    controller = abort;
    const name = text.trim();

    setState({ view: 'graveyard', graveyard: { status: 'loading', source: 'live', name, isSlow: false } });

    timer = setTimeout(() => {
      timer = null;
      if (mine !== token) return;
      if (state.graveyard.status !== 'loading') return;
      setState({ graveyard: { ...state.graveyard, isSlow: true } });
    }, slowAfterMs);

    let result: DataResult<RepositoryList>;
    try {
      result = await dataLayer.listRepositories(name, { signal: abort.signal });
    } catch (error) {
      console.error('Unexpected error while searching:', error);
      result = { ok: false, error: makeError('unexpected-response'), rateLimit: emptyRateLimit() };
    }

    if (mine !== token) return;
    clearSlowTimer();
    controller = null;

    if (!result.ok) {
      if (result.error.kind === 'cancelled') {
        // Changes nothing, except that the "taking a while" flag no longer applies.
        if (state.graveyard.status === 'loading' && state.graveyard.isSlow) {
          setState({ graveyard: { ...state.graveyard, isSlow: false } });
        }
        return;
      }
      // A failed search clears the graveyard and keeps what was typed (DD4).
      setState({ graveyard: { status: 'error', error: result.error, query: text } });
      return;
    }
    setState({ graveyard: { status: 'ready', source: 'live', result }, filters: DEFAULT_FILTERS });
  }

  async function openDemo(): Promise<void> {
    closeRitualIfOpen();
    const mine = startNewLoad();
    // The demo starts no timer and makes no request.
    setState({ view: 'graveyard', graveyard: { status: 'loading', source: 'demo', isSlow: false } });

    let result: DataResult<DemoGraveyard>;
    try {
      result = await dataLayer.loadDemoGraveyard();
    } catch (error) {
      console.error('Unexpected error while opening the demo:', error);
      result = { ok: false, error: makeError('demo-unavailable'), rateLimit: emptyRateLimit() };
    }

    if (mine !== token) return;
    if (!result.ok) {
      if (result.error.kind === 'cancelled') return;
      setState({ graveyard: { status: 'error', error: result.error, query: '' } });
      return;
    }
    setState({ graveyard: { status: 'ready', source: 'demo', result }, filters: DEFAULT_FILTERS });
  }

  async function openTombstone(owner: string, repo: string): Promise<void> {
    const graveyard = state.graveyard;
    if (graveyard.status !== 'ready') return;
    const wanted = `${owner}/${repo}`.toLowerCase();
    const summary = graveyard.result.data.repositories.find(
      (candidate) => `${candidate.owner}/${candidate.name}`.toLowerCase() === wanted,
    );
    if (summary === undefined) return;
    // The source comes from the graveyard, never from the tombstone (R6.4).
    const source: ProgressSource = graveyard.source;
    setState({ view: 'ritual' });
    await ritual.openRitual({ owner: summary.owner, repo: summary.name }, source, { summary });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    searchAccount,
    openDemo,
    setFilters(partial) {
      setState({ filters: { ...state.filters, ...partial } });
    },
    clearFilters() {
      setState({ filters: DEFAULT_FILTERS });
    },
    openTombstone,
    backToGraveyard() {
      if (state.view === 'ritual') ritual.closeRitual();
      setState({ view: 'graveyard' });
    },
    showLiving() {
      closeRitualIfOpen();
      setState({ ...readRevived(), view: 'living' });
    },
    goHome() {
      closeRitualIfOpen();
      setState({ view: 'landing' });
    },
    refreshRevivedCount() {
      setState(readRevived());
    },
    dispose() {
      startNewLoad();
      listeners.clear();
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
