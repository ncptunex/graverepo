// Stage rules (task 6.2, design 3.3; Req 1.4–1.7, 6.13, 7.1).
// Pure predicates only. The state action `applyStageChange` calls them and refuses invalid moves.
// The rules are enforced here and in state, never only by hidden or disabled controls.
import type { RitualProgress, Stage } from './types';

export const STAGES: readonly Stage[] = ['necropsy', 'plan', 'rising', 'living'];

/**
 * Necropsy, Plan and Rising can be entered from any stage, forward or backward, including
 * skips, before or after revival (O19). The Living can be entered only when a revived record
 * exists. The first entry to The Living is by marking as revived.
 */
export function canEnterStage(progress: Pick<RitualProgress, 'revived'>, target: Stage): boolean {
  return target === 'living' ? progress.revived !== null : true;
}

/** Ticking and unticking are refused after revival (Req 6.13). */
export function canToggle(progress: Pick<RitualProgress, 'revived'>): boolean {
  return progress.revived === null;
}
