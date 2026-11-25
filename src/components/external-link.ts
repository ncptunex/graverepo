// The one helper for external links (graveyard-dashboard task 4.3, R3.1, R7.2, R11.7, tech.md 9).
// Only `https://` URLs become links, and every link gets `rel="noopener noreferrer"`.
// A URL that is not https gives null, and the caller shows plain text instead.
export type SafeLink = {
  readonly href: string;
  readonly rel: 'noopener noreferrer';
  readonly target: '_blank';
};

export function safeExternalLink(url: string | null | undefined): SafeLink | null {
  if (typeof url !== 'string' || !url.startsWith('https://')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname === '') return null;
  } catch {
    return null;
  }
  return { href: url, rel: 'noopener noreferrer', target: '_blank' };
}
