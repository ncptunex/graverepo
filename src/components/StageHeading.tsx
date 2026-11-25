// Stage heading with focus handling (resurrection-ritual task 11.3, Req 12.2).
// Focus moves to this heading when the stage changes, and once when the ritual opens, so
// keyboard and screen reader users land on the new content. The heading is focusable by
// script only (tabIndex -1), so it adds no extra tab stop.
import { useEffect, useRef } from 'react';
import './StageHeading.css';

/** The part of an element this module needs. Lets tests use a fake. */
export type Focusable = { focus(options?: { preventScroll?: boolean }): void };

/** Moves focus to an element if there is one. Does nothing for null. */
export function focusElement(element: Focusable | null): void {
  element?.focus({ preventScroll: false });
}

export type StageHeadingProps = {
  /** Changes whenever the stage changes (for example the stage ID). Focus moves on each change. */
  readonly stageKey: string;
  readonly children: string;
};

export function StageHeading({ stageKey, children }: StageHeadingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    focusElement(headingRef.current);
  }, [stageKey]);

  return (
    <h2 ref={headingRef} className="stage-heading" tabIndex={-1}>
      {children}
    </h2>
  );
}
