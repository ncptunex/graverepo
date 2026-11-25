// Checks the fixture rules in the two fixture READMEs (Req 14.1–14.3, task 2.3):
// every captured file has complete metadata, and every constructed file is marked.
import { describe, expect, it } from 'vitest';
import {
  capturedFileNames,
  constructedFileNames,
  loadCaptured,
  loadConstructed,
} from './helpers/fixtures';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('captured fixtures', () => {
  const files = capturedFileNames();

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has complete metadata', (name) => {
    const { meta } = loadCaptured(name);
    expect(meta.endpoint.startsWith('/')).toBe(true);
    expect(meta.capturedAt).toMatch(ISO_UTC);
    expect(meta.source.length).toBeGreaterThan(0);
    expect(meta.capturedWith.length).toBeGreaterThan(0);
    expect(Number.isInteger(meta.status)).toBe(true);
    expect(Array.isArray(meta.redactions)).toBe(true);
  });

  it.each(files)('%s is not marked as constructed', (name) => {
    expect(loadCaptured(name).meta).not.toHaveProperty('constructed');
  });
});

describe('constructed fixtures', () => {
  const files = constructedFileNames();

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is marked as constructed and describes its case', (name) => {
    const fixture = loadConstructed(name);
    expect(fixture.meta.constructed).toBe(true);
    expect(fixture.meta.case.trim().length).toBeGreaterThan(0);
    expect(Number.isInteger(fixture.status)).toBe(true);
  });
});
