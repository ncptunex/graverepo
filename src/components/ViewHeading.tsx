// The `h1` of a dashboard view. Focus moves here when the view changes (design 5.1), but not on the
// very first page load.
// It is focusable by script only (tabIndex -1). Reuses `focusElement` from the stage heading.
import { useEffect, useRef } from 'react';
import { focusElement } from './StageHeading';

export type ViewHeadingProps = {
  /** Changes when the view changes. Focus moves on each change. */
  readonly viewKey: string;
  readonly children: string;
};

// True until the visitor has left the first landing view. On the first page load focus stays at
// the top of the page, so the skip link and the header controls come first in the tab order.
// A module flag (not a ref) so React Strict Mode's second effect run in development behaves the same.
let isFirstView = true;

export function ViewHeading({ viewKey, children }: ViewHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isFirstView && viewKey === 'landing') return;
    isFirstView = false;
    focusElement(ref.current);
  }, [viewKey]);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
