// Source scan (dashboard D-I3, task 5.7, ritual 14.4): UI files import no transport, adapter, schema,
// cache or demo code, call no fetch, and reference no GitHub API host, remote asset or raw HTML.
import { describe, expect, it } from 'vitest';

const files = Object.fromEntries(
  Object.entries(import.meta.glob('../../src/{components,screens}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })).map(
    ([path, text]) => [path, String(text)],
  ),
);

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('UI source scan', () => {
  it('finds the UI files', () => {
    expect(Object.keys(files).length).toBeGreaterThan(20);
  });

  it('imports only the data layer public interface (types), never transports, adapters, schemas or cache', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(files)) {
      for (const match of strip(source).matchAll(/from\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[1] ?? '';
        if (/data\/(github\/(transport|adapters|schemas|errors|cache)|cache|demo)|shared\/github-endpoints|^zod/.test(specifier)) {
          offenders.push(`${path}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no fetch, GitHub API host, raw HTML, remote asset or storage access', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(files)) {
      const code = strip(source);
      for (const pattern of [/\bfetch\s*\(/, /api\.github\.com/, /dangerouslySetInnerHTML/, /\blocalStorage\b/, /(src|href)=["']https?:\/\/(?!github\.com)/, /@import\s+url/, /url\(\s*['"]?https?:/]) {
        if (pattern.test(code)) offenders.push(`${path} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('builds every external link through the one helper', () => {
    const offenders = Object.entries(files)
      .filter(([path]) => !/external-link|ExternalLink/.test(path))
      .filter(([, source]) => /target=["']_blank["']/.test(strip(source)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
