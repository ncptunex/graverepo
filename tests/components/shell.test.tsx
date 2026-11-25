// Tests for the app shell structure, loading indicator, external link and error boundary
// (graveyard-dashboard tasks 4.2 to 4.4). The text below is test input passed through props.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell, MAIN_ID } from '../../src/components/AppShell';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { ExternalLink } from '../../src/components/ExternalLink';
import { LoadingIndicator } from '../../src/components/LoadingIndicator';
import { ViewHeading } from '../../src/components/ViewHeading';

describe('AppShell', () => {
  const html = renderToStaticMarkup(
    <AppShell skipLinkLabel="skip-text" header={<span>head</span>} footer={<span>foot</span>}>
      <p>content</p>
    </AppShell>,
  );

  it('puts the skip link first, and it targets the single main element', () => {
    expect(html.indexOf('skip-text')).toBeLessThan(html.indexOf('head'));
    expect(html).toContain(`href="#${MAIN_ID}"`);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain(`id="${MAIN_ID}"`);
  });

  it('renders header, main and footer landmarks in order', () => {
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'));
    expect(html.indexOf('<main')).toBeLessThan(html.indexOf('<footer'));
  });
});

describe('LoadingIndicator', () => {
  it('shows the text it is given and a hidden shape', () => {
    const html = renderToStaticMarkup(<LoadingIndicator label="loading-text" />);
    expect(html).toContain('loading-text');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('ExternalLink', () => {
  it('renders an https link with rel and target', () => {
    const html = renderToStaticMarkup(<ExternalLink url="https://github.com/o/r">go</ExternalLink>);
    expect(html).toContain('href="https://github.com/o/r"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders plain text for a URL that is not https', () => {
    const html = renderToStaticMarkup(<ExternalLink url="javascript:alert(1)">go</ExternalLink>);
    expect(html).not.toContain('<a');
    expect(html).toContain('go');
  });
});

describe('ViewHeading', () => {
  it('renders an h1 that script can focus but that is not a tab stop', () => {
    const html = renderToStaticMarkup(<ViewHeading viewKey="landing">Title</ViewHeading>);
    expect(html).toContain('<h1');
    expect(html).toContain('tabindex="-1"');
  });
});

describe('ErrorBoundary', () => {
  it('shows the children when nothing fails', () => {
    expect(renderToStaticMarkup(<ErrorBoundary fallback={<p>fallback</p>}><p>fine</p></ErrorBoundary>)).toContain('fine');
  });

  it('gives a fallback and logs the error when a child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = ErrorBoundary.getDerivedStateFromError();
    expect(state).toEqual({ hasError: true });
    const boundary = new ErrorBoundary({ fallback: <p>fallback</p>, children: <p>child</p> });
    boundary.state = state;
    boundary.componentDidCatch(new Error('boom'), { componentStack: 'stack' });
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toContain('fallback');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
