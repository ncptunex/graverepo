// Live regions (resurrection-ritual task 11.3, Req 6.11, 12.2, tech.md section 11).
// Polite: loading and progress messages, announced without moving focus.
// Alert: errors. The region element is always rendered (even when empty) because screen readers
// announce changes inside a region that already exists. Messages come in as props.
import './LiveRegion.css';

export type LiveRegionKind = 'polite' | 'alert';

export type LiveRegionProps = {
  readonly kind: LiveRegionKind;
  /** The text to announce. Null or empty leaves the region empty. */
  readonly message: string | null;
  /** Hide the text visually and keep it for assistive technology only. Default false. */
  readonly isVisuallyHidden?: boolean;
};

/** The ARIA role for each kind. Polite uses `status`, which is a polite live region. */
export function liveRegionRole(kind: LiveRegionKind): 'status' | 'alert' {
  return kind === 'alert' ? 'alert' : 'status';
}

export function LiveRegion({ kind, message, isVisuallyHidden = false }: LiveRegionProps) {
  return (
    <div
      className={isVisuallyHidden ? 'live-region live-region--hidden' : 'live-region'}
      role={liveRegionRole(kind)}
      aria-live={kind === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
