// Scans source files for GitHub token patterns (data-layer task 10.1, Req 11.1).
// Used by the token-scan test and by the "scan on save" Kiro hook.
//
// By hand:   npm run scan-tokens            (scans src/, shared/ and api/)
//            node scripts/scan-tokens.mjs <folder or file> ...
// It never prints a token. A finding shows only the file, the line and the prefix.
// Exit code: 0 when clean, 1 when a token pattern was found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** GitHub token prefixes: personal, OAuth, user-to-server, server-to-server, refresh, fine-grained. */
export const TOKEN_PATTERN = /\b(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/g;

/** The token-like matches in a text, each reduced to its prefix so the secret is never shown. */
export function findTokenPrefixes(text) {
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
}

const SCANNED_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|json|css|html|md)$/;

/** Every file under `target` (a file or a folder) that the scan covers. Missing paths give no files. */
export function listFiles(target) {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return [];
  }
  if (stats.isFile()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const path = join(target, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(path);
    return SCANNED_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

/** Findings as `{ file, line, prefix }`, for every file under the given paths. */
export function scanPaths(paths, root) {
  const findings = [];
  for (const target of paths) {
    for (const file of listFiles(target)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((text, index) => {
        for (const prefix of findTokenPrefixes(text)) {
          findings.push({ file: relative(root, file), line: index + 1, prefix });
        }
      });
    }
  }
  return findings;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const given = process.argv.slice(2);
  const targets = given.length > 0 ? given : ['src', 'shared', 'api'].map((name) => join(root, name));
  const findings = scanPaths(targets, root);
  if (findings.length === 0) {
    console.log('Token scan: no GitHub token pattern found.');
  } else {
    for (const finding of findings) {
      console.error(`Token scan: ${finding.file}:${finding.line} contains a "${finding.prefix}" token pattern.`);
    }
    console.error('Remove the token and revoke it on GitHub if it was real.');
    process.exitCode = 1;
  }
}
