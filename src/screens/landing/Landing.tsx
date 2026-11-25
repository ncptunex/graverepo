// Landing (graveyard-dashboard task 5.2, R1). Name, tagline, introduction, the four stages, the
// search form, the demo button and the empty-state line. Static: no data is loaded here.
// The night scene and the ghost are decoration and are hidden from assistive technology.
import { SearchForm } from '../../components/SearchForm';
import { ViewHeading } from '../../components/ViewHeading';
import { Ghost } from '../../components/scenery/Ghost';
import { NightSky } from '../../components/scenery/NightSky';
import { StageGlyph } from '../../components/scenery/StageGlyph';
import { APP_TEXT } from '../../components/ui-text';
import './Landing.css';

export type LandingProps = {
  readonly onSearch: (text: string) => void;
  readonly onDemo: () => void;
};

export function Landing({ onSearch, onDemo }: LandingProps) {
  return (
    <div className="landing stack">
      <header className="landing__hero">
        <NightSky variant="hero" />
        <div className="landing__hero-text stack">
          <ViewHeading viewKey="landing">{APP_TEXT.name}</ViewHeading>
          <p className="landing__tagline">{APP_TEXT.tagline}</p>
          <p className="landing__intro">{APP_TEXT.intro}</p>
        </div>
        <Ghost pose="happy" size={88} className="landing__ghost" />
      </header>

      <div className="landing__body">
        <section aria-labelledby="landing-stages" className="landing__stages">
        <h2 id="landing-stages">{APP_TEXT.stagesHeading}</h2>
        <ol className="landing__stage-list">
          {APP_TEXT.stages.map((stage) => (
            <li key={stage.name} className="landing__stage">
              <StageGlyph stage={stage.id} />
              <span>
                <strong>{stage.name}</strong>
                <br />
                <span className="muted">{stage.meaning}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="landing__entries stack">
        <section aria-labelledby="landing-search" className="landing__panel stack">
          <h2 id="landing-search">{APP_TEXT.searchHeading}</h2>
          <SearchForm onSearch={onSearch} />
          <p className="muted">{APP_TEXT.emptySearch}</p>
        </section>
        <section aria-labelledby="landing-demo" className="landing__panel landing__panel--demo stack">
          <h2 id="landing-demo">{APP_TEXT.landingDemoHeading}</h2>
          <p className="muted">{APP_TEXT.demoHelp}</p>
          <div className="row">
            <button type="button" className="button button--primary" onClick={onDemo}>
              {APP_TEXT.demoButton}
            </button>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
