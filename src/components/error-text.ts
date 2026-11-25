// Error text (graveyard-dashboard task 2.4, design 4.5, R9.4, R9.5, R8.5, DD9).
// One function for every data-layer error kind, using only the wording in voice-and-honesty.md
// section 5.8. Pure: `now` and the display context are arguments.
// Returns structured parts so the screen can place the demo button. The demo is mentioned only
// when the error's own `demoAvailable` is true.
import type { DataError } from '../data/github';
import type { DisplayContext } from '../ritual/types';
import { utcSuffix } from './wording';

export type ErrorText = {
  /** The full user message, or null for `cancelled` (no message). */
  readonly message: string | null;
  /** The message without the demo sentence or clause. Used as the "couldn't refresh" reason. */
  readonly lead: string | null;
  /** True when the screen may offer the demo graveyard. */
  readonly offersDemo: boolean;
  /** Primary rate limit: the time to look again (ISO UTC), when GitHub said. */
  readonly retryAt: string | null;
  /** Secondary rate limit: seconds to wait, when GitHub said. */
  readonly retryInSeconds: number | null;
};

export type ErrorTextContext = {
  readonly displayContext: DisplayContext;
  /** The current time as an ISO string. Decides whether a retry time needs its date. */
  readonly now: string;
};

const DEMO_CLAUSE = ', or try the demo graveyard.';

function dayKey(date: Date, displayContext: DisplayContext): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: displayContext.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The time in the visitor's zone, with the date when it is not today. Null for an unreadable value. */
export function formatRetryTime(iso: string, context: ErrorTextContext): string | null {
  const when = new Date(iso);
  const now = new Date(context.now);
  if (Number.isNaN(when.getTime())) return null;
  try {
    const { locale, timeZone } = context.displayContext;
    const isToday = !Number.isNaN(now.getTime()) && dayKey(when, context.displayContext) === dayKey(now, context.displayContext);
    const text = new Intl.DateTimeFormat(locale, {
      timeZone,
      ...(isToday ? {} : { dateStyle: 'medium' as const }),
      timeStyle: 'short',
    }).format(when);
    return `${text}${utcSuffix(context.displayContext)}`;
  } catch {
    return null;
  }
}

/** A lead that ends in a clause, so the demo clause can follow it (", or try the demo graveyard."). */
function clauseLead(lead: string, demo: boolean): { lead: string; message: string } {
  return { lead, message: demo ? `${lead}${DEMO_CLAUSE}` : `${lead}.` };
}

export function errorText(error: DataError, context: ErrorTextContext): ErrorText {
  const demo = error.demoAvailable;
  const none = { retryAt: null, retryInSeconds: null };
  const build = (lead: string, message: string, extra: Partial<ErrorText> = {}): ErrorText => ({
    message,
    lead,
    offersDemo: demo,
    ...none,
    ...extra,
  });

  switch (error.kind) {
    case 'cancelled':
      return { message: null, lead: null, offersDemo: false, ...none };
    case 'network': {
      const parts = clauseLead("We can't reach GitHub from here. Check your connection", demo);
      return build(parts.lead, parts.message);
    }
    case 'timeout': {
      const parts = clauseLead("GitHub didn't answer in time. Try again", demo);
      return build(parts.lead, parts.message);
    }
    case 'github-unavailable': {
      const parts = clauseLead('GitHub seems to be having trouble right now. Try again later', demo);
      return build(parts.lead, parts.message);
    }
    case 'unexpected-response': {
      const parts = clauseLead("GitHub sent something we didn't expect. Try again", demo);
      return build(parts.lead, parts.message);
    }
    case 'proxy-unavailable': {
      return demo
        ? build(
            "Our lookup helper isn't answering right now",
            "Our lookup helper isn't answering right now. Try the demo graveyard, or try again later.",
          )
        : build(
            "Our lookup helper isn't answering right now",
            "Our lookup helper isn't answering right now. Try again later.",
          );
    }
    case 'rate-limited': {
      if (error.details.limitType === 'secondary') {
        const seconds = error.details.retryAfterSeconds ?? null;
        const message =
          seconds === null
            ? 'Too many lookups at once. Try again later.'
            : `Too many lookups at once. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
        return build(message, message, { retryInSeconds: seconds });
      }
      const resetAt = error.details.resetAt ?? null;
      const time = resetAt === null ? null : formatRetryTime(resetAt, context);
      const base = "GitHub allows only a limited number of lookups for each hour. We've used them up for now.";
      const lead = time === null ? base.slice(0, -1) : `${base} You can look again at ${time}`;
      const parts = clauseLead(lead, demo);
      return build(parts.lead, parts.message, { retryAt: time === null ? null : resetAt });
    }
    case 'forbidden':
      return build("GitHub won't let us see this one.", "GitHub won't let us see this one.");
    case 'user-not-found': {
      const name = error.details.username;
      const message =
        name === undefined
          ? 'We could not find that account. Check the spelling.'
          : `We couldn't find an account called ${name}. Check the spelling.`;
      return build(message, message);
    }
    case 'repo-not-found': {
      const message = "We couldn't find this repository. It may have been renamed, moved or made private.";
      return build(message, message);
    }
    case 'invalid-username': {
      const message = 'GitHub usernames use letters, numbers and hyphens.';
      return build(message, message);
    }
    case 'demo-unavailable': {
      const message = "The demo graveyard couldn't be loaded. Please report this.";
      return build(message, message);
    }
  }
}
