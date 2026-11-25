// The app's ritual session, built from the real data layer and `localStorage`.
// Created on first use, so importing this file sends no request and reads no storage.
// Tests build their own session with `createRitualSession` and fakes.
import { estimateDetailRequests, getRepositoryDetail, loadDemoGraveyard } from '../data/github';
import { createProgressStore } from './progress-store';
import { createRitualSession } from './ritual-session';

let session: ReturnType<typeof createRitualSession> | null = null;

export function getRitualSession(): ReturnType<typeof createRitualSession> {
  session ??= createRitualSession({
    dataLayer: { getRepositoryDetail, estimateDetailRequests, loadDemoGraveyard },
    store: createProgressStore(),
  });
  return session;
}
