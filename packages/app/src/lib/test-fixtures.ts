/**
 * Server-side fixture loader for cypress e2e mode.
 *
 * When `FIXTURES_MODE` is set (E2E_FIXTURES=1), API routes call `loadFixture`
 * to return a pre-captured response instead of querying the DB. Fixtures live
 * at `cypress/fixtures/api/<name>.json` and are refreshed via
 * `pnpm capture:fixtures`.
 *
 * Files are read once and cached in-memory. Reads are synchronous on first
 * access — fine for cypress where startup latency doesn't matter.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cache = new Map<string, unknown>();

export function loadFixture<T>(name: string): T {
  const hit = cache.get(name);
  if (hit !== undefined) return hit as T;
  // process.cwd() is packages/app/ when Next.js runs (`pnpm dev` or `pnpm start`).
  const path = resolve(process.cwd(), 'cypress', 'fixtures', 'api', `${name}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8')) as T;
  cache.set(name, data);
  return data;
}
