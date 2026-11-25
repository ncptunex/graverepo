// Rising stage (resurrection-ritual task 14.1, 14.2). A checklist with checkbox semantics, progress
// as text and a meter, the save status, and "Mark as revived". A garden picture grows with the steps ticked (O12, approved: six stages from the done and total counts).
// The stage and revive rules are enforced by the ritual session, not by these controls.
import { useId, useState } from 'react';
import { LiveRegion } from '../../components/LiveRegion';
import { Notice } from '../../components/Notice';
import { GardenPlot } from '../../components/scenery/GardenPlot';
import { gardenStage } from '../../components/garden-stage';
import { APP_TEXT } from '../../components/ui-text';
import { RISING_TEXT, planItemText, reviveDisabledText, risingProgressText } from '../../components/wording';
import { canMarkRevived, progressPercent, reconcileTicks, remainingSteps } from '../../ritual/progress';
import type { DisplayContext } from '../../ritual/types';
import type { RitualSession, RitualState } from '../../state/ritual-session';
import './Ritual.css';

type OpenState = Extract<RitualState, { status: 'open' }>;

export type RisingStageProps = {
  readonly open: OpenState;
  readonly ritual: RitualSession;
  readonly displayContext: DisplayContext;
};

export function RisingStage({ open, ritual, displayContext }: RisingStageProps) {
  const reasonId = useId();
  // A failed save of the revive step shows the "couldn't save" line instead of the confirmation.
  const [lastReviveSaved, setLastReviveSaved] = useState<boolean | null>(null);
  const { plan } = open.analysis;
  const ticks = open.progress?.tickedItemIds ?? [];
  const revived = open.progress?.revived ?? null;
  const done = reconcileTicks(plan, ticks).length;
  const total = plan.items.length;
  const percent = progressPercent(plan, ticks);
  const progressText = risingProgressText(done, total);
  const remaining = remainingSteps(plan, ticks);
  const canRevive = canMarkRevived(plan, { revived, tickedItemIds: ticks });
  const isLocked = revived !== null;
  // The garden picture follows the steps ticked here. It says nothing about GitHub.
  const stage = gardenStage(done, total, isLocked);

  function revive(): void {
    if (!canRevive) return;
    const result = ritual.markRevived();
    if (result.ok) setLastReviveSaved(result.saved);
  }

  return (
    <div className="stack rising">
      <section aria-labelledby="rising-progress" className="stack rising__progress">
        <GardenPlot stage={stage} />
        <h3 id="rising-progress">{RISING_TEXT.progressLabel}</h3>
        <p>{progressText}</p>
        {percent !== null && <progress className="rising__meter" max={100} value={percent} aria-label={`${RISING_TEXT.progressLabel}: ${progressText}`} />}
        <LiveRegion kind="polite" message={progressText} isVisuallyHidden />
      </section>

      {isLocked && (
        <Notice variant="info" variantLabel={APP_TEXT.info}>
          {RISING_TEXT.lockedNote}
        </Notice>
      )}

      {plan.items.length > 0 && (
        <fieldset className="rising__list">
          <legend>{RISING_TEXT.checklistLabel}</legend>
          {plan.items.map((item) => {
            const text = planItemText(item, displayContext);
            return (
              <label key={item.id} className="rising__item">
                <input
                  type="checkbox"
                  checked={ticks.includes(item.id)}
                  disabled={isLocked}
                  onChange={() => ritual.toggleItem(item.id)}
                />
                <span>
                  <span className="rising__step">{text.checklistLabel}</span>
                  <span className="muted rising__because"> {text.fact}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <p className="muted">{open.saveProblem ? RISING_TEXT.cannotSave : open.progress !== null ? RISING_TEXT.saved : ''}</p>

      {!isLocked && (
        <div className="stack">
          <button
            type="button"
            className="button button--primary"
            aria-disabled={!canRevive ? true : undefined}
            aria-describedby={!canRevive ? reasonId : undefined}
            onClick={revive}
          >
            {RISING_TEXT.markRevived}
          </button>
          {!canRevive && (
            <p id={reasonId} className="muted">
              {reviveDisabledText(remaining)}
            </p>
          )}
        </div>
      )}

      {isLocked && (
        <Notice variant={open.saveProblem || lastReviveSaved === false ? 'warning' : 'success'} variantLabel={open.saveProblem || lastReviveSaved === false ? APP_TEXT.warning : APP_TEXT.success}>
          {open.saveProblem || lastReviveSaved === false ? RISING_TEXT.cannotSave : RISING_TEXT.confirmation}
        </Notice>
      )}
    </div>
  );
}
