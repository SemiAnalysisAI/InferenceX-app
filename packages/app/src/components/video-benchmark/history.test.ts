import { describe, expect, it } from 'vitest';
import { servingFixture } from './serving.fixture';
import { at, entries, type Json } from './bundle';
import { videoHistoryEntry } from './history';
import type { StoredArtifact } from './stored';

function saved(): StoredArtifact {
  const fixture = servingFixture();
  fixture.documents.set('manifest.json', fixture.manifest);
  fixture.documents.set('ci.json', {
    ...Object.fromEntries(entries(fixture.ci)),
    started_at: '2026-09-09T01:00:00Z',
    release_qualified: false,
  });
  fixture.checksums.set('manifest.json', 'a'.repeat(64));
  return {
    storageVersion: 1,
    runId: '123',
    artifact: { id: 40, name: 'h3-video-123-1', expired: false, size_in_bytes: 100 },
    sources: [
      {
        id: '123',
        documents: [...fixture.documents],
        checksums: [...fixture.checksums],
        assets: [],
        texts: [],
      },
    ],
  };
}

function changePlans(artifact: StoredArtifact, change: (plan: Json) => void) {
  for (const [path, document] of artifact.sources[0].documents) {
    const plan = at(document, path === 'manifest.json' ? 'workload_plan' : 'plan');
    if (plan !== null) change(plan);
  }
}

describe('video history projection', () => {
  it('preserves case and generation identity independently of the display label', () => {
    const artifact = saved();
    const prefix = 'A drummer taps a snare drum. '.repeat(4);
    changePlans(artifact, (plan) => {
      Object.assign(at(plan, 'cases', 0)!, { prompt: `${prefix}First ending.` });
    });
    const baseline = videoHistoryEntry(artifact, null).sources[0].observations[0];
    expect(baseline.workloadKey).toEqual(expect.any(String));
    for (const change of [
      (plan: Json) => Object.assign(at(plan, 'cases', 0)!, { prompt: `${prefix}Other ending.` }),
      (plan: Json) => Object.assign(at(plan, 'cases', 0)!, { seed: 999 }),
      (plan: Json) => Object.assign(at(plan, 'generation')!, { flow_shift: 7 }),
    ]) {
      const changed = structuredClone(artifact);
      changePlans(changed, change);
      const source = videoHistoryEntry(changed, null).sources[0];
      expect(source.error).toBeNull();
      expect(source.observations[0].workloadKey).not.toBe(baseline.workloadKey);
    }
    const semantics = structuredClone(artifact);
    for (const [path, document] of semantics.sources[0].documents)
      if (path.endsWith('/spec.json'))
        Object.assign(at(document, 'server')!, { performance_mode: 'quality' });
    const changedSemantics = videoHistoryEntry(semantics, null).sources[0];
    expect(changedSemantics.error).toBeNull();
    expect(changedSemantics.observations[0].workload).toBe(baseline.workload);
    expect(changedSemantics.observations[0].workloadKey).not.toBe(baseline.workloadKey);
    // Repetition counts do not change the workload that was requested.
    const repeated = structuredClone(artifact);
    changePlans(repeated, (plan) => Object.assign(plan!, { repetitions: 8 }));
    const repeats = videoHistoryEntry(repeated, null).sources[0];
    expect(repeats.error).toBeNull();
    expect(repeats.observations.map((p) => p.workloadKey)).toEqual([
      baseline.workloadKey,
      baseline.workloadKey,
      baseline.workloadKey,
    ]);
  });

  it('groups concurrency cells under their original source without promoting smoke to qualification', () => {
    const entry = videoHistoryEntry(saved(), '2026-09-12T00:00:00Z');
    expect(entry.id).toBe('123.40');
    expect(entry.sources).toHaveLength(1);
    const source = entry.sources[0];
    expect(source.observedAt).toBe('2026-09-09T01:00:00Z');
    expect(source.releaseQualified).toBe(false);
    expect(
      source.observations.map((point) => [
        point.concurrency,
        point.p50,
        point.p90,
        point.clipsGpuHour,
        point.energyKj,
      ]),
    ).toEqual([
      [1, 120, null, 15, 168],
      [2, 240, null, 15, 168],
      [4, 300, null, 15, 168],
    ]);
  });
  it('carries GPU counts, wall time, clip shape, board power and server layout per cell', () => {
    const entry = videoHistoryEntry(saved(), null);
    const c1 = entry.sources[0].observations[0];
    expect(c1).toMatchObject({
      participating: 2,
      allocated: 2,
      replicas: null,
      wallSeconds: 480,
      durationSeconds: 4,
      frameCount: 107,
      avgPowerW: 1400,
      // The synthetic bundle records no power-limit snapshots, so no limit is invented.
      enforcedLimitW: null,
      server: { tp: 1, ulysses: 2, attention: null },
    });
  });
  it('preserves failed cells and null power without inventing zero-valued performance', () => {
    const artifact = saved();
    const source = artifact.sources[0];
    const docs = new Map(source.documents);
    const matrix = docs.get('serving-smoke.json');
    const cell = at(matrix, 'cells', 2);
    Object.assign(cell!, {
      verified: false,
      status: 'failed',
      run: null,
      receipt: null,
      power: null,
    });
    const entry = videoHistoryEntry(artifact, null);
    expect(entry.sources[0].error).toBeNull();
    expect(entry.sources[0].observations[2]).toMatchObject({
      status: 'failed',
      p50: null,
      p90: null,
      clipsGpuHour: null,
      energyKj: null,
      wallSeconds: null,
      avgPowerW: null,
      enforcedLimitW: null,
      workloadKey: null,
    });
  });
  it('retains source provenance and failure when a new artifact contract is unsupported', () => {
    const artifact = saved();
    const matrix = new Map(artifact.sources[0].documents).get('serving-smoke.json');
    Object.assign(matrix!, { schema_version: '9.0.0' });
    const source = videoHistoryEntry(artifact, null).sources[0];
    expect(source.error).toContain('unsupported matrix contract');
    expect(source.observations).toEqual([]);
    expect(source.observedAt).toBe('2026-09-09T01:00:00Z');
    expect(source.sourceSha).toBe('c'.repeat(40));
  });
});
