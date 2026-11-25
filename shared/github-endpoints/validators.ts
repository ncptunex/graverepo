// Shared input validators (design 4.2). Used by the client in Phase 1 and by the
// Phase 2 proxy, so both apply exactly the same rules.

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

/**
 * Username rule (D23, Req 1.2): 1–39 characters, letters, digits and hyphens only,
 * not starting with a hyphen. GitHub decides everything else (Req 1.3), so names like
 * `a--b` or `name-` pass here and GitHub answers "not found" if they don't exist.
 * The input must already be trimmed.
 */
export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Repository name rule: 1–100 characters, letters, digits, `.`, `-` and `_`, and not `.` or `..`. */
export function isValidRepositoryName(value: string): boolean {
  if (value === '.' || value === '..') return false;
  return REPOSITORY_NAME_PATTERN.test(value);
}
