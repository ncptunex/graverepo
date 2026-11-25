// A small drawn glyph for each ritual stage on the landing page. Decoration beside the stage name.
// One stroke weight (1.6) and round caps, like the condition icons.
import type { Stage } from '../../ritual/types';
import './scenery.css';

export function StageGlyph({ stage }: { readonly stage: Stage }) {
  return (
    <svg className="stage-glyph" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      {stage === 'necropsy' && (
        <>
          <circle cx="13" cy="13" r="7" />
          <path d="M18.5 18.5 26 26M10 13h6M13 10v6" />
        </>
      )}
      {stage === 'plan' && (
        <>
          <path d="M8 5h14a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H8z" />
          <path d="M12 11h8M12 16h8M12 21h5" />
        </>
      )}
      {stage === 'rising' && (
        <>
          <path d="M16 27V14M16 18c-6 0-9-3-9-8 6 0 9 3 9 8zM16 15c0-4 3-7 8-7 0 5-3 7-8 7z" />
          <path d="M8 27h16" />
        </>
      )}
      {stage === 'living' && (
        <>
          <circle cx="16" cy="12" r="3" />
          <path d="M16 6a3 3 0 0 1 0 3M16 18a3 3 0 0 0 0-3M10 12a3 3 0 0 1 3 0M22 12a3 3 0 0 0-3 0" />
          <path d="M16 18v9M16 23c-3 0-5-1-6-4 3 0 5 1 6 4z" />
        </>
      )}
    </svg>
  );
}
