import { describe, expect, it } from 'vitest';
import history from '../../../cypress/fixtures/api/video-history.json';
import { at, type Json } from './bundle';
import {
  caseKey,
  caseRecords,
  comparablePoints,
  compareMetrics,
  compareSide,
  pairCases,
  type CaseRecord,
} from './compare';
import type { VideoHistoryPage } from './history';
import { videoPoints } from './points';
import { servingCells } from './serving';
import { servingFixture } from './serving.fixture';
import type { StoredArtifact, StoredSource } from './stored';

// Retained H100/H200/B200 C1/C2/C4 observations of the 2026-09-09 campaign.
const points = videoPoints([history as unknown as VideoHistoryPage]);
const c1 = (key: string) => comparablePoints(points).find((p) => p.hardwareKey === key)!;
const opts = { tier: 'h' } as const;
const row = (rows: ReturnType<typeof compareMetrics>, id: string) =>
  rows.find((item) => item.id === id)!;

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

describe('comparablePoints', () => {
  it('keeps one measured C1 cell per registry hardware, in registry order', () => {
    expect(comparablePoints(points).map((p) => [p.hardwareKey, p.concurrency])).toEqual([
      ['b200', 1],
      ['h200', 1],
      ['h100', 1],
    ]);
    expect(comparablePoints(points.map((p) => ({ ...p, p50: null })))).toEqual([]);
  });
});

describe('compareMetrics', () => {
  it('reads B200 against H100 at C1: faster, cheaper and less energy per video', () => {
    const rows = compareMetrics(c1('h100'), c1('b200'), opts);
    expect(rows.map((r) => r.id)).toEqual(['p50Latency', 'dollarsPerVideo', 'kjPerVideo']);
    const p50 = row(rows, 'p50Latency');
    expect(p50.baseline).toBeCloseTo(167.33, 2);
    expect(p50.candidate).toBeCloseTo(77.94, 2);
    expect(p50.ratio).toBeCloseTo(0.4658, 3);
    expect(p50.deltaPercent).toBeCloseTo(-53.42, 1);
    expect(p50.candidateBetter).toBe(true);
    // Hyperscaler tier: $1.17 / 5.374 and $1.73 / 11.526 videos per participating GPU-hour.
    const cost = row(rows, 'dollarsPerVideo');
    expect(cost.baseline).toBeCloseTo(0.2177, 4);
    expect(cost.candidate).toBeCloseTo(0.1501, 4);
    expect(cost.ratio).toBeCloseTo(0.6894, 3);
    expect(cost.deltaPercent).toBeCloseTo(-31.06, 1);
    expect(cost.candidateBetter).toBe(true);
    const energy = row(rows, 'kjPerVideo');
    expect(energy.baseline).toBeCloseTo(431.1, 1);
    expect(energy.candidate).toBeCloseTo(301.1, 1);
    expect(energy.ratio).toBeCloseTo(0.6983, 3);
    expect(energy.deltaPercent).toBeCloseTo(-30.17, 1);
    expect(energy.candidateBetter).toBe(true);
  });
  it('flips the verdict when the slower hardware is the candidate', () => {
    const rows = compareMetrics(c1('b200'), c1('h200'), opts);
    expect(row(rows, 'p50Latency').ratio).toBeCloseTo(1.9323, 3);
    expect(row(rows, 'p50Latency').candidateBetter).toBe(false);
    expect(row(rows, 'dollarsPerVideo').candidateBetter).toBe(false);
  });
  it('propagates missing inputs as null and treats equal values as neither better', () => {
    const unmeasured = { ...c1('b200'), energyKj: null, wallSeconds: null, samples: 5 };
    const rows = compareMetrics(c1('h100'), unmeasured, opts);
    expect(row(rows, 'kjPerVideo')).toEqual({
      id: 'kjPerVideo',
      baseline: c1('h100').energyKj,
      candidate: null,
      ratio: null,
      deltaPercent: null,
      candidateBetter: null,
    });
    expect(row(rows, 'dollarsPerVideo')).toMatchObject({
      baseline: expect.closeTo(0.2177, 4),
      candidate: null,
      ratio: null,
      candidateBetter: null,
    });
    // P50 has no sample floor, unlike P90 in the run views.
    expect(row(rows, 'p50Latency').ratio).toBeCloseTo(0.4658, 3);
    // A zero baseline has no ratio either.
    expect(
      row(compareMetrics({ ...c1('h100'), p50: 0 }, c1('b200'), opts), 'p50Latency'),
    ).toMatchObject({
      baseline: 0,
      candidate: expect.closeTo(77.94, 2),
      ratio: null,
      deltaPercent: null,
      candidateBetter: null,
    });
    for (const same of compareMetrics(c1('h100'), c1('h100'), opts)) {
      expect(same.ratio).toBe(1);
      expect(same.deltaPercent).toBe(0);
      expect(same.candidateBetter).toBeNull();
    }
  });
  it('moves only the cost row with the tier', () => {
    const rows = compareMetrics(c1('h100'), c1('b200'), { tier: 'r' });
    // Rental $2.00 / 5.374 and $3.70 / 11.526 videos per GPU-hour, still per participating GPU.
    const cost = row(rows, 'dollarsPerVideo');
    expect(cost.baseline).toBeCloseTo(0.3722, 3);
    expect(cost.candidate).toBeCloseTo(0.321, 3);
    expect(cost.ratio).toBeCloseTo(0.8626, 3);
    expect(cost.candidateBetter).toBe(true);
    const atHyperscaler = compareMetrics(c1('h100'), c1('b200'), opts);
    expect(row(rows, 'p50Latency')).toEqual(row(atHyperscaler, 'p50Latency'));
    expect(row(rows, 'kjPerVideo')).toEqual(row(atHyperscaler, 'kjPerVideo'));
    expect(row(rows, 'p50Latency').ratio).toBeCloseTo(0.4658, 3);
    expect(row(rows, 'kjPerVideo').ratio).toBeCloseTo(0.6984, 3);
  });
});

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
    // A slot that names no plan case and carries no identity has nothing to pair on.
    set(at(run, 'records', 3), 'slot_id', 'measurement-r003');
    expect(caseKey(caseRecords({ run, runPath: 'gpu/c1/baseline/run.json' })[2])).toBeNull();
  });
});

