import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FIXTURE_MANIFEST_FILENAME,
  FIXTURE_MANIFEST_SCHEMA_VERSION,
  type FixtureManifest,
  assertFixtureMatchesManifest,
} from '@/lib/test-fixture-manifest';

const fixturesDir = resolve(import.meta.dirname, '../../cypress/fixtures/api');
const manifest = JSON.parse(
  readFileSync(resolve(fixturesDir, FIXTURE_MANIFEST_FILENAME), 'utf8'),
) as FixtureManifest;

describe('Cypress API fixture manifest', () => {
  it('uses the current schema and records a valid generation timestamp', () => {
    expect(manifest.schemaVersion).toBe(FIXTURE_MANIFEST_SCHEMA_VERSION);
    expect(Number.isNaN(Date.parse(manifest.generatedAt))).toBe(false);
  });

  it('covers every fixture with matching shape, size, and checksum', () => {
    const fixtureFiles = readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.json') && name !== FIXTURE_MANIFEST_FILENAME)
      .toSorted();
    const fixtureNames = fixtureFiles.map((name) => name.slice(0, -'.json'.length)).toSorted();
    expect(Object.keys(manifest.fixtures).toSorted()).toEqual(fixtureNames);

    for (const filename of fixtureFiles) {
      const name = filename.slice(0, -'.json'.length);
      const body = readFileSync(resolve(fixturesDir, filename), 'utf8');
      const value = JSON.parse(body) as unknown;
      expect(() =>
        assertFixtureMatchesManifest(name, body, value, manifest.fixtures[name]),
      ).not.toThrow();
    }
  });
});
