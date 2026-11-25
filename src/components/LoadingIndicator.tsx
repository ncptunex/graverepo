// Loading indicator (graveyard-dashboard task 4.2, R9.1, R13.5).
// A small ghost that bobs while loading. It is static under `prefers-reduced-motion: reduce`.
// The text comes in as a prop. Announcing it is the job of a LiveRegion on the screen.
import { Ghost } from './scenery/Ghost';
import './LoadingIndicator.css';

export type LoadingIndicatorProps = {
  /** Visible text that says what is loading, from the wording module. */
  readonly label: string;
};

export function LoadingIndicator({ label }: LoadingIndicatorProps) {
  return (
    <p className="loading-indicator">
      <Ghost pose="curious" size={28} className="loading-indicator__shape" />
      <span>{label}</span>
    </p>
  );
}
