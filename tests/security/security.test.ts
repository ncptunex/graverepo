// Security and privacy checks (data-layer tasks 10.1–10.3; design 8.10; Req 11.1, 12.1, 13.1, 13.5).
// These read the project's own files as text (through Vite, so no Node file API is needed).
// They never contact GitHub and need no token.
//
// Not covered here: the email and token scan of the real demo snapshot. That snapshot does not
// exist yet (task 6.5), so the snapshot part of task 10.2 stays open. `demo.test.ts` already
// holds that scan, and it runs once the snapshot is committed.
import { describe, expect, it } from 'vitest';
import { findTokenPrefixes } from '../../scripts/scan-tokens.mjs';
import { createGitHubDataLayer } from '../../src/data/github/data-layer';
import { capturedResponse } from '../data-layer/helpers/fixtures';
import { createFakeTransport, detailHandler, rawFrom } from '../data-layer/helpers/fake-layer';
import { findBoundaryViolations } from './boundary';

type Files = Record<string, string>;

function raw(modules: Record<string, unknown>): Files {
  return Object.fromEntries(Object.entries(modules).map(([path, text]) => [path, String(text)]));
}

// The folders the token scan covers: source, shared code, the Phase 2 proxy, scripts, and the
// build output. Missing folders (`api/` before Phase 2, `dist/` before a build) give no files.
const scanned: Files = {
  ...raw(import.meta.glob('../../src/**/*.{ts,tsx,css,json,md}', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../shared/**/*.{ts,json}', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../api/**/*.{ts,json}', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../scripts/**/*.{ts,mjs,mts}', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../dist/**/*.{js,css,html}', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true })),
};
const fixtureFiles: Files = {
  ...raw(import.meta.glob('../fixtures/github/captured/*.json', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../fixtures/github/constructed/*.json', { query: '?raw', import: 'default', eager: true })),
};

describe('token scan (task 10.1, Req 11.1)', () => {
  it('finds token prefixes in sample text, and shows only the prefix', () => {
    expect(findTokenPrefixes('const a = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";')).toEqual(['ghp_']);
    expect(findTokenPrefixes('github_pat_11ABCDEF_xyz and gho_abc123')).toEqual(['github_pat_', 'gho_']);
    expect(findTokenPrefixes('ghu_x ghs_y ghr_z')).toEqual(['ghu_', 'ghs_', 'ghr_']);
  });

  it('ignores ordinary text that only looks similar', () => {
    expect(findTokenPrefixes('ghp or ghp_ alone, github_pat, xghp_b')).toEqual([]);
    expect(findTokenPrefixes('const TOKEN = (ghp_|gho_|github_pat_)')).toEqual([]);
  });

  it('covers source, shared code, scripts and the index page', () => {
    const paths = Object.keys(scanned);
    expect(paths.some((path) => path.includes('/src/data/github/'))).toBe(true);
    expect(paths.some((path) => path.includes('/shared/github-endpoints/'))).toBe(true);
    expect(paths.some((path) => path.includes('/scripts/'))).toBe(true);
  });

  it('finds no GitHub token pattern in src/, shared/, api/, scripts/ or the build output', () => {
    const findings = Object.entries(scanned).flatMap(([path, text]) =>
      findTokenPrefixes(text).map((prefix) => `${path} (${prefix})`),
    );
    expect(findings).toEqual([]);
  });

  it('finds no token pattern in the test fixtures', () => {
    const findings = Object.entries(fixtureFiles).flatMap(([path, text]) =>
      findTokenPrefixes(text).map((prefix) => `${path} (${prefix})`),
    );
    expect(findings).toEqual([]);
  });

  it('never sends an Authorization header from the frontend code', () => {
    // The direct transport must not set one (Req 11.1, 12.5). The capture script is exempt: it runs by hand.
    const frontend = Object.entries(scanned).filter(
      ([path]) => path.includes('/src/') && !path.endsWith('.json') && !path.endsWith('.md'),
    );
    const offenders = frontend
      .filter(([, text]) => /authorization\s*['"]?\s*:/i.test(text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('email scan (task 10.2, Req 13.1, 13.5)', () => {
  // A full address: something, an @ sign, and a domain with a dot.
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  // GitHub's SSH clone URLs (git@github.com:owner/repo.git) look like an address but name no person.
  const withoutCloneUrls = (text: string) => text.replace(/git@github\.com:/g, 'git-clone-url:');
  // An object key that holds an email.
  const EMAIL_KEY = /"[^"]*email[^"]*"\s*:/i;

  it('detects an address and an email key in sample text', () => {
    expect(EMAIL.test('{"a":"someone@example.com"}')).toBe(true);
    expect(EMAIL_KEY.test('{"author_email": "x"}')).toBe(true);
    expect(EMAIL.test('{"login":"octocat","at":"@octocat"}')).toBe(false);
    expect(EMAIL.test(withoutCloneUrls('git@github.com:o/r.git'))).toBe(false);
    expect(EMAIL.test(withoutCloneUrls('me@github.com'))).toBe(true);
  });

  it('finds no email address or email field in any captured or constructed fixture', () => {
    expect(Object.keys(fixtureFiles).length).toBeGreaterThan(20);
    const offenders = Object.entries(fixtureFiles)
      .filter(([, text]) => EMAIL.test(withoutCloneUrls(text)) || EMAIL_KEY.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('finds no email in what the public functions return for captured fixtures', async () => {
    const transport = createFakeTransport((request, number) => {
      if (request.endpointId === 'user') return rawFrom(capturedResponse('user.ncptunex.json'));
      if (request.endpointId === 'user-repos') return rawFrom(capturedResponse('user-repos.ncptunex.json'));
      return detailHandler()(request, number);
    });
    const layer = createGitHubDataLayer({ transport, storage: null });
    const results = [
      await layer.lookupUser('ncptunex'),
      await layer.listRepositories('ncptunex'),
      await layer.getRepositoryDetail('dubzzz', 'fast-check'),
    ];
    for (const result of results) {
      expect(result.ok).toBe(true);
      const text = JSON.stringify(result);
      expect(text).not.toMatch(EMAIL);
      expect(text).not.toMatch(EMAIL_KEY);
    }
  });
});

describe('UI import boundary (task 10.3, Req 12.1)', () => {
  const uiFiles: Files = {
    ...raw(import.meta.glob('../../src/components/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })),
    ...raw(import.meta.glob('../../src/screens/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })),
    ...raw(import.meta.glob('../../src/App.tsx', { query: '?raw', import: 'default', eager: true })),
    ...raw(import.meta.glob('../../src/main.tsx', { query: '?raw', import: 'default', eager: true })),
  };

  it('finds the UI files it is meant to check', () => {
    expect(Object.keys(uiFiles).some((path) => path.endsWith('/src/App.tsx'))).toBe(true);
  });

  it('flags transports, adapters, schemas, cache, demo internals, the endpoint catalogue and api.github.com', () => {
    const bad = [
      `import { createDirectTransport } from '../data/github/transport/direct-transport';`,
      `import { adaptUser } from "../../data/github/adapters/user";`,
      `import { userSchema } from '../data/github/schemas/user';`,
      `import { createGitHubCache } from '../data/cache/github-cache';`,
      `import { buildDemoGraveyard } from '../data/demo/build-demo-graveyard';`,
      `import { ENDPOINTS } from '../../shared/github-endpoints/catalogue';`,
      `import { createGitHubDataLayer } from '../data/github/data-layer';`,
      `const mod = await import('../data/github/transport/types');`,
      `export { x } from '../data/github/rate-limit';`,
      `const url = 'https://api.github.com/users/octocat';`,
    ];
    for (const source of bad) expect(findBoundaryViolations(source), source).not.toEqual([]);
  });

  it('allows the public interface, the data types, other UI code and libraries', () => {
    const good = [
      `import { lookupUser } from '../data/github';`,
      `import { listRepositories } from '../../data/github/index';`,
      `import type { RepositorySummary } from '../data/github/types';`,
      `import type { ErrorKind } from '../data/github/errors/error-kinds';`,
      `import { Tombstone } from '../components/Tombstone';`,
      `import { useState } from 'react';`,
      `import './Tombstone.css';`,
    ];
    for (const source of good) expect(findBoundaryViolations(source), source).toEqual([]);
  });

  it('finds no violation in src/components, src/screens, App.tsx or main.tsx', () => {
    const offenders = Object.entries(uiFiles).flatMap(([path, text]) =>
      findBoundaryViolations(text).map((violation) => `${path}: ${violation}`),
    );
    expect(offenders).toEqual([]);
  });
});
