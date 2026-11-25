// The app's dashboard session, built from the real data layer and the app's ritual session.
// Created on first use, so importing this file sends no request (R1.6). Tests build their own
// session with `createDashboardSession` and fakes.
import { listRepositories, loadDemoGraveyard } from '../data/github';
import { createDashboardSession, type DashboardSession } from './dashboard-session';
import { getRitualSession } from './default-session';

let session: DashboardSession | null = null;

export function getDashboardSession(): DashboardSession {
  session ??= createDashboardSession({
    dataLayer: { listRepositories, loadDemoGraveyard },
    ritual: getRitualSession(),
  });
  return session;
}
