// Notice / banner (design-system.md 5.8, resurrection-ritual task 11.2).
// One component with four variants. Each has an icon shape and a text label as well as styling,
// so the variant is never shown by colour alone. All text comes in as props.
import type { ReactNode } from 'react';
import './Notice.css';

export type NoticeVariant = 'info' | 'warning' | 'error' | 'success';

export type NoticeProps = {
  readonly variant: NoticeVariant;
  /** Visible text label for the variant (for example the word for "warning"), from the wording module. */
  readonly variantLabel: string;
  readonly children: ReactNode;
};

/** Error notices use the alert role. Success uses a polite status. Info and warning stay static. */
export function noticeRole(variant: NoticeVariant): 'alert' | 'status' | undefined {
  if (variant === 'error') return 'alert';
  if (variant === 'success') return 'status';
  return undefined;
}

function NoticeIcon({ variant }: { readonly variant: NoticeVariant }) {
  return (
    <svg className="notice__icon" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false">
      {variant === 'info' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4M8 4.5v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {variant === 'warning' && (
        <>
          <path d="M8 1.5 15 14H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6v4M8 11.5v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {variant === 'error' && (
        <>
          <path d="M5 1.5h6L14.5 5v6L11 14.5H5L1.5 11V5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {variant === 'success' && (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4.5 8.5l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function Notice({ variant, variantLabel, children }: NoticeProps) {
  return (
    <div className={`notice notice--${variant}`} role={noticeRole(variant)}>
      <NoticeIcon variant={variant} />
      <div className="notice__body">
        <strong className="notice__label">{variantLabel}</strong>
        <div className="notice__text">{children}</div>
      </div>
    </div>
  );
}
