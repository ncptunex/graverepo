// Condition icons (graveyard-dashboard task 5.3). Simple SVG shapes, one per condition.
// Hidden from assistive technology: the text label always carries the meaning.
import type { ConditionId } from '../ritual/types';

export function ConditionIcon({ condition }: { readonly condition: ConditionId }) {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false" className="tombstone__icon">
      {condition === 'archived' && (
        <path d="M2 4h12v3H2zM3 7v6h10V7M6.5 9.5h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {condition === 'empty' && <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />}
      {condition === 'last-update-unknown' && (
        <path d="M6 6a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.5M8 12v1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
      {condition === 'recently-updated' && (
        <path d="M8 13V6M8 6C8 3.5 5.5 3 4 3c0 2.5 1.5 3 4 3zM8 8c0-2 2-3 4-3 0 2-1.5 3-4 3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {condition === 'resting' && (
        <path d="M3 14V7a5 5 0 0 1 10 0v7zM6 8h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {condition === 'dormant' && (
        <path d="M3 14V7a5 5 0 0 1 10 0v7zM5 9l2 2M9 9l2 2M7 7h2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}
