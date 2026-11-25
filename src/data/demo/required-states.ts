// The nine states the demo graveyard must show together (Requirement 8.5), and the
// observable test for each one. The capture script and the demo tests both use these,
// so "covered" means the same thing in both places.
//
// The tests read only observed fields of a repository detail. "Recently active" and
// "inactive" use the last push date against the same 12-month window as the activity
// window (D15). They are demo-coverage checks and are not the ritual's condition rules.
import type { RepositoryDetail } from '../github/types';

export type RequiredState = {
  /** 1 to 9, the order used in `demo-notes.md`. */
  readonly number: number;
  readonly label: string;
  /** True when this repository detail shows the state. `windowStart` is the 12-month window start. */
  readonly isShownBy: (detail: RepositoryDetail, windowStart: string) => boolean;
};

function pushedWithinWindow(detail: RepositoryDetail, windowStart: string): boolean | null {
  const pushedAt = detail.core.pushedAt;
  if (pushedAt === null) return null;
  return Date.parse(pushedAt) >= Date.parse(windowStart);
}

export const REQUIRED_STATES: readonly RequiredState[] = [
  {
    number: 1,
    label: 'Recently active',
    isShownBy: (detail, windowStart) => pushedWithinWindow(detail, windowStart) === true,
  },
  {
    number: 2,
    label: 'Inactive for more than 12 months',
    isShownBy: (detail, windowStart) => pushedWithinWindow(detail, windowStart) === false,
  },
  { number: 3, label: 'Archived', isShownBy: (detail) => detail.core.isArchived },
  { number: 4, label: 'Fork', isShownBy: (detail) => detail.core.isFork },
  {
    number: 5,
    label: 'Without a README',
    isShownBy: (detail) =>
      detail.sections.readme.status === 'available' && !detail.sections.readme.value.found,
  },
  {
    number: 6,
    label: 'With GitHub Actions runs',
    isShownBy: (detail) =>
      detail.sections.ci.status === 'available' && detail.sections.ci.value.found,
  },
  {
    number: 7,
    label: 'Without GitHub Actions runs',
    isShownBy: (detail) =>
      detail.sections.ci.status === 'available' && !detail.sections.ci.value.found,
  },
  {
    number: 8,
    label: 'With a root dependency manifest',
    isShownBy: (detail) =>
      detail.sections.manifest.status === 'available' &&
      detail.sections.manifest.value.fileName !== null,
  },
  {
    number: 9,
    label: 'With open issues',
    isShownBy: (detail) =>
      detail.sections.openIssues.status === 'available' && detail.sections.openIssues.value.count > 0,
  },
];

/** The state numbers a detail shows. */
export function statesShownBy(detail: RepositoryDetail, windowStart: string): number[] {
  return REQUIRED_STATES.filter((state) => state.isShownBy(detail, windowStart)).map(
    (state) => state.number,
  );
}

/** The state numbers that no detail in the list shows. */
export function uncoveredStates(details: readonly RepositoryDetail[], windowStart: string): number[] {
  return REQUIRED_STATES.filter(
    (state) => !details.some((detail) => state.isShownBy(detail, windowStart)),
  ).map((state) => state.number);
}
