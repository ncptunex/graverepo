// Request ownership for the ritual (task 10.2, design 8.1; Req 10.4, 10.6, tech.md section 6).
// The state layer, not the UI, creates and aborts `AbortController`s. Each `openRitual` gets a
// token. A result is applied only if its token is still the current one, so a late result from
// a replaced or closed request can't change the session or the saved progress.

export type RequestTicket = {
  readonly token: number;
  readonly signal: AbortSignal;
};

export type RequestTracker = {
  /** Aborts the earlier request, if any, and starts a new one. */
  begin(): RequestTicket;
  /** True while this ticket is the newest one and was not cancelled. */
  isCurrent(ticket: RequestTicket): boolean;
  /** Aborts the running request and makes every earlier ticket stale. */
  cancel(): void;
};

export function createRequestTracker(): RequestTracker {
  let counter = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      controller?.abort();
      counter += 1;
      controller = new AbortController();
      return { token: counter, signal: controller.signal };
    },
    isCurrent(ticket) {
      return ticket.token === counter && !ticket.signal.aborted;
    },
    cancel() {
      controller?.abort();
      controller = null;
      counter += 1;
    },
  };
}
