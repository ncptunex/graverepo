// Plan stage (resurrection-ritual task 13). The suggested steps, each tied to the fact behind it,
// with an evidence reveal (raw fields, and calculated values labelled as such).
import { Notice } from '../../components/Notice';
import { APP_TEXT } from '../../components/ui-text';
import { PLAN_TEXT, evidenceText, findingLabel, planItemText } from '../../components/wording';
import type { DisplayContext } from '../../ritual/types';
import type { RitualState } from '../../state/ritual-session';
import './Ritual.css';

type OpenState = Extract<RitualState, { status: 'open' }>;

export type PlanStageProps = {
  readonly open: OpenState;
  readonly displayContext: DisplayContext;
  readonly onContinue: () => void;
  readonly continueLabel: string;
};

export function PlanStage({ open, displayContext, onContinue, continueLabel }: PlanStageProps) {
  const { plan } = open.analysis;
  return (
    <div className="stack">
      <p>{PLAN_TEXT.intro}</p>
      {open.planChanged && (
        <Notice variant="info" variantLabel={APP_TEXT.info}>
          {PLAN_TEXT.changedNote}
        </Notice>
      )}
      {plan.isArchived && (
        <Notice variant="warning" variantLabel={APP_TEXT.warning}>
          {PLAN_TEXT.archivedNote}
        </Notice>
      )}
      {plan.items.length === 0 ? (
        <p>{PLAN_TEXT.empty}</p>
      ) : (
        <ol className="plain-list stack plan__list">
          {plan.items.map((item) => {
            const text = planItemText(item, displayContext);
            return (
              <li key={item.id} className="panel">
                <p>{text.sentence}</p>
                <details>
                  <summary>{PLAN_TEXT.showEvidence}</summary>
                  <h3>{PLAN_TEXT.evidenceHeading}</h3>
                  <ul>
                    {item.evidence.map((evidence) => {
                      const shown = evidenceText(evidence);
                      return (
                        <li key={evidence.field}>
                          <code>{shown.field}</code>: {shown.value}
                        </li>
                      );
                    })}
                  </ul>
                  {item.derived.length > 0 && (
                    <>
                      <h3>{PLAN_TEXT.derivedHeading}</h3>
                      <ul>
                        {item.derived.map((derived) => (
                          <li key={derived.name}>
                            <code>{derived.name}</code>: {derived.value === null ? 'Not available' : String(derived.value)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </details>
              </li>
            );
          })}
        </ol>
      )}
      {plan.unavailableFindingIds.length > 0 && (
        <div>
          <p>{PLAN_TEXT.notChecked}</p>
          <ul>
            {plan.unavailableFindingIds.map((id) => (
              <li key={id}>{findingLabel(id)}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="button button--primary" onClick={onContinue}>
        {continueLabel}
      </button>
    </div>
  );
}
