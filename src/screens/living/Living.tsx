// The Living (graveyard-dashboard task 5.6, R7). Repositories whose ritual the visitor finished
// here. "Revived" is local to GRAVEREPO and says so. The text list is the whole content.
import { ExternalLink } from '../../components/ExternalLink';
import { ViewHeading } from '../../components/ViewHeading';
import { Ghost } from '../../components/scenery/Ghost';
import { GardenPlot } from '../../components/scenery/GardenPlot';
import { StageGlyph } from '../../components/scenery/StageGlyph';
import { LIVING_TEXT, livingCaption, sourceLabel } from '../../components/wording';
import type { DisplayContext, RevivedRecord } from '../../ritual/types';
import './Living.css';

export type LivingProps = {
  readonly records: readonly RevivedRecord[];
  readonly displayContext: DisplayContext;
};

export function Living({ records, displayContext }: LivingProps) {
  return (
    <div className="stack living">
      <ViewHeading viewKey="living">{LIVING_TEXT.title}</ViewHeading>
      <p>{LIVING_TEXT.note}</p>
      {records.length === 0 ? (
        <p className="living__empty">
          <Ghost pose="calm" size={64} />
          <span>{LIVING_TEXT.empty}</span>
        </p>
      ) : (
        <>
          <GardenPlot stage={5} />
          <ul className="plain-list living__list">
            {records.map((record) => (
              <li key={`${record.source}:${record.owner}/${record.repo}`} className="panel living__item">
                <StageGlyph stage="living" />
                <div className="stack">
                  <p>
                    <strong>{`${record.owner}/${record.repo}`}</strong>
                  </p>
                  <p>{livingCaption(record, displayContext)}</p>
                  <p className="muted">{sourceLabel(record.source)}</p>
                  {record.wasArchived && <p>{LIVING_TEXT.archivedLabel}</p>}
                  <p>
                    <ExternalLink url={record.url}>{LIVING_TEXT.viewOnGitHub}</ExternalLink>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
