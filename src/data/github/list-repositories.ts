// `listRepositories` (task 9.3, design 3.1 and 4.1; Req 2, 3, 7.8, 7.9, 8.10).
// 1. Gets the profile (from the cache when fresh) to learn whether the account is a user or
//    an organisation.
// 2. Pages through the matching endpoint, up to 300 repositories.
// 3. Sorts with nulls last, caches complete and truncated lists, and never caches a partial one.
// It never returns demo data: a failed search is an error, not the demo graveyard (Req 8.10).
import { ENDPOINTS, type EndpointId } from '../../../shared/github-endpoints/catalogue';
import { isCacheableRepositoryList, type FetchOutcome } from '../cache/cached-fetch';
import { repositoryListSchema } from '../cache/payload-schemas';
import { adaptRepositoryPage } from './adapters/repository';
import { failure, guard, sendRequest, type DataLayerContext } from './context';
import { classifyResponse } from './errors/classify-response';
import { makeError } from './errors/error-kinds';
import { getProfile, parseUsername, type LookupOptions } from './lookup-user';
import { collectRepositoryPages, type PageOutcome } from './paginate';
import type { DataResult, RepositoryList, UserProfile, Warning } from './types';

/** Warnings that follow from the list itself, so they also appear when the list comes from the cache. */
export function warningsForList(list: RepositoryList): Warning[] {
  const warnings: Warning[] = [];
  if (list.partial) warnings.push({ kind: 'partial-list', retrievedCount: list.retrievedCount });
  // `totalPublicCount` is needed for the "Showing {n} of {total}" text. Without it the list
  // is still marked `truncated`, and no number is invented.
  if (list.truncated && list.totalPublicCount !== null) {
    warnings.push({
      kind: 'truncated-list',
      retrievedCount: list.retrievedCount,
      totalCount: list.totalPublicCount,
    });
  }
  if (list.droppedInvalidCount > 0 || list.droppedPrivateCount > 0) {
    warnings.push({
      kind: 'dropped-items',
      invalidCount: list.droppedInvalidCount,
      privateCount: list.droppedPrivateCount,
    });
  }
  return warnings;
}

async function fetchPage(
  context: DataLayerContext,
  endpointId: EndpointId,
  owner: UserProfile,
  username: string,
  page: number,
): Promise<PageOutcome> {
  const sent = await sendRequest(context, endpointId, { owner: username }, {
    // Users: repositories they own. Organisations: public repositories only (Req 2.1, 2.2).
    type: owner.accountType === 'organisation' ? 'public' : 'owner',
    sort: 'pushed',
    direction: 'desc',
    per_page: 100,
    page,
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  const error = classifyResponse(endpointId, sent.response);
  if (error !== null) return { ok: false, error };
  const adaptedPage = adaptRepositoryPage(sent.response.body);
  if (!adaptedPage.ok) return { ok: false, error: adaptedPage.error };
  return {
    ok: true,
    ...adaptedPage.value,
    nextPage: sent.raw.nextPage,
    fetchedAt: sent.raw.fetchedAt,
  };
}

async function fetchList(
  context: DataLayerContext,
  username: string,
  forceRefresh: boolean,
): Promise<FetchOutcome<RepositoryList>> {
  const profile = await getProfile(context, username, { forceRefresh });
  if (!profile.ok) return { ok: false, error: profile.error };
  const owner = profile.data;

  const endpointId: EndpointId = owner.accountType === 'organisation' ? 'org-repos' : 'user-repos';
  const collected = await collectRepositoryPages(
    (page) => fetchPage(context, endpointId, owner, username, page),
    owner.publicRepoCount,
  );
  if (!collected.ok) return { ok: false, error: collected.error };

  const { fetchedAt, ...rest } = collected.value;
  const list: RepositoryList = { owner, ...rest };
  return {
    ok: true,
    data: list,
    fetchedAt,
    route: 'direct',
    // A partial list is never cached. A list truncated at the cap is (Req 7.8, 7.9).
    cacheable: isCacheableRepositoryList(list),
  };
}

export function createListRepositories(context: DataLayerContext) {
  return function listRepositories(
    username: string,
    options: LookupOptions = {},
  ): Promise<DataResult<RepositoryList>> {
    return guard(context, async () => {
      const parsed = parseUsername(username);
      if (!parsed.ok) return failure(context, parsed.error);
      if (options.signal?.aborted) return failure(context, makeError('cancelled'));

      const result = await context.fetcher.fetch({
        dataType: 'list',
        id: parsed.username,
        schema: repositoryListSchema,
        freshnessMs: ENDPOINTS['user-repos'].freshnessMs,
        forceRefresh: options.forceRefresh,
        signal: options.signal,
        fetcher: () => fetchList(context, parsed.username, options.forceRefresh === true),
      });
      if (!result.ok) return result;
      // Warnings come from the data, so a cached list shows the same notes as a live one.
      return { ...result, warnings: [...warningsForList(result.data), ...result.warnings] };
    });
  };
}
