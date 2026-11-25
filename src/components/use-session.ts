// Subscribes a component to a session (the dashboard or the ritual). Both sessions replace
// their state object on every change and keep it otherwise, so this is safe with React.
import { useSyncExternalStore } from 'react';

export function useSession<S>(session: { getState(): S; subscribe(listener: () => void): () => void }): S {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
