// Stage indicator (design-system.md 5.2, resurrection-ritual task 11.1, Req 1.3, 12.1).
// Shows the four stages in display order. Each stage has a text label and a shape.
// The current stage is exposed with aria-current. All text comes in as props (the wording
// module owns the words), so this component contains no wording.
import type { Stage } from '../ritual/types';
import './StageIndicator.css';

export type StageIndicatorItem = {
  readonly id: Stage;
  /** Visible text label, from the wording module. */
  readonly label: string;
  /** False when entering this stage is not allowed (The Living before a revived record). */
  readonly isEnterable: boolean;
};

export type StageIndicatorProps = {
  readonly stages: readonly StageIndicatorItem[];
  readonly current: Stage;
  /** Accessible name of the navigation landmark. */
  readonly ariaLabel: string;
  /**
   * Called when the visitor picks an enterable stage other than the current one.
   * The state layer still enforces the stage rules (Req 1.6), so this is not the safeguard.
   */
  readonly onSelect: (stage: Stage) => void;
};

type ShapeKind = 'current' | 'open' | 'locked';

/** Distinct shapes: filled diamond (current), open circle (available), open square (not available). */
function StageShape({ kind }: { readonly kind: ShapeKind }) {
  return (
    <svg className="stage-indicator__shape" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {kind === 'current' && <path d="M8 1 15 8 8 15 1 8Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />}
      {kind === 'open' && <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {kind === 'locked' && (
        <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      )}
    </svg>
  );
}

export function StageIndicator({ stages, current, ariaLabel, onSelect }: StageIndicatorProps) {
  return (
    <nav className="stage-indicator" aria-label={ariaLabel}>
      <ol className="stage-indicator__list">
        {stages.map((stage) => {
          const isCurrent = stage.id === current;
          const shape: ShapeKind = isCurrent ? 'current' : stage.isEnterable ? 'open' : 'locked';
          const className = `stage-indicator__button${isCurrent ? ' stage-indicator__button--current' : ''}`;
          return (
            <li key={stage.id} className="stage-indicator__item">
              <button
                type="button"
                className={className}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={!stage.isEnterable && !isCurrent ? true : undefined}
                onClick={() => {
                  if (isCurrent || !stage.isEnterable) return;
                  onSelect(stage.id);
                }}
              >
                <StageShape kind={shape} />
                <span className="stage-indicator__label">{stage.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
