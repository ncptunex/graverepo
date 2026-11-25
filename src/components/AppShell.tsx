// App shell structure (graveyard-dashboard task 4.4, R10, design 5.1).
// Skip link, one header, one main, one footer. Only structure lives here. All text (skip link
// label, header content, footer note) comes in as props, because that wording waits for the
// voice update (dashboard design 8.1). `App.tsx` is not wired to this until the wording is approved.
import type { ReactNode } from 'react';
import './AppShell.css';

export const MAIN_ID = 'main-content';

export type AppShellProps = {
  /** Visible text of the "skip to content" link. */
  readonly skipLinkLabel: string;
  readonly header: ReactNode;
  readonly footer: ReactNode;
  readonly children: ReactNode;
};

export function AppShell({ skipLinkLabel, header, footer, children }: AppShellProps) {
  return (
    <>
      <a className="app-shell__skip-link" href={`#${MAIN_ID}`}>
        {skipLinkLabel}
      </a>
      <header className="app-shell__header">{header}</header>
      <main id={MAIN_ID} className="app-shell__main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-shell__footer">{footer}</footer>
    </>
  );
}
