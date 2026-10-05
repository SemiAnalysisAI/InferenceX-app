import { describe, expect, it } from 'vitest';
import type { Json } from './bundle';
import type { VideoHistoryPage } from './history';
import { servingCellEvidence, videoServingEvidence } from './serving-evidence';
import fixture from './serving-evidence.fixture.json';

function page(): VideoHistoryPage {
  return {
    schemaVersion: 1,
    nextPage: null,
    entries: [
      {
        id: '35986548616.2',
        runId: '35986548616',
        publishedAt: null,
        artifact: { id: 2, name: 'retained', expired: false, size_in_bytes: 0 },
        error: null,
        sources: [
          {
            id: '35986548616',
            sha256: 'a'.repeat(64),
            sourceSha: 'b'.repeat(40),
            hardware: 'AMD Instinct MI355X',
            execution: 'failed',
            observedAt: null,
            kind: 'observation',
            observations: [],
            serving: [servingCellEvidence(fixture.amd, true)],
            fidelity: null,
            calibration: null,
            releaseQualified: false,
            error: null,
          },
        ],
      },
    ],
  };
}

describe('serving outcome accounting', () => {
  it('preserves the retained H200 measured ledger and excludes its warmup', () => {
    expect(servingCellEvidence(fixture.h200, true)).toMatchObject({
      scheduled: 20,
      attempted: 20,
      completed: 20,
      failed: 0,
      timedOut: 0,
      notStarted: 0,
      valid: 20,
      unjudged: 20,
      legacyFailedSlots: 0,
      deliveryDeadlineSeconds: null,
      qualitySloGoodput: null,
      provenance: 'request-ledger',
    });
  });

  it('preserves AMD scheduled slots without counting unstarted work as failed attempts', () => {
    expect(servingCellEvidence(fixture.amd, true)).toMatchObject({
      scheduled: 20,
      attempted: 0,
      completed: 0,
      failed: 0,
      timedOut: 0,
      notStarted: 20,
      valid: 0,
      unjudged: 0,
      legacyFailedSlots: 20,
      unfinished: 0,
      deliveryDeadlineSeconds: null,
      qualitySloGoodput: null,
      provenance: 'cell-summary',
    });
  });

  it('keeps timed-out attempts distinct from unstarted slots and retains invalid completed media', () => {
    const run: Json = {
      summary: { scheduled: 4, completed: 2, valid: 1, failed: 3 },
      records: [
        {
          slot_id: 'a',
          phase: 'measurement',
          attempted: true,
          status: 'succeeded',
          outcome: 'completed',
          media: { valid: true },
        },
        {
          slot_id: 'b',
          phase: 'measurement',
          attempted: true,
          status: 'succeeded',
          outcome: 'invalid_media',
          media: { valid: false },
        },
        {
          slot_id: 'c',
          phase: 'measurement',
          attempted: true,
          status: 'failed',
          outcome: 'timed_out',
        },
        {
          slot_id: 'd',
          phase: 'measurement',
          attempted: false,
          status: 'failed',
          outcome: 'not_started',
        },
      ],
    };
    expect(
      servingCellEvidence({ id: 'c2', concurrency: 2, cell: null, run, spec: null }, true),
    ).toMatchObject({
      scheduled: 4,
      attempted: 3,
      completed: 2,
      valid: 1,
      unjudged: 1,
      failed: 1,
      timedOut: 1,
      notStarted: 1,
      legacyFailedSlots: 3,
      qualitySloGoodput: null,
    });
  });

  it('does not manufacture complete accounting or quality counts from a partial ledger or aggregate', () => {
    const partial = structuredClone(fixture.h200);
    partial.run.records.pop();
    delete (partial.run.serving as Partial<typeof partial.run.serving>).submitted;
    const row = servingCellEvidence(partial, true);
    expect(row.attempted).toBeNull();
    expect(row.unjudged).toBeNull();
    expect(row.provenance).toBe('cell-summary');
    expect(servingCellEvidence(fixture.h200, false).unjudged).toBeNull();
    expect(servingCellEvidence(fixture.h200, false).qualitySloGoodput).toBeNull();
    const judged = structuredClone(fixture.h200);
    Object.assign(judged.run.records[1], { quality_judgment: { status: 'pass' } });
    expect(servingCellEvidence(judged, true).unjudged).toBeNull();
  });

  it('preserves fractional deadlines without deriving a quality/deadline intersection', () => {
    const cell = structuredClone(fixture.h200);
    Object.assign(cell.run.serving, { delivery_deadline_seconds: 0.5 });
    expect(servingCellEvidence(cell, true)).toMatchObject({
      deliveryDeadlineSeconds: 0.5,
      qualitySloGoodput: null,
    });
  });

  it('keeps zero-sample and unknown-workload sources before chart filtering and deduplicates re-exports', () => {
    const first = page();
    const older = structuredClone(first);
    older.entries[0].runId = '100';
    older.entries[0].artifact.id = 1;
    expect(videoServingEvidence([first, older])).toMatchObject([
      {
        runId: '35986548616',
        artifactId: 2,
        sourceId: '35986548616',
        hardware: 'AMD Instinct MI355X',
        cell: 'c1',
        workloadKey: null,
        scheduled: 20,
        attempted: 0,
        notStarted: 20,
      },
    ]);
    expect(videoServingEvidence([first, older])).toHaveLength(1);
  });

  it('shows source errors and legacy observations without inventing missing outcome counts', () => {
    const failed = page();
    const source = failed.entries[0].sources[0];
    source.serving = [];
    source.error = 'Invalid H3 serving matrix: unsupported matrix contract';
    expect(videoServingEvidence([failed])[0]).toMatchObject({
      cell: null,
      scheduled: null,
      attempted: null,
      failed: null,
      unjudged: null,
      provenance: 'unavailable',
      error: source.error,
    });
    const legacy = page();
    const oldSource = legacy.entries[0].sources[0];
    delete oldSource.serving;
    // Old immutable history projections carry aggregate counts only.
    const observation = {
      id: 'legacy',
      cell: 'c1',
      hardware: oldSource.hardware,
      concurrency: 1,
      runtime: '',
      workload: '',
      model: '',
      status: 'complete',
      valid: 20,
      completed: 20,
      scheduled: 20,
      failed: 0,
      samples: 20,
      p50: 100,
      p90: 100,
      clipsGpuHour: null,
      energyKj: null,
      participating: null,
      allocated: null,
      replicas: null,
      wallSeconds: null,
      durationSeconds: null,
      frameCount: null,
      avgPowerW: null,
      enforcedLimitW: null,
      server: null,
    };
    oldSource.observations = [observation];
    expect(videoServingEvidence([legacy])[0]).toMatchObject({
      scheduled: 20,
      completed: 20,
      valid: 20,
      attempted: null,
      unjudged: null,
      failed: null,
      legacyFailedSlots: 0,
      provenance: 'legacy-projection',
    });
    // An older aggregate-only export must not duplicate a newer sealed c1 row.
    const current = page();
    expect(videoServingEvidence([current, legacy])).toHaveLength(1);
    expect(videoServingEvidence([current, legacy])[0].attempted).toBe(0);
    oldSource.observations = [
      { ...observation, id: 'legacy:baseline', cell: null },
      { ...observation, id: 'legacy:candidate', cell: null },
    ];
    expect(videoServingEvidence([legacy])).toHaveLength(2);
    expect(new Set(videoServingEvidence([legacy]).map((row) => row.id)).size).toBe(2);
  });

  it('retains a failed published index even when no source could be loaded', () => {
    const broken = page();
    broken.entries[0].sources = [];
    broken.entries[0].error = 'Published source index unavailable';
    expect(videoServingEvidence([broken])).toMatchObject([
      {
        runId: '35986548616',
        artifactId: 2,
        sourceId: '',
        cell: null,
        scheduled: null,
        attempted: null,
        failed: null,
        unjudged: null,
        provenance: 'unavailable',
        error: 'Published source index unavailable',
      },
    ]);
  });
});
