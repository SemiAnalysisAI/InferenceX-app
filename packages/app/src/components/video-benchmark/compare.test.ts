import { describe, expect, it } from 'bun:test';
import history from '../../../cypress/fixtures/api/video-history.json';
import { at, type Json } from './bundle';
import { caseRecords, compareSide } from './compare';
import type { VideoHistoryPage } from './history';
import { qualifies, videoPoints } from './points';
import { servingCells } from './serving';
import { servingFixture } from './serving.fixture';
import type { StoredArtifact, StoredSource } from './stored';

// Retained H100/H200/B200 C1/C2/C4 observations of the 2026-09-09 campaign.
const points = videoPoints([history as unknown as VideoHistoryPage]);
function set(value: Json, key: string, replacement: Json) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}

/** The stored copy of one bundle document; mutating it corrupts only that source. */
const document = (source: StoredSource, path: string): Json =>
  source.documents.find(([name]) => name === path)?.[1] ?? null;

// Same shape cypress/support/video-artifacts.ts publishes: synthetic contract data, never evidence.
function stored(
  runId: string,
  artifactId: number,
  hardware: string,
  requests = 4,
  manifestSha = runId.padEnd(64, '0'),
): StoredArtifact {
  const fixture = servingFixture(runId, hardware, requests);
  fixture.documents.set('manifest.json', fixture.manifest);
  fixture.documents.set('ci.json', fixture.ci);
  fixture.checksums.set('manifest.json', manifestSha);
  return {
    storageVersion: 1,
    runId,
    artifact: {
      id: artifactId,
      name: `h3-video-${runId}-1`,
      expired: false,
      size_in_bytes: 1,
      stored: true,
    },
    sources: [
      {
        id: runId,
        documents: [...fixture.documents],
        checksums: [...fixture.checksums],
        texts: [],
        assets: [...fixture.checksums.keys()]
          .filter((path) => path.endsWith('.mp4'))
          .map((path) => [
            path,
            { url: `https://media.test/${path}`, downloadUrl: `https://media.test/${path}?d=1` },
          ]),
      },
    ],
  };
}

describe('caseRecords', () => {
  it('lists measurement requests with plan-derived case identity and safe media paths', () => {
    const [cell] = servingCells(servingFixture('123', 'NVIDIA H200', 4));
    const records = caseRecords(cell);
    expect(records).toHaveLength(4);
    expect(records[0]).toEqual({
      slotId: 'measurement-r001-c001',
      caseId: 'drum-taps',
      prompt: 'A drummer taps a snare drum.',
      seed: 11,
      status: 'succeeded',
      valid: true,
      seconds: 120,
      mediaPath: 'gpu/c1/baseline/artifacts/measurement-r001-c001.mp4',
    });
    expect(records.map((r) => r.slotId)).not.toContain('warmup-001');
  });
  it('prefers the record’s own case fields and drops unsafe or missing paths', () => {
    const fixture = servingFixture('123', 'NVIDIA H200', 4);
    const run = fixture.documents.get('gpu/c1/baseline/run.json')!;
    const first = at(run, 'records', 1);
    set(first, 'case_id', 'own-case');
    set(first, 'prompt', 'Own prompt');
    set(first, 'seed', 99);
    set(first, 'artifact_path', '../candidate/movie.mp4');
    const second = at(run, 'records', 2);
    set(second, 'artifact_path', null);
    set(second, 'submit_to_media_seconds', 0);
    set(at(second, 'media'), 'valid', null);
    const records = caseRecords({ run, runPath: 'gpu/c1/baseline/run.json' });
    expect(records[0]).toMatchObject({
      caseId: 'own-case',
      prompt: 'Own prompt',
      seed: 99,
      mediaPath: null,
    });
    expect(records[1]).toMatchObject({ mediaPath: null, seconds: null, valid: null });
    // A slot that names no plan case carries no identity.
    set(at(run, 'records', 3), 'slot_id', 'measurement-r003');
    expect(caseRecords({ run, runPath: 'gpu/c1/baseline/run.json' })[2]).toMatchObject({
      caseId: null,
      prompt: null,
      seed: null,
    });
  });
});

