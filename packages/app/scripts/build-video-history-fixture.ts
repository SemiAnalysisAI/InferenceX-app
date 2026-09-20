/**
 * Rebuild cypress/fixtures/api/video-history.json from retained StoredArtifact
 * exports (frontend exports of the original CI artifacts; no new benchmark and
 * no new publication). Entries whose run has no local export are kept verbatim,
 * so fidelity-only entries survive a rebuild untouched.
 *
 * Usage:
 *   bun scripts/build-video-history-fixture.ts <dir-with-<runId>.json>
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  videoHistoryEntry,
  type VideoHistoryEntry,
  type VideoHistoryPage,
} from '../src/components/video-benchmark/history';
import type { StoredArtifact } from '../src/components/video-benchmark/stored';
import {
  FIXTURE_MANIFEST_FILENAME,
  type FixtureManifest,
  assertFixtureContent,
  fixtureSha256,
  fixtureTopLevel,
} from '../src/lib/test-fixture-manifest';

const FIXTURE_NAME = 'video-history';
const fixturesDir = resolve(import.meta.dirname, '..', 'cypress', 'fixtures', 'api');
const source = process.argv[2];
if (!source) throw new Error('Pass the directory holding retained <runId>.json exports');

const current = JSON.parse(
  await readFile(resolve(fixturesDir, `${FIXTURE_NAME}.json`), 'utf8'),
) as VideoHistoryPage;
const exports = new Map<string, StoredArtifact>();
const files = await readdir(source);
for (const file of files.filter((name) => /^\d+\.json$/u.test(name))) {
  const saved = JSON.parse(await readFile(resolve(source, file), 'utf8')) as StoredArtifact;
  if (saved.storageVersion !== 1) throw new Error(`${file} is not a storageVersion 1 export`);
  exports.set(`${saved.runId}.${saved.artifact.id}`, saved);
}

let rebuilt = 0;
const entries: VideoHistoryEntry[] = current.entries.map((entry) => {
  const saved = exports.get(entry.id);
  if (!saved) return entry;
  rebuilt += 1;
  const next = videoHistoryEntry(saved, entry.publishedAt);
  // The existing fixture already carries the artifact identity (size, digest); keep it.
  return { ...next, artifact: { ...next.artifact, ...entry.artifact } };
});
const page: VideoHistoryPage = { schemaVersion: 1, entries, nextPage: current.nextPage };
assertFixtureContent(FIXTURE_NAME, page);
const body = `${JSON.stringify(page, null, 2)}\n`;
await writeFile(resolve(fixturesDir, `${FIXTURE_NAME}.json`), body);

const manifestPath = resolve(fixturesDir, FIXTURE_MANIFEST_FILENAME);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest;
const capturedAt = new Date().toISOString();
manifest.fixtures[FIXTURE_NAME] = {
  bytes: Buffer.byteLength(body),
  capturedAt,
  sha256: fixtureSha256(body),
  source:
    'Retained public H3 metadata replay from original runs via videoHistoryEntry (per-cell GPU counts, board power and server layout); publication time unavailable. No new benchmark or publication.',
  topLevel: fixtureTopLevel(page),
};
manifest.generatedAt = capturedAt;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${entries.length} entries; ${rebuilt} rebuilt from ${exports.size} exports`);
