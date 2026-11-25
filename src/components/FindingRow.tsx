// Finding / evidence row (design-system.md 5.3, resurrection-ritual task 11.2, Req 2.14, 2.15, 4.5).
// A plain label and the observed fact. An interpretation, if any, sits in a separate, labelled
// block. "Leads to a suggested step" is shown with an icon shape and text. Provenance is not shown
// per row (the screen shows it once). All text comes in as props.
import './FindingRow.css';

export type FindingRowStatus = 'available' | 'unavailable' | 'not-applicable';

export type FindingRowProps = {
  /** Plain label of the finding. */
  readonly label: string;
  /** The observed fact, or the "couldn't be checked" / "not applicable" wording. */
  readonly fact: string;
  readonly status: FindingRowStatus;
  /** When present, the finding leads to a suggested step, and this is the text that says so. */
  readonly stepMarker?: string;
  /** GRAVEREPO's reading, kept apart from the fact. Both texts come from the wording module. */
  readonly interpretation?: { readonly label: string; readonly text: string };
};

function StatusShape({ status }: { readonly status: FindingRowStatus }) {
  return (
    <svg className="finding-row__status" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {status === 'available' && <circle cx="8" cy="8" r="5.5" fill="currentColor" />}
      {status === 'unavailable' && (
        <path d="M5 5.5a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5M8 12v1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
      {status === 'not-applicable' && <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

function StepShape() {
  return (
    <svg className="finding-row__step-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Render inside a list element (`ul` or `ol`). */
export function FindingRow({ label, fact, status, stepMarker, interpretation }: FindingRowProps) {
  return (
    <li className={`finding-row finding-row--${status}`}>
      <div className="finding-row__head">
        <StatusShape status={status} />
        <span className="finding-row__label">{label}</span>
      </div>
      <p className="finding-row__fact">{fact}</p>
      {interpretation && (
        <p className="finding-row__interpretation">
          <span className="finding-row__interpretation-label">{interpretation.label}</span> {interpretation.text}
        </p>
      )}
      {stepMarker && (
        <p className="finding-row__step">
          <StepShape />
          <span>{stepMarker}</span>
        </p>
      )}
    </li>
  );
}
