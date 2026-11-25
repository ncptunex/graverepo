// Error kinds and their fixed properties (data-layer design 5.9, Req 6, 8.9, 9.9).
// Final user wording lives in the UI and follows voice-and-honesty.md section 5.8.
// The data layer only supplies the kind, a message key and the details needed for that text.

export type ErrorKind =
  | 'invalid-username'
  | 'user-not-found'
  | 'repo-not-found'
  | 'rate-limited'
  | 'forbidden'
  | 'timeout'
  | 'network'
  | 'github-unavailable'
  | 'proxy-unavailable'
  | 'unexpected-response'
  | 'demo-unavailable'
  | 'cancelled';

export type RateLimitType = 'primary' | 'secondary';

/** Details for a friendly message (Req 9.9). Only the fields relevant to the kind are set. */
export type ErrorDetails = {
  readonly limitType?: RateLimitType;
  /** Primary limit: when GitHub allows more requests (ISO UTC). */
  readonly resetAt?: string | null;
  /** Secondary limit: seconds to wait, from `retry-after`, or null when GitHub didn't say. */
  readonly retryAfterSeconds?: number | null;
  /** The HTTP status GitHub returned, when there was one. */
  readonly status?: number;
  readonly username?: string;
  readonly repository?: string;
};

export type DataError = {
  readonly kind: ErrorKind;
  readonly messageKey: string;
  readonly details: ErrorDetails;
  /** Whether the UI may offer the demo graveyard with this error (Req 8.9). */
  readonly demoAvailable: boolean;
  /** Whether trying again can help (design 5.9 "Retryable by user"). */
  readonly retryable: boolean;
};

type KindProperties = { readonly demoAvailable: boolean; readonly retryable: boolean };

/**
 * Design 5.9, columns "Retryable by user" and "Demo offered".
 * `demoAvailable` is true exactly for the kinds in Req 8.9: rate-limited, network, timeout,
 * github-unavailable and proxy-unavailable, plus unexpected-response as the design table shows.
 * Rate limits are retryable after the reset or wait time.
 */
const KIND_PROPERTIES: Readonly<Record<ErrorKind, KindProperties>> = {
  'invalid-username': { demoAvailable: false, retryable: true },
  'user-not-found': { demoAvailable: false, retryable: true },
  'repo-not-found': { demoAvailable: false, retryable: false },
  'rate-limited': { demoAvailable: true, retryable: true },
  forbidden: { demoAvailable: false, retryable: false },
  timeout: { demoAvailable: true, retryable: true },
  network: { demoAvailable: true, retryable: true },
  'github-unavailable': { demoAvailable: true, retryable: true },
  'proxy-unavailable': { demoAvailable: true, retryable: true },
  'unexpected-response': { demoAvailable: true, retryable: true },
  'demo-unavailable': { demoAvailable: false, retryable: false },
  cancelled: { demoAvailable: false, retryable: false },
};

export const ERROR_KINDS = Object.keys(KIND_PROPERTIES) as ErrorKind[];

/** Message keys are `error.{kind}`, with the limit type added for rate limits. */
function messageKeyFor(kind: ErrorKind, details: ErrorDetails): string {
  if (kind === 'rate-limited' && details.limitType) {
    return `error.rate-limited.${details.limitType}`;
  }
  return `error.${kind}`;
}

/** The only way to create a DataError, so the flags always match design 5.9. */
export function makeError(kind: ErrorKind, details: ErrorDetails = {}): DataError {
  const { demoAvailable, retryable } = KIND_PROPERTIES[kind];
  return { kind, messageKey: messageKeyFor(kind, details), details, demoAvailable, retryable };
}
