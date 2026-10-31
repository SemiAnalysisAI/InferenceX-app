import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FIXTURE_MANIFEST_FILENAME,
  FIXTURE_MANIFEST_SCHEMA_VERSION,
  type FixtureManifest,
  assertFixtureMatchesManifest,
} from '@/lib/testing/test-fixture-manifest';

const cache = new Map<string, unknown>();
let manifestCache: FixtureManifest | undefined;

export function loadFixture<T>(name: string): T {
  const hit = cache.get(name);
  if (hit !== undefined) return hit as T;
  const fixturesDir = resolve(process.cwd(), 'cypress', 'fixtures', 'api');
  if (!manifestCache) {
    manifestCache = JSON.parse(
      readFileSync(resolve(fixturesDir, FIXTURE_MANIFEST_FILENAME), 'utf8'),
    ) as FixtureManifest;
    if (manifestCache.schemaVersion !== FIXTURE_MANIFEST_SCHEMA_VERSION) {
      throw new Error(`Unsupported fixture manifest schema ${manifestCache.schemaVersion}`);
    }
  }
  const body = readFileSync(resolve(fixturesDir, `${name}.json`), 'utf8');
  const data = JSON.parse(body) as T;
  assertFixtureMatchesManifest(name, body, data, manifestCache.fixtures[name]);
  cache.set(name, data);
  return data;
}
