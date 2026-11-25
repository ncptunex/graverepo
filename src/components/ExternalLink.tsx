// A link built through `safeExternalLink`. Renders plain text when the URL is not https.
import type { ReactNode } from 'react';
import { safeExternalLink } from './external-link';

export type ExternalLinkProps = {
  readonly url: string | null | undefined;
  readonly children: ReactNode;
};

export function ExternalLink({ url, children }: ExternalLinkProps) {
  const link = safeExternalLink(url);
  if (link === null) return <span>{children}</span>;
  return (
    <a href={link.href} rel={link.rel} target={link.target}>
      {children}
    </a>
  );
}
