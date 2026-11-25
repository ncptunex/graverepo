// The data layer's public interface (design 4.1, Req 12.2). Screens and application state use
// only these functions and types. Transports, schemas and adapters stay behind this file.
//
// The default instance is created on first use, so importing this file sends no request and
// touches no storage (Req 8.16).
import { createGitHubDataLayer, type GitHubDataLayer } from './data-layer';

let instance: GitHubDataLayer | null = null;
function layer(): GitHubDataLayer {
  instance ??= createGitHubDataLayer();
  return instance;
}

export const lookupUser: GitHubDataLayer['lookupUser'] = (username, options) =>
  layer().lookupUser(username, options);

export const listRepositories: GitHubDataLayer['listRepositories'] = (username, options) =>
  layer().listRepositories(username, options);

export const getRepositoryDetail: GitHubDataLayer['getRepositoryDetail'] = (owner, repo, options) =>
  layer().getRepositoryDetail(owner, repo, options);

export const estimateDetailRequests: GitHubDataLayer['estimateDetailRequests'] = (repository, options) =>
  layer().estimateDetailRequests(repository, options);

export const getRateLimitStatus: GitHubDataLayer['getRateLimitStatus'] = () => layer().getRateLimitStatus();

export { loadDemoGraveyard } from '../demo/load-demo-graveyard';

export type { DetailEstimate } from './detail-estimate';
export { makeError } from './errors/error-kinds';
export type { DataError, ErrorKind } from './errors/error-kinds';
export type { LookupOptions } from './lookup-user';
export type { DetailOptions } from './repository-detail';
export type * from './types';
