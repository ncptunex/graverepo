// The garden picture for the Rising stage and The Living. One tombstone that grows from bare
// and cracked into a flourishing plot as `stage` rises from 0 to 5 (see `garden-stage.ts`).
// Pure decoration: hidden from assistive technology. The progress text and meter next to it
// carry the real information. Layers fade in with CSS only, and not at all under reduced motion.
import type { GardenStage } from '../garden-stage';
import { GhostShape, type GhostPose } from './GhostShape';
import './scenery.css';

export type GardenPlotProps = {
  readonly stage: GardenStage;
};

function ghostPose(stage: GardenStage): GhostPose {
  if (stage >= 5) return 'happy';
  if (stage >= 3) return 'curious';
  return 'calm';
}

export function GardenPlot({ stage }: GardenPlotProps) {
  const on = (from: number) => (stage >= from ? 'true' : 'false');
  return (
    <div className="garden" data-stage={stage} aria-hidden="true">
      <svg viewBox="0 0 320 200" focusable="false">
        <ellipse className="garden__glow" cx="160" cy="110" rx="120" ry="80" />
        <path className="garden__ground" d="M0 158C70 144 130 150 160 152S270 146 320 156V200H0z" />

        <svg className="ghost garden__ghost" x="226" y="84" width="40" height="47" viewBox="0 0 48 56">
          <GhostShape pose={ghostPose(stage)} />
        </svg>

        <path className="garden__stone" d="M124 160V98a36 36 0 0 1 72 0V160z" />
        <path className="garden__stone-face" d="M134 160V100a26 26 0 0 1 52 0V160z" />
        <path className="garden__engraving" d="M150 112h20M150 122h20M160 132v10" />

        <g className="garden__layer garden__layer--cracks" data-on={stage <= 1 ? 'true' : 'false'}>
          <path className="garden__crack" d="M176 78l-6 12 7 8-5 12M138 112l8-5 2 9" />
        </g>

        <g className="garden__layer" data-on={on(1)}>
          <ellipse className="garden__moss" cx="136" cy="159" rx="18" ry="6" />
          <ellipse className="garden__moss" cx="186" cy="159" rx="16" ry="5" />
          <path className="garden__moss" d="M128 98a36 36 0 0 1 12-22l4 8-8 6z" />
        </g>

        <g className="garden__layer" data-on={on(2)}>
          <path className="garden__stem" d="M96 160c0-10 0-16 2-22M98 146c-6-1-10-5-11-10 6 0 10 4 11 10zM99 142c5-1 9-5 9-10-6 0-9 4-9 10z" />
          <path className="garden__stem" d="M246 160c0-8 0-14-2-20M244 148c-5-1-9-4-10-9 5 0 9 3 10 9zM244 144c4-1 8-4 8-9-5 0-8 3-8 9z" />
        </g>

        <g className="garden__layer" data-on={on(3)}>
          <path className="garden__stem" d="M78 160V132M112 160V138M268 160V136" />
          <circle className="garden__petal garden__petal--pumpkin" cx="78" cy="128" r="6" />
          <circle className="garden__heart" cx="78" cy="128" r="2.4" />
          <circle className="garden__petal garden__petal--lavender" cx="112" cy="134" r="5.5" />
          <circle className="garden__heart" cx="112" cy="134" r="2.2" />
          <circle className="garden__petal garden__petal--pumpkin" cx="268" cy="132" r="6" />
          <circle className="garden__heart" cx="268" cy="132" r="2.4" />
        </g>

        <g className="garden__layer" data-on={on(4)}>
          <path className="garden__mushroom-stem" d="M206 160v-9M214 160v-6" />
          <path className="garden__cap garden__cap--pumpkin" d="M198 152a10 8 0 0 1 20 0z" />
          <path className="garden__cap garden__cap--lavender" d="M209 155a7 6 0 0 1 14 0z" />
          <circle className="garden__spore" cx="204" cy="148" r="1.4" />
          <circle className="garden__spore" cx="212" cy="146" r="1.2" />
          <path className="garden__mushroom-stem" d="M56 160v-8" />
          <path className="garden__cap garden__cap--lavender" d="M48 153a8 6.5 0 0 1 16 0z" />
        </g>

        <g className="garden__layer" data-on={on(5)}>
          <path className="garden__post" d="M290 160V96q0-8-8-8h-14" />
          <path className="garden__lantern-frame" d="M258 90h20v4h-20z" />
          <rect className="garden__lantern" x="260" y="94" width="16" height="20" rx="3" />
          <circle className="garden__lantern-glow" cx="268" cy="104" r="22" />
          <circle className="garden__firefly" cx="60" cy="100" r="2" />
          <circle className="garden__firefly" cx="92" cy="84" r="1.6" />
          <circle className="garden__firefly" cx="236" cy="62" r="1.8" />
          <circle className="garden__petal garden__petal--mint" cx="160" cy="152" r="4" />
          <circle className="garden__petal garden__petal--lavender" cx="172" cy="154" r="3.2" />
        </g>
      </svg>
    </div>
  );
}
