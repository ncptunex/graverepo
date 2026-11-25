// The app (graveyard-dashboard task 4.4). Wires the shell, the error boundary and the views to the
// dashboard and ritual sessions. Creating the sessions makes no GitHub request (R1.6).
import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Ghost } from './components/scenery/Ghost';
import { APP_TEXT } from './components/ui-text';
import { useSession } from './components/use-session';
import { Graveyard } from './screens/graveyard/Graveyard';
import { Landing } from './screens/landing/Landing';
import { Living } from './screens/living/Living';
import { RitualScreen } from './screens/ritual/RitualScreen';
import { systemClock } from './state/clock';
import { getDashboardSession } from './state/default-dashboard';
import { getRitualSession } from './state/default-session';
import './App.css';

function AppContent() {
  const dashboard = getDashboardSession();
  const ritual = getRitualSession();
  const dashboardState = useSession(dashboard);
  const ritualState = useSession(ritual);
  const displayContext = ritual.displayContext;
  const now = systemClock().toISOString();

  // The header count is a copy read from this device. It must be read again when a ritual is marked
  // as revived, or it stays one behind until the visitor opens The Living.
  const revivedAt = ritualState.status === 'open' ? (ritualState.progress?.revived?.revivedAt ?? null) : null;

  useEffect(() => {
    // Reads the revived list from this device only. No request.
    dashboard.refreshRevivedCount();
  }, [dashboard, revivedAt]);

  const header = (
    <div className="app-header">
      <button type="button" className="app-header__logo" onClick={() => dashboard.goHome()}>
        <Ghost pose="calm" size={26} />
        <span>{APP_TEXT.name}</span>
      </button>
      <nav aria-label={APP_TEXT.mainNav} className="row">
        <button type="button" className="button" onClick={() => void dashboard.openDemo()}>
          {APP_TEXT.demoNav}
        </button>
        <button type="button" className="button" onClick={() => dashboard.showLiving()}>
          {APP_TEXT.livingNav(dashboardState.revivedCount)}
        </button>
      </nav>
    </div>
  );

  let view;
  switch (dashboardState.view) {
    case 'landing':
      view = <Landing onSearch={(text) => void dashboard.searchAccount(text)} onDemo={() => void dashboard.openDemo()} />;
      break;
    case 'graveyard':
      view = <Graveyard state={dashboardState} session={dashboard} displayContext={displayContext} now={now} />;
      break;
    case 'ritual':
      view = <RitualScreen state={ritualState} ritual={ritual} dashboard={dashboard} displayContext={displayContext} now={now} />;
      break;
    case 'living':
      view = <Living records={dashboardState.revived} displayContext={displayContext} />;
      break;
  }

  return (
    <AppShell skipLinkLabel={APP_TEXT.skipLink} header={header} footer={<p>{APP_TEXT.footerNote}</p>}>
      {view}
    </AppShell>
  );
}

export function App() {
  return (
    <ErrorBoundary
      fallback={
        <main>
          <h1>{APP_TEXT.name}</h1>
          <p role="alert">{APP_TEXT.unexpectedProblem}</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            {APP_TEXT.reload}
          </button>
        </main>
      }
    >
      <AppContent />
    </ErrorBoundary>
  );
}
