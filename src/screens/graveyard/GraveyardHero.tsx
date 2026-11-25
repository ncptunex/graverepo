// The night-sky band behind a graveyard screen's heading. The heading and its details sit on a
// dark scrim over the sky, so text stays readable. The sky itself is decoration.
import type { ReactNode } from 'react';
import { NightSky } from '../../components/scenery/NightSky';

export function GraveyardHero({ children }: { readonly children: ReactNode }) {
  return (
    <header className="graveyard__hero">
      <NightSky variant="band" />
      <div className="graveyard__hero-text stack">{children}</div>
    </header>
  );
}
