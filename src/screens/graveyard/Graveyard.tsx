import { useId } from 'react';
import type { DataError } from '../../data/github';
import { DataSourceBadge } from '../../components/DataSourceBadge';
import { LiveRegion } from '../../components/LiveRegion';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { Notice } from '../../components/Notice';
import { SearchForm } from '../../components/SearchForm';
import { Tombstone } from '../../components/Tombstone';
import { ExternalLink } from '../../components/ExternalLink';
import { ViewHeading } from '../../components/ViewHeading';
import { Ghost } from '../../components/scenery/Ghost';
import { GraveyardHero } from './GraveyardHero';
import { errorText } from '../../components/error-text';
import { listNotices } from '../../components/list-notices';
import { describeProvenance } from '../../components/provenance-text';
import { tombstoneView } from '../../components/tombstone-view';
import { APP_TEXT, safeName } from '../../components/ui-text';
import type { DashboardSession, DashboardState } from '../../state/dashboard-session';
import { filterRepositories, isFiltered } from '../../state/graveyard-filters';
import type { DisplayContext } from '../../ritual/types';
import './Graveyard.css';

export type GraveyardProps = {
  readonly state: DashboardState;
  readonly session: DashboardSession;
  readonly displayContext: DisplayContext;
  /** The current time as an ISO string, read once by the app shell. */
  readonly now: string;
};

function ErrorView({ error, query, session, displayContext, now }: { error: DataError; query: string } & Omit<GraveyardProps, 'state'>) {
  const text = errorText(error, { displayContext, now });
  const isFieldError = error.kind === 'invalid-username';
  return (
    <div className="stack">
      <GraveyardHero>
        <ViewHeading viewKey="graveyard-error">{error.kind === 'demo-unavailable' ? APP_TEXT.demoHeading : APP_TEXT.graveyardOf(safeName(query))}</ViewHeading>
      </GraveyardHero>
      {!isFieldError && text.message !== null && (
        <Notice variant="error" variantLabel={APP_TEXT.error}>
          {text.message}
        </Notice>
      )}
      <SearchForm initialValue={query} errorMessage={isFieldError ? text.message : null} onSearch={(value) => void session.searchAccount(value)} />
      <div className="row">
        {text.offersDemo && (
          <button type="button" className="button" onClick={() => void session.openDemo()}>
            {APP_TEXT.demoButton}
          </button>
        )}
        {error.retryable && query.trim() !== '' && !isFieldError && (
          <button type="button" className="button" onClick={() => void session.searchAccount(query)}>
            {APP_TEXT.retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function Graveyard({ state, session, displayContext, now }: GraveyardProps) {
  const countId = useId();
  const { graveyard, filters } = state;

  if (graveyard.status === 'idle') return null;

  if (graveyard.status === 'loading') {
    const text = graveyard.source === 'demo' ? APP_TEXT.openingDemo : APP_TEXT.lookingFor(safeName(graveyard.name));
    return (
      <div className="stack">
        <GraveyardHero>
          <ViewHeading viewKey="graveyard-loading">{graveyard.source === 'demo' ? APP_TEXT.demoHeading : APP_TEXT.graveyardOf(safeName(graveyard.name))}</ViewHeading>
        </GraveyardHero>
        <LoadingIndicator label={text} />
        <LiveRegion kind="polite" message={text} isVisuallyHidden />
        {graveyard.isSlow && (
          <>
            <Notice variant="info" variantLabel={APP_TEXT.info}>{APP_TEXT.slow}</Notice>
            <button type="button" className="button" onClick={() => void session.openDemo()}>
              {APP_TEXT.demoButton}
            </button>
          </>
        )}
      </div>
    );
  }

  if (graveyard.status === 'error') {
    return <ErrorView error={graveyard.error} query={graveyard.query} session={session} displayContext={displayContext} now={now} />;
  }

  // Ready. The result is the data layer's result as returned.
  const { result, source } = graveyard;
  const data = result.data;
  const repositories = data.repositories;
  const provenance = describeProvenance(result.provenance, result.refreshError, displayContext, now);
  const notices = 'owner' in data ? listNotices(data, result.warnings) : [];
  const visible = filterRepositories(repositories, filters);
  const filtered = isFiltered(filters);
  const login = 'owner' in data ? data.owner.login : null;
  const heading = source === 'demo' ? APP_TEXT.demoHeading : APP_TEXT.graveyardOf(safeName(login));
  const demoAccounts = 'sourceAccounts' in data ? data.sourceAccounts.map((account) => account.login).join(', ') : '';

  return (
    <div className="stack">
      <GraveyardHero>
        <ViewHeading viewKey={`graveyard-${source}`}>{heading}</ViewHeading>
        {'owner' in data && (
          <p className="row">
            {data.owner.accountType === 'organisation' && <span className="graveyard__tag">{APP_TEXT.organisation}</span>}
            <ExternalLink url={data.owner.profileUrl}>{APP_TEXT.viewProfile}</ExternalLink>
          </p>
        )}
        {source === 'demo' && demoAccounts !== '' && <p className="muted">{demoAccounts}</p>}
        {provenance.text !== null && <DataSourceBadge source={result.provenance.source} label={provenance.text} timeIso={provenance.exactTime} />}
      </GraveyardHero>
      {notices.map((notice) => (
        <Notice key={notice.id} variant={notice.variant === 'warning' ? 'warning' : 'info'} variantLabel={notice.variant === 'warning' ? APP_TEXT.warning : APP_TEXT.info}>
          {notice.text}
        </Notice>
      ))}
      <SearchForm onSearch={(value) => void session.searchAccount(value)} />

      {repositories.length === 0 ? (
        <p className="graveyard__empty">
          <Ghost pose="calm" size={56} />
          <span>{APP_TEXT.noPublicRepositories(safeName(login))}</span>
        </p>
      ) : (
        <>
          <div className="graveyard__toolbar panel">
            <label className="stack">
              <span>{APP_TEXT.filterLabel}</span>
              <input
                className="field"
                type="text"
                value={filters.text}
                onChange={(event) => session.setFilters({ text: event.target.value })}
              />
            </label>
            <label className="row">
              <input type="checkbox" checked={filters.includeForks} onChange={(event) => session.setFilters({ includeForks: event.target.checked })} />
              <span>{APP_TEXT.includeForks}</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={filters.includeArchived} onChange={(event) => session.setFilters({ includeArchived: event.target.checked })} />
              <span>{APP_TEXT.includeArchived}</span>
            </label>
            {filtered && (
              <button type="button" className="button" onClick={() => session.clearFilters()}>
                {APP_TEXT.clearFilters}
              </button>
            )}
          </div>
          <p id={countId}>{APP_TEXT.showing(visible.length, repositories.length)}</p>
          <LiveRegion kind="polite" message={APP_TEXT.showing(visible.length, repositories.length)} isVisuallyHidden />
          {visible.length === 0 ? (
            <>
              <p className="graveyard__empty">
                <Ghost pose="curious" size={56} />
                <span>{APP_TEXT.noMatches(repositories.length)}</span>
              </p>
              <button type="button" className="button" onClick={() => session.clearFilters()}>
                {APP_TEXT.clearFilters}
              </button>
            </>
          ) : (
            <div className="graveyard__lawn">
              <ul className="plain-list graveyard__list" aria-describedby={countId}>
                {visible.map((summary) => {
                  const view = tombstoneView(summary, result.provenance.fetchedAt, displayContext, source);
                  return <Tombstone key={view.key} view={view} onOpen={(owner, name) => void session.openTombstone(owner, name)} />;
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
