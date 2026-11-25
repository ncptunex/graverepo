// Builds a GitHub URL from an endpoint ID and values, and rejects anything the catalogue
// does not allow (task 3.3, Req 12.1). Nothing is guessed or silently dropped: an unknown
// endpoint, a bad path value or a query value outside the allowed set is an error.

import {
  ENDPOINTS,
  GITHUB_BASE_URL,
  KNOWN_MANIFESTS,
  isEndpointId,
  type PathParam,
  type QueryRule,
} from './catalogue';
import { isValidRepositoryName, isValidUsername } from './validators';

export type PathValues = Partial<Record<PathParam, string>>;
export type QueryValues = Readonly<Record<string, string | number>>;

export type BuildUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

// ISO 8601 UTC date-time, as GitHub's `since` parameter expects.
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isAllowedQueryValue(rule: QueryRule, value: string): boolean {
  switch (rule.kind) {
    case 'fixed':
      return rule.values.includes(value);
    case 'integer': {
      if (!/^\d+$/.test(value)) return false;
      const n = Number(value);
      return n >= rule.min && n <= rule.max;
    }
    case 'iso-date':
      return ISO_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
    case 'manifest-name':
      return (KNOWN_MANIFESTS as readonly string[]).includes(value);
  }
}

function isValidPathValue(param: PathParam, value: string): boolean {
  // An owner is a user or organisation login, which follows the username rule.
  return param === 'owner' ? isValidUsername(value) : isValidRepositoryName(value);
}

export function buildGitHubUrl(
  endpointId: string,
  pathValues: PathValues,
  queryValues: QueryValues = {},
): BuildUrlResult {
  if (!isEndpointId(endpointId)) {
    return { ok: false, reason: `Unknown endpoint: ${endpointId}` };
  }
  const endpoint = ENDPOINTS[endpointId];

  let path: string = endpoint.path;
  for (const param of endpoint.pathParams) {
    const value = pathValues[param];
    if (value === undefined || !isValidPathValue(param, value)) {
      return { ok: false, reason: `Invalid or missing path value: ${param}` };
    }
    path = path.replace(`{${param}}`, encodeURIComponent(value));
  }

  const rules: Readonly<Record<string, QueryRule>> = endpoint.query;
  const search = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(queryValues)) {
    const rule = rules[name];
    if (rule === undefined) {
      return { ok: false, reason: `Query parameter not allowed: ${name}` };
    }
    const value = String(rawValue);
    if (!isAllowedQueryValue(rule, value)) {
      return { ok: false, reason: `Query value not allowed: ${name}` };
    }
    search.append(name, value);
  }

  const query = search.toString();
  return { ok: true, url: `${GITHUB_BASE_URL}${path}${query ? `?${query}` : ''}` };
}
