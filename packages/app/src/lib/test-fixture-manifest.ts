import { createHash } from 'node:crypto';

export const FIXTURE_MANIFEST_FILENAME = '_manifest.json';
export const FIXTURE_MANIFEST_SCHEMA_VERSION = 1;

export type FixtureTopLevel = 'array' | 'object';

export interface FixtureManifestEntry {
  bytes: number;
  capturedAt: string | null;
  sha256: string;
  source: string | null;
  topLevel: FixtureTopLevel;
}

export interface FixtureManifest {
  schemaVersion: typeof FIXTURE_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  fixtures: Record<string, FixtureManifestEntry>;
}

export function fixtureTopLevel(value: unknown): FixtureTopLevel {
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  throw new Error('Cypress API fixtures must contain a top-level array or object');
}

export function fixtureSha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export function assertFixtureMatchesManifest(
  name: string,
  body: string,
  value: unknown,
  entry: FixtureManifestEntry | undefined,
): void {
  if (!entry) throw new Error(`Fixture manifest has no entry for ${name}`);
  if (Buffer.byteLength(body) !== entry.bytes) {
    throw new Error(`Fixture ${name} byte length differs from its manifest`);
  }
  if (fixtureSha256(body) !== entry.sha256) {
    throw new Error(`Fixture ${name} checksum differs from its manifest`);
  }
  if (fixtureTopLevel(value) !== entry.topLevel) {
    throw new Error(`Fixture ${name} top-level shape differs from its manifest`);
  }
}