describe('compareSide', () => {
  const h100 = points.filter(qualifies).find((p) => p.hardwareKey === 'h100')!;
  it('resolves the point’s C1 records and published media URLs from a stored artifact', () => {
    const side = compareSide(stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3'), h100);
    expect(side.records).toHaveLength(4);
    expect(side.media.get(side.records[0].mediaPath!)?.url).toBe(
      'https://media.test/gpu/c1/baseline/artifacts/measurement-r001-c001.mp4',
    );
  });
  it('prefers the source whose manifest SHA the point id names', () => {
    const sha = h100.id.split(':')[0];
    const other = stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3', 3);
    const exact = stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3', 6, sha);
    const saved: StoredArtifact = { ...exact, sources: [...other.sources, ...exact.sources] };
    expect(compareSide(saved, h100).records).toHaveLength(6);
  });
  it('rejects another run’s artifact and artifacts without the cell', () => {
    expect(() =>
      compareSide(stored('999', h100.artifactId, 'NVIDIA H100 80GB HBM3'), h100),
    ).toThrow('Stored artifact identity mismatch');
    expect(() => compareSide(stored(h100.runId, 1, 'NVIDIA H100 80GB HBM3'), h100)).toThrow(
      'Stored artifact identity mismatch',
    );
    expect(() =>
      compareSide(stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3'), {
        ...h100,
        cell: 'c3',
      }),
    ).toThrow('Published artifact has no c3 cell');
    const fidelityOnly = stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3');
    fidelityOnly.sources[0].kind = 'fidelity';
    expect(() => compareSide(fidelityOnly, h100)).toThrow('Published artifact has no c1 cell');
  });
  it('skips a malformed source so a readable sibling still resolves', () => {
    const sha = h100.id.split(':')[0];
    const hardware = 'NVIDIA H100 80GB HBM3';
    // Manifest names another run, so storedBundle rejects the source.
    const misbundled = stored(h100.runId, h100.artifactId, hardware, 3);
    set(document(misbundled.sources[0], 'manifest.json'), 'run_id', '999');
    // Manifest mode no longer matches CI, so servingCells rejects the source.
    const inconsistent = stored(h100.runId, h100.artifactId, hardware, 5);
    set(document(inconsistent.sources[0], 'manifest.json'), 'mode', 'fidelity');
    const corrupt = [...misbundled.sources, ...inconsistent.sources];
    // The readable sibling wins whether the point names its manifest SHA…
    const exact = stored(h100.runId, h100.artifactId, hardware, 6, sha);
    expect(
      compareSide({ ...exact, sources: [...corrupt, ...exact.sources] }, h100).records,
    ).toHaveLength(6);
    // …or it is merely the first source with the cell, before or after the corrupt ones.
    const other = stored(h100.runId, h100.artifactId, hardware, 4);
    expect(
      compareSide({ ...other, sources: [...corrupt, ...other.sources] }, h100).records,
    ).toHaveLength(4);
    expect(
      compareSide({ ...other, sources: [...other.sources, ...corrupt] }, h100).records,
    ).toHaveLength(4);
  });
  it('rethrows the first source error only when no source publishes the cell', () => {
    const hardware = 'NVIDIA H100 80GB HBM3';
    const misbundled = stored(h100.runId, h100.artifactId, hardware);
    set(document(misbundled.sources[0], 'manifest.json'), 'run_id', '999');
    const inconsistent = stored(h100.runId, h100.artifactId, hardware);
    set(document(inconsistent.sources[0], 'manifest.json'), 'mode', 'fidelity');
    expect(() => compareSide(misbundled, h100)).toThrow('Stored result identity mismatch');
    expect(() => compareSide(inconsistent, h100)).toThrow(
      'Invalid H3 serving matrix: CI identity does not match the manifest',
    );
    expect(() =>
      compareSide(
        { ...inconsistent, sources: [...inconsistent.sources, ...misbundled.sources] },
        h100,
      ),
    ).toThrow('Invalid H3 serving matrix: CI identity does not match the manifest');
    // A readable source without the cell does not prove the unreadable one lacked it.
    const readable = stored(h100.runId, h100.artifactId, hardware);
    expect(() =>
      compareSide(
        { ...readable, sources: [...misbundled.sources, ...readable.sources] },
        {
          ...h100,
          cell: 'c3',
        },
      ),
    ).toThrow('Stored result identity mismatch');
  });
});
