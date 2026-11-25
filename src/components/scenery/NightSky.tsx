// The night scene behind a heading: stars, moon, two bats and layered hills with small stones.
// Pure decoration. It is hidden from assistive technology and holds no text. Positions are fixed
// numbers, so the picture is the same every time.
import './scenery.css';

export type NightSkyProps = {
  /** `hero` is taller and shows the full scene. `band` is a slim strip for list screens. */
  readonly variant?: 'hero' | 'band';
};

const STARS: ReadonlyArray<readonly [number, number, number, boolean]> = [
  [40, 30, 1.2, false],
  [110, 62, 1, true],
  [170, 24, 1.4, false],
  [250, 70, 1, false],
  [320, 36, 1.2, true],
  [410, 20, 1, false],
  [470, 74, 1.4, false],
  [540, 40, 1, true],
  [610, 18, 1.2, false],
  [700, 82, 1, false],
  [760, 34, 1.4, true],
  [830, 66, 1, false],
  [900, 22, 1.2, false],
  [970, 90, 1, true],
  [1040, 44, 1.4, false],
  [1110, 16, 1, false],
  [1180, 76, 1.2, true],
  [1250, 34, 1, false],
  [1310, 96, 1.4, false],
  [1470, 22, 1.2, true],
  [1540, 60, 1, false],
  [90, 96, 1, false],
  [360, 96, 1, false],
  [640, 56, 1, false],
];
const BAT = 'M0 0q4-6 8 0q4-6 8 0q-4 1-8 6q-4-5-8-6z';

export function NightSky({ variant = 'band' }: NightSkyProps) {
  return (
    <div className={`night-sky night-sky--${variant}`} aria-hidden="true">
      <svg viewBox="0 0 1600 220" preserveAspectRatio="xMaxYMax slice" focusable="false">
        <defs>
          <radialGradient id={`moon-glow-${variant}`}>
            <stop offset="0" stopColor="#e8e4ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#e8e4ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {STARS.map(([x, y, r, twinkles]) => (
          <circle key={`${x}-${y}`} className={twinkles ? 'night-sky__star night-sky__star--twinkle' : 'night-sky__star'} cx={x} cy={y} r={r} />
        ))}
        <circle cx="1400" cy="74" r="70" fill={`url(#moon-glow-${variant})`} />
        <circle className="night-sky__moon" cx="1400" cy="74" r="26" />
        <circle className="night-sky__crater" cx="1392" cy="68" r="5" />
        <circle className="night-sky__crater" cx="1412" cy="84" r="3.5" />
        <g className="night-sky__bat night-sky__bat--one" transform="translate(1160 64)">
          <path className="night-sky__bat-shape" d={BAT} />
        </g>
        <g className="night-sky__bat night-sky__bat--two" transform="translate(1208 100) scale(0.7)">
          <path className="night-sky__bat-shape" d={BAT} />
        </g>
        <path className="night-sky__hill night-sky__hill--far" d="M0 170C240 140 440 150 660 168S1120 160 1600 150V220H0z" />
        <path className="night-sky__hill night-sky__hill--near" d="M0 196C280 176 520 184 800 194S1300 186 1600 178V220H0z" />
        <g className="night-sky__stone">
          <path d="M120 196v-18a9 9 0 0 1 18 0v18z" />
          <path d="M156 194v-12a7 7 0 0 1 14 0v12z" />
          <path d="M300 200v-16a8 8 0 0 1 16 0v16z" />
          <path d="M520 198v-14a8 8 0 0 1 16 0v14z" />
          <path d="M556 200v-10a6 6 0 0 1 12 0v10z" />
          <path d="M900 196v-16a9 9 0 0 1 18 0v16z" />
          <path d="M1060 194v-12a7 7 0 0 1 14 0v12z" />
          <path d="M1290 192v-14a8 8 0 0 1 16 0v14z" />
          <path d="M1520 190v-16a9 9 0 0 1 18 0v16z" />
        </g>
      </svg>
    </div>
  );
}
