// `lookupUser` and the shared profile fetch (task 9.1, design 3.1 and 4.1; Req 1, 7).
// - Trims and validates the username before any request (Req 1.1, 1.2).
// - Reads and writes the `user` cache entry, keyed by the lowercased login (Req 1.7).
// - A new lookup cancels the earlier one: the earlier caller gets `cancelled` (Req 1.6).
import { isValidUsername } from '../../../shared/github-endpoints/validators';
import { ENDPOINTS } from '../../../shared/github-endpoints/catalogue';
import type { FetchOutcome } from '../cache/cached-fetch';
import { userProfileSchema } from '../cache/payload-schemas';
import { adaptUser } from './adapters/user';
import { failure, guard, sendRequest, type DataLayerContext } from './context';
import { classifyResponse } from './errors/classify-response';
import { makeError, type DataError } from './errors/error-kinds';
import type { DataResult, UserProfile } from './types';

export type LookupOptions = {
  /** Cancels this call. The caller then receives `cancelled`. */
  readonly signal?: AbortSignal;
  /** Skips the browser cache for this call. */
  readonly forceRefresh?: boolean;
};

/** Trims the input and checks it with the username rule. Nothing is sent when it fails. */
export function parseUsername(
  input: unknown,
): { readonly ok: true; readonly username: string } | { readonly ok: false; readonly error: DataError } {
  const username = typeof input === 'string' ? input.trim() : '';
  if (!isValidUsername(username)) {
    return { ok: false, error: makeError('invalid-username', { username }) };
  }
  return { ok: true, username };
}

/** Requests and converts one profile. This is the network work, shared by all callers. */
async function fetchProfile(context: DataLayerContext, username: string): Promise<FetchOutcome<UserProfile>> {
  const sent = await sendRequest(context, 'user', { owner: username });
  if (!sent.ok) return { ok: false, error: sent.error };

  const error = classifyResponse('user', sent.response);
  if (error !== null) {
    // The UI's "We couldn't find an account called {name}" needs the name.
    const withName = error.kind === 'user-not-found' ? makeError(error.kind, { ...error.details, username }) : error;
    return { ok: false, error: withName };
  }
  const profile = adaptUser(sent.response.body);
  if (!profile.ok) return { ok: false, error: profile.error };
  return { ok: true, data: profile.value, fetchedAt: sent.raw.fetchedAt, route: sent.raw.rateLimit.route };
}

/**
 * The profile through the cache. Used by `lookupUser` and by `listRepositories`, which
 * reuses a fresh profile so a list refresh does not cost another request (design 3.1).
 */
export function getProfile(
  context: DataLayerContext,
  username: string,
  options: LookupOptions = {},
): Promise<DataResult<UserProfile>> {
  return context.fetcher.fetch({
    dataType: 'user',
    id: username,
    schema: userProfileSchema,
    freshnessMs: ENDPOINTS.user.freshnessMs,
    forceRefresh: options.forceRefresh,
    signal: options.signal,
    fetcher: () => fetchProfile(context, username),
  });
}

export function createLookupUser(context: DataLayerContext) {
  // The controller of the lookup that is currently the newest one.
  let latest: AbortController | null = null;

  return function lookupUser(username: string, options: LookupOptions = {}): Promise<DataResult<UserProfile>> {
    return guard(context, async () => {
      latest?.abort();
      const controller = new AbortController();
      latest = controller;
      const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;

      const parsed = parseUsername(username);
      if (!parsed.ok) return failure(context, parsed.error);

      const result = await getProfile(context, parsed.username, { ...options, signal });
      // A caller that was replaced or cancelled never receives data, even if it arrived.
      if (signal.aborted) return failure(context, makeError('cancelled'));
      return result;
    });
  };
}
