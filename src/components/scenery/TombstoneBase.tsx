// The picture at the foot of a tombstone card, chosen by the repository's condition. Moss and
// sprouts, a mushroom, a fence, an empty plot and so on. It is decoration only: the card's text
// label and icon carry the status, and this is hidden from assistive technology.
import type { ConditionId } from '../../ritual/types';
import './scenery.css';

export function TombstoneBase({ condition }: { readonly condition: ConditionId }) {
  return (
    <>
      {/* "meet" keeps the little sprouts, mushrooms and fence at their drawn shape on wide stones. The ground
          runs far past both edges of the drawing so it still reaches the sides of the card. */}
      <svg className="tombstone-art tombstone-art--base" viewBox="0 0 240 36" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
        <path className="tombstone-art__ground" d="M-600 36V24H0C40 16 80 22 120 20S200 14 240 22H840V36z" />
        {condition === 'recently-updated' && (
          <g className="tombstone-art__plant">
            <path d="M44 24c0-6 0-10 2-14M46 16c-4 0-7-3-8-6 4 0 7 2 8 6zM46 13c3-1 6-3 6-7-4 0-6 3-6 7z" />
            <path d="M190 22c0-5 0-9-2-12M188 15c4-1 6-3 7-6-4 0-7 2-7 6zM188 12c-3-1-5-3-5-6 4 0 5 2 5 6z" />
            <path d="M214 24v-8M214 16c-3 0-5-2-5-4 3 0 5 1 5 4z" />
          </g>
        )}
        {condition === 'resting' && (
          <g>
            <path className="tombstone-art__stem" d="M196 24v-7M205 24v-4" />
            <path className="tombstone-art__cap tombstone-art__cap--pumpkin" d="M189 18a7.5 6 0 0 1 15 0z" />
            <path className="tombstone-art__cap tombstone-art__cap--lavender" d="M200 21a5 4.5 0 0 1 10 0z" />
            <ellipse className="tombstone-art__moss" cx="40" cy="24" rx="16" ry="4.5" />
            <ellipse className="tombstone-art__moss" cx="64" cy="25" rx="9" ry="3" />
          </g>
        )}
        {condition === 'dormant' && (
          <g>
            <ellipse className="tombstone-art__moss" cx="36" cy="24" rx="20" ry="5" />
            <ellipse className="tombstone-art__moss" cx="200" cy="23" rx="16" ry="4.5" />
            <path className="tombstone-art__stem" d="M214 24v-5M222 24v-3" />
            <path className="tombstone-art__cap tombstone-art__cap--lavender" d="M209 20a5.5 4.5 0 0 1 11 0z" />
          </g>
        )}
        {condition === 'archived' && (
          <g className="tombstone-art__fence">
            {[24, 48, 72, 96, 144, 168, 192, 216].map((x) => (
              <path key={x} d={`M${x - 4} 28V14l4-5 4 5v14z`} />
            ))}
            <path d="M16 18H228M16 25H228" />
          </g>
        )}
        {condition === 'empty' && (
          <g>
            <ellipse className="tombstone-art__plot" cx="120" cy="25" rx="44" ry="6" />
            <path className="tombstone-art__stem" d="M120 24v-3" />
          </g>
        )}
        {condition === 'last-update-unknown' && (
          <path className="tombstone-art__question" d="M114 14a6 6 0 1 1 9 5c-2 1.2-3 2.4-3 5M120 29v1" />
        )}
      </svg>
      {condition === 'dormant' && (
        <>
          <svg className="tombstone-art tombstone-art--web" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
            <path d="M0 0H44M0 0V44M0 0L38 38M0 12Q12 12 12 0M0 24Q24 24 24 0M0 36Q36 36 36 0" />
          </svg>
          <svg className="tombstone-art tombstone-art--crack" viewBox="0 0 40 56" aria-hidden="true" focusable="false">
            <path d="M30 0l-7 14 8 8-6 14 5 8" />
          </svg>
        </>
      )}
    </>
  );
}
