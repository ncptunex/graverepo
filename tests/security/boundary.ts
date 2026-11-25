// The UI import-boundary rule (data-layer task 10.3, Req 12.1; tech.md section 2).
// UI code (components and screens) may use the data layer's public interface and its types.
// It may not import transports, adapters, schemas, the cache, demo internals, the endpoint
// catalogue or any other data-layer file, and it may not contain the GitHub API host.

/** The data-layer files that UI code may import. Everything else under `data/` is off limits. */
const ALLOWED_DATA_IMPORT = /(^|\/)data\/github(\/index|\/types|\/errors\/error-kinds)?$/;

const IMPORT_SPECIFIER =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** A short description for each rule that the source breaks. An empty list means it is clean. */
export function findBoundaryViolations(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    const touchesDataLayer = /(^|\/)data(\/|$)/.test(specifier);
    const touchesCatalogue = /github-endpoints/.test(specifier);
    if ((touchesDataLayer && !ALLOWED_DATA_IMPORT.test(specifier)) || touchesCatalogue) {
      violations.push(`imports ${specifier}`);
    }
  }
  if (source.includes('api.github.com')) violations.push('contains api.github.com');
  return violations;
}
