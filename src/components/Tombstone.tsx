// Tombstone card (design-system.md 5.1, graveyard-dashboard task 5.3, R4).
// The whole card is one button with an accessible name from the view model. Status is shown by
// text and an icon. All text from GitHub is rendered as plain text. Unknown values are left out.
import { Fragment } from 'react';
import type { TombstoneView } from './tombstone-view';
import { TOMBSTONE_TEXT } from './tombstone-view';
import { ConditionIcon } from './ConditionIcon';
import { Ghost } from './scenery/Ghost';
import { TombstoneBase } from './scenery/TombstoneBase';
import './Tombstone.css';

export type TombstoneProps = {
  readonly view: TombstoneView;
  readonly onOpen: (owner: string, name: string) => void;
};

export function Tombstone({ view, onOpen }: TombstoneProps) {
  // Same order as the accessible name. The spaces between the spans give the card's text real word
  // breaks for tools that read its text content. Flex layout ignores them.
  const flagLabels = [
    ...(view.flags.includes('archived') ? [TOMBSTONE_TEXT.archivedFlag] : []),
    ...(view.flags.includes('fork') ? [TOMBSTONE_TEXT.forkFlag] : []),
    ...(view.language !== null ? [view.language] : []),
  ];
  return (
    <li className="tombstone" data-condition={view.conditionId}>
      <Ghost pose="curious" size={36} className="tombstone__ghost" />
      <button
        type="button"
        className="tombstone__button"
        aria-label={view.accessibleName}
        onClick={() => onOpen(view.owner, view.name)}
      >
        <span className="tombstone__name">
          {view.showOwner ? `${view.owner}/` : ''}
          {view.name}
        </span>{' '}
        <span className="tombstone__status">
          <ConditionIcon condition={view.conditionId} />
          <span>{view.conditionLabel}</span>
        </span>{' '}
        {view.conditionId !== 'last-update-unknown' && <span className="tombstone__fact">{view.fact}</span>}{' '}
        <span className="tombstone__flags">
          {flagLabels.map((flag) => (
            <Fragment key={flag}>
              <span className="tombstone__flag">{flag}</span>{' '}
            </Fragment>
          ))}
        </span>{' '}
        <span className="tombstone__description">{view.description ?? TOMBSTONE_TEXT.noDescription}</span>
        <TombstoneBase condition={view.conditionId} />
      </button>
    </li>
  );
}
