// Display context (graveyard-dashboard task 2.1, ritual O21): the visitor's locale and time zone,
// read once from `Intl`. Falls back to `en` and `UTC` when the browser gives nothing.
// Shared with the ritual. Only the state layer or the app shell calls it.
import type { DisplayContext } from '../ritual/types';

export function readDisplayContext(): DisplayContext {
  try {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    return { locale: locale || 'en', timeZone: timeZone || 'UTC' };
  } catch {
    return { locale: 'en', timeZone: 'UTC' };
  }
}
