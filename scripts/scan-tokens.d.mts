// Types for scan-tokens.mjs, so the TypeScript tests can import it.
export const TOKEN_PATTERN: RegExp;
export function findTokenPrefixes(text: string): string[];
export function listFiles(target: string): string[];
export function scanPaths(
  paths: readonly string[],
  root: string,
): { file: string; line: number; prefix: string }[];
