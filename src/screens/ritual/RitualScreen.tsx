// The ritual view (resurrection-ritual task 12 to 14). Loading, error and the four stages for one
// repository. It triggers ritual session actions only. The stage rules are enforced by the session.
import { Notice } from '../../components/Notice';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { LiveRegion } from '../../components/LiveRegion';
import { StageHeading } from '../../components/StageHeading';
import { StageIndicator } from '../../components/StageIndicator';
import { GardenPlot } from '../../components/scenery/GardenPlot';
import { ViewHeading } from '../../components/ViewHeading';
import { errorText } from '../../components/error-text';
import { APP_TEXT } from '../../components/ui-text';
import { NECROPSY_TEXT, RISING_TEXT, STAGE_LABELS, STAGE_ORDER } from '../../components/wording';
import { canEnterStage } from '../../ritual/stages';
import type { DisplayContext, Stage } from '../../ritual/types';
import type { DashboardSession } from '../../state/dashboard-session';
import type { RitualSession, RitualState } from '../../state/ritual-session';
import { NecropsyStage } from './NecropsyStage';
import { PlanStage } from './PlanStage';
import { RisingStage } from './RisingStage';

export type RitualScreenProps = {
  readonly state: RitualState;
  readonly ritual: RitualSession;
  readonly dashboard: DashboardSession;
  readonly displayContext: DisplayContext;
  readonly now: string;
};

export function RitualScreen({ state, ritual, dashboard, displayContext, now }: RitualScreenProps) {
  const back = (
    <button type="button" className="button" onClick={() => dashboard.backToGraveyard()}>
      {NECROPSY_TEXT.back}
    </button>
  );

  if (state.status === 'idle') return <div className="stack">{back}</div>;

  const name = `${state.requested.owner}/${state.requested.repo}`;

  if (state.status === 'loading') {
    return (
      <div className="stack">
        {back}
        <ViewHeading viewKey={`ritual-loading-${name}`}>{name}</ViewHeading>
        <LoadingIndicator label={NECROPSY_TEXT.loading} />
        <LiveRegion kind="polite" message={NECROPSY_TEXT.loading} isVisuallyHidden />
        {state.estimate?.mayNotComplete === true && (
          <Notice variant="warning" variantLabel={APP_TEXT.warning}>
            {NECROPSY_TEXT.pendingEstimate}
          </Notice>
        )}
      </div>
    );
  }

  if (state.status === 'error') {
    const text = errorText(state.error, { displayContext, now });
    return (
      <div className="stack">
        {back}
        <ViewHeading viewKey={`ritual-error-${name}`}>{name}</ViewHeading>
        {text.message !== null && (
          <Notice variant="error" variantLabel={APP_TEXT.error}>
            {text.message}
          </Notice>
        )}
        {text.offersDemo && (
          <button type="button" className="button" onClick={() => void dashboard.openDemo()}>
            {APP_TEXT.demoButton}
          </button>
        )}
      </div>
    );
  }

  const revived = state.progress?.revived ?? null;
  const stages = STAGE_ORDER.map((id) => ({
    id,
    label: STAGE_LABELS[id],
    isEnterable: canEnterStage({ revived }, id),
  }));
  const goTo = (stage: Stage) => () => void ritual.applyStageChange(stage);

  return (
    <div className="stack">
      {back}
      <h1>{`${state.detail.core.owner}/${state.detail.core.name}`}</h1>
      <StageIndicator stages={stages} current={state.stage} ariaLabel={APP_TEXT.stagesLabel} onSelect={(stage) => void ritual.applyStageChange(stage)} />
      <StageHeading stageKey={state.stage}>{STAGE_LABELS[state.stage]}</StageHeading>
      {state.stage === 'necropsy' && <NecropsyStage open={state} displayContext={displayContext} now={now} onContinue={goTo('plan')} />}
      {state.stage === 'plan' && <PlanStage open={state} displayContext={displayContext} onContinue={goTo('rising')} continueLabel={STAGE_LABELS.rising} />}
      {state.stage === 'rising' && <RisingStage open={state} ritual={ritual} displayContext={displayContext} />}
      {state.stage === 'living' && (
        <div className="stack">
          <GardenPlot stage={5} />
          <Notice variant="success" variantLabel={APP_TEXT.success}>
            {RISING_TEXT.confirmation}
          </Notice>
          <button type="button" className="button button--primary" onClick={() => dashboard.showLiving()}>
            {STAGE_LABELS.living}
          </button>
        </div>
      )}
    </div>
  );
}
