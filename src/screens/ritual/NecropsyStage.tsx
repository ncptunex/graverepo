// Necropsy stage (resurrection-ritual task 12). Shows provenance once, the condition with its fact,
// the findings in catalogue order with fact and interpretation kept apart, which findings lead
// to a step, and the not-applicable findings grouped. All text comes from the wording module.
import { DataSourceBadge } from '../../components/DataSourceBadge';
import { FindingRow } from '../../components/FindingRow';
import { Notice } from '../../components/Notice';
import { describeProvenance } from '../../components/provenance-text';
import { APP_TEXT } from '../../components/ui-text';
import { FINDING_UI, NECROPSY_TEXT, conditionLine, findingText } from '../../components/wording';
import { makeError } from '../../data/github';
import type { RitualState } from '../../state/ritual-session';
import type { DisplayContext } from '../../ritual/types';

type OpenState = Extract<RitualState, { status: 'open' }>;

export type NecropsyStageProps = {
  readonly open: OpenState;
  readonly displayContext: DisplayContext;
  readonly now: string;
  readonly onContinue: () => void;
};

export function NecropsyStage({ open, displayContext, now, onContinue }: NecropsyStageProps) {
  const { analysis, provenance, warnings, detail } = open;
  const reference = analysis.referenceTime;
  // The data layer reports a stale copy with a warning. Its reason comes from the error kind.
  const stale = warnings.find((warning) => warning.kind === 'stale-data');
  const label = describeProvenance(
    provenance,
    stale !== undefined && stale.kind === 'stale-data' ? makeError(stale.refreshErrorKind) : undefined,
    displayContext,
    now,
  );
  const mayNotComplete = warnings.some((warning) => warning.kind === 'may-not-complete');
  const rows = analysis.findings.map((finding) => ({
    finding,
    text: findingText(finding, reference, displayContext),
  }));
  const normal = rows.filter((row) => row.text.status !== 'not-applicable');
  const notApplicable = rows.filter((row) => row.text.status === 'not-applicable');

  return (
    <div className="stack necropsy">
      {label.text !== null && <DataSourceBadge source={provenance.source} label={label.text} timeIso={label.exactTime} />}
      {mayNotComplete && (
        <Notice variant="warning" variantLabel={APP_TEXT.warning}>
          {NECROPSY_TEXT.pendingEstimate}
        </Notice>
      )}
      <section className="panel stack necropsy__condition" aria-labelledby="necropsy-condition">
        <h3 id="necropsy-condition">{FINDING_UI.conditionHeading}</h3>
        <p>
          <strong>{FINDING_UI.conditionNoteLabel}</strong>{' '}
          {conditionLine(analysis.condition, detail.core.pushedAt, reference, displayContext)}
        </p>
      </section>
      <section aria-labelledby="necropsy-findings" className="necropsy__findings">
        <h3 id="necropsy-findings">{FINDING_UI.factsHeading}</h3>
        <ul className="plain-list">
          {normal.map(({ finding, text }) => (
            <FindingRow
              key={finding.id}
              label={text.label}
              fact={text.fact}
              status={text.status}
              stepMarker={finding.state === 'available' && finding.role === 'actionable' ? FINDING_UI.leadsToStep : undefined}
            />
          ))}
        </ul>
      </section>
      {notApplicable.length > 0 && (
        <section aria-labelledby="necropsy-na" className="necropsy__na">
          <h3 id="necropsy-na">{FINDING_UI.notApplicableHeading}</h3>
          <ul className="plain-list">
            {notApplicable.map(({ finding, text }) => (
              <FindingRow key={finding.id} label={text.label} fact={text.fact} status={text.status} />
            ))}
          </ul>
        </section>
      )}
      <button type="button" className="button button--primary" onClick={onContinue}>
        {NECROPSY_TEXT.continue}
      </button>
    </div>
  );
}