const records = (requests: number) =>
  caseRecords(servingCells(servingFixture('1', 'NVIDIA H100 80GB HBM3', requests))[0]);

describe('pairCases', () => {
  it('pairs the k-th repetition of a prompt + seed on each side and counts the rest', () => {
    const { pairs, unmatched } = pairCases(records(4), records(6));
    expect(pairs).toHaveLength(4);
    expect(pairs.map((p) => p.repetition)).toEqual([0, 1, 2, 3]);
    expect(pairs[1]).toMatchObject({
      caseId: 'drum-taps',
      prompt: 'A drummer taps a snare drum.',
      seed: 11,
      baseline: { slotId: 'measurement-r002-c001' },
      candidate: { slotId: 'measurement-r002-c001' },
    });
    expect(unmatched).toEqual({ baseline: 0, candidate: 2 });
    expect(pairCases(records(6), records(4)).unmatched).toEqual({ baseline: 2, candidate: 0 });
  });
  it('never pairs different seeds or records without identity', () => {
    const other = records(4).map((r): CaseRecord => ({ ...r, seed: 12 }));
    expect(pairCases(records(4), other)).toEqual({
      pairs: [],
      unmatched: { baseline: 4, candidate: 4 },
    });
    const blank = records(2).map((r): CaseRecord => ({
      ...r,
      caseId: null,
      prompt: null,
      seed: null,
    }));
    expect(pairCases(blank, records(2)).unmatched).toEqual({ baseline: 2, candidate: 2 });
  });
  it('falls back to the case id only when prompt or seed is unknown', () => {
    const [record] = records(1);
    expect(caseKey(record)).toBe('ps\u000011\u0000A drummer taps a snare drum.');
    expect(caseKey({ ...record, seed: null })).toBe('id\u0000drum-taps');
    expect(caseKey({ ...record, prompt: null, caseId: null })).toBeNull();
    const byId = pairCases([{ ...record, seed: null }], [{ ...record, prompt: null }]);
    expect(byId.pairs).toHaveLength(1);
    expect(byId.pairs[0]).toMatchObject({ prompt: 'A drummer taps a snare drum.', seed: 11 });
  });
});

describe('compareSide', () => {
  const h100 = c1('h100');
  it('resolves the point’s C1 records and published media URLs from a stored artifact', () => {
    const side = compareSide(stored(h100.runId, h100.artifactId, 'NVIDIA H100 80GB HBM3'), h100);
    expect(side.records).toHaveLength(4);
    expect(side.urls.get(side.records[0].mediaPath!)).toBe(
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
