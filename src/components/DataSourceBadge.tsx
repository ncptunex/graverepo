// Data source badge (design-system.md 5.9, resurrection-ritual task 11.2, Req 2.13).
// Shows where data came from (live, saved copy or demo) with the time. The label text is
// built by the wording module from the approved provenance labels (voice 4.2). This
// component only displays it and never builds or changes the wording.
import './DataSourceBadge.css';

export type DataSource = 'live' | 'cache' | 'demo';

export type DataSourceBadgeProps = {
  readonly source: DataSource;
  /** The full approved label, for example the saved-copy or demo line. */
  readonly label: string;
  /** Exact time as an ISO string, shown as a tooltip and machine-readable value. Optional. */
  readonly timeIso?: string;
};

function SourceShape({ source }: { readonly source: DataSource }) {
  return (
    <svg className="data-source-badge__shape" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {source === 'live' && <circle cx="8" cy="8" r="5.5" fill="currentColor" />}
      {source === 'cache' && (
        <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {source === 'demo' && <path d="M8 1.5 14.5 14h-13Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
  );
}

export function DataSourceBadge({ source, label, timeIso }: DataSourceBadgeProps) {
  return (
    <p className={`data-source-badge data-source-badge--${source}`} title={timeIso}>
      <SourceShape source={source} />
      <span className="data-source-badge__label">{label}</span>
    </p>
  );
}
