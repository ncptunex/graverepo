// Dashboard interface text. One place for every label and line the dashboard screens show, so a
// string is not repeated across components. Lines come from voice-and-honesty.md (5.5 to 5.10)
// or are plain interface labels (dashboard design 8.1 "Control labels"). The introduction,
// stage meanings and a longer footer note are NOT here: they are not approved (design 8.1 fallback).
export const APP_TEXT = {
  name: 'GRAVEREPO',
  tagline: 'Dig up your forgotten code.',
  // Landing wording: the proposal in dashboard design 8.1. It follows R1.2 and R1.3 (reads public
  // data, "revived" is local, nothing changes on GitHub). Not yet merged into voice-and-honesty.md.
  intro:
    "GRAVEREPO looks at a GitHub account's public repositories and shows what can be seen about each one. Open a tombstone to look at the evidence, get a suggested plan and tick it off. GRAVEREPO only reads public GitHub data. It doesn't change anything on GitHub, and \"revived\" only means you finished the steps here.",
  stagesHeading: 'How it works',
  stages: [
    { id: 'necropsy' as const, name: 'Necropsy', meaning: 'Look at the evidence.' },
    { id: 'plan' as const, name: 'Plan', meaning: 'A suggested list of steps.' },
    { id: 'rising' as const, name: 'Rising', meaning: 'Tick the steps off.' },
    { id: 'living' as const, name: 'The Living', meaning: 'Repositories you revived here.' },
  ],
  searchHeading: 'Search GitHub',
  landingDemoHeading: 'Or just look around',
  demoHelp: 'The demo graveyard needs no username.',
  skipLink: 'Skip to content',
  mainNav: 'Main',
  footerNote: "GRAVEREPO doesn't change anything on GitHub.\nMade by Chan Jie Lin for Kiroween 2026 :D",
  demoNav: 'Demo graveyard',
  livingNav: (count: number) => `The Living (${count})`,
  // Interface labels
  searchLabel: 'GitHub username or organisation',
  searchButton: 'Search',
  demoButton: 'Explore the demo graveyard',
  includeForks: 'Include forks',
  includeArchived: 'Include archived',
  clearFilters: 'Clear filters',
  filterLabel: 'Filter by name or description',
  backToGraveyard: 'Back to the graveyard',
  retry: 'Try again',
  organisation: 'Organisation',
  viewProfile: 'View profile on GitHub',
  // States (voice 5.6 and 5.7)
  emptySearch: 'Search for a GitHub username, or explore the demo graveyard.',
  lookingFor: (name: string) => `Looking for ${name}…`,
  loadingRepositories: 'Loading repositories…',
  openingDemo: 'Opening the demo graveyard…',
  slow: 'GitHub is taking a while. You can keep waiting or try the demo.',
  noPublicRepositories: (name: string) => `${name} has no public repositories yet. Nothing to dig up here.`,
  noMatches: (total: number) => `No repositories match these filters. Clear the filters to see all ${total}.`,
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} repositories`,
  graveyardOf: (login: string) => `Graveyard of ${login}`,
  demoHeading: 'Demo graveyard',
  fallbackAccountName: 'this account',
  // Not in the voice document: the friendly fallback of the app's error boundary and its view names.
  unexpectedProblem: 'Something unexpected went wrong. Reload the page to try again.',
  reload: 'Reload the page',
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
  success: 'Done',
  stagesLabel: 'Ritual stages',
  ritualHeadingFallback: 'Repository',
} as const;

/** A neutral name for headings, never empty or "undefined" (voice 5.10). */
export function safeName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed === '' ? APP_TEXT.fallbackAccountName : trimmed;
}
