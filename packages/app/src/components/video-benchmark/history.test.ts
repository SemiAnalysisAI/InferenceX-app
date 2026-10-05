import { describe, expect, it } from 'vitest';
import { servingFixture, wanServingFixture } from './serving.fixture';
import { at, entries, type Json } from './bundle';
import { videoHistoryEntry } from './history';
import { videoModelHistory } from './models';
import type { StoredArtifact } from './stored';

function saved(
  requests = 4,
  fixture = servingFixture('123', 'NVIDIA H200', requests),
): StoredArtifact {
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

function addDashboardSidecar(artifact: StoredArtifact) {
  const source = artifact.sources[0];
  const docs = new Map(source.documents);
  const checks = new Map(source.checksums);
  const sidecar = {
    schemaVersion: 1,
    sourceRunId: '123',
    sourceSha: 'c'.repeat(40),
    cells: {
      c1: {
        runSha256: checks.get('gpu/c1/baseline/run.json')!,
        specSha256: checks.get('gpu/c1/spec.json')!,
        deployment: { ring: 1, cfg: 1, maxBatchSize: 1, scheduling: 'dynamic' },
        hardwareHealth: {
          status: 'fail',
          reason: 'fixture thermal failure',
          evidence: 'fixture://health',
        },
        quality: {
          scale: 'ordinal_0_to_4',
          contractId: 'fixture-contract',
          contractSha256: 'd'.repeat(64),
          rubricVersion: 'fixture-v1',
          rubricSha256: 'e'.repeat(64),
          metrics: {},
        },
      },
    },
  };
  Object.assign(at(docs.get('manifest.json'), 'evidence')!, {
    'dashboard-observations.json': 'f'.repeat(64),
  });
  source.documents.push(['dashboard-observations.json', sidecar]);
  source.checksums.push(['dashboard-observations.json', 'f'.repeat(64)]);
  return sidecar;
}

describe('source-bound dashboard evidence', () => {
  it('projects the sealed per-cell fields and preserves absent evidence as null', () => {
    const artifact = saved();
    const sidecar = addDashboardSidecar(artifact);
    const source = videoHistoryEntry(artifact, null).sources[0];
    expect(source.error).toBeNull();
    expect(source.observations[0]).toMatchObject({
      deployment: sidecar.cells.c1.deployment,
      hardwareHealth: sidecar.cells.c1.hardwareHealth,
      quality: sidecar.cells.c1.quality,
    });
    expect(source.observations[1]).toMatchObject({
      deployment: null,
      hardwareHealth: null,
      quality: null,
    });
  });

  it.each(['source', 'run', 'spec', 'seal', 'shape', 'unknown-cell'])(
    'rejects %s mismatches instead of silently qualifying the point',
    (mutation) => {
      const artifact = saved();
      const sidecar = addDashboardSidecar(artifact);
      if (mutation === 'source') sidecar.sourceRunId = '456';
      if (mutation === 'run') sidecar.cells.c1.runSha256 = '0'.repeat(64);
      if (mutation === 'spec') sidecar.cells.c1.specSha256 = '0'.repeat(64);
      if (mutation === 'seal') artifact.sources[0].checksums.pop();
      if (mutation === 'shape') Object.assign(sidecar.cells.c1.deployment, { ring: '1' });
      if (mutation === 'unknown-cell') Object.assign(sidecar.cells, { c8: sidecar.cells.c1 });
      const result = videoHistoryEntry(artifact, null).sources[0];
      expect(result.error).toContain('dashboard observation');
      expect(result.observations).toEqual([]);
    },
  );
});

describe('planned serving population', () => {
  it('projects successful measured requests without treating valid media as judged quality', () => {
    const source = videoHistoryEntry(saved(20), null).sources[0];
    expect(source).toHaveProperty(
      'serving',
      expect.arrayContaining([
        expect.objectContaining({
          cell: 'c1',
          scheduled: 20,
          attempted: 20,
          completed: 20,
          valid: 20,
          unjudged: 20,
          failed: 0,
          notStarted: 0,
          qualitySloGoodput: null,
        }),
      ]),
    );
  });

  it('keeps zero-attempt planned cells separate from submitted failures and chart eligibility', () => {
    const artifact = saved(20);
    const matrix = new Map(artifact.sources[0].documents).get('serving-smoke.json');
    Object.assign(at(matrix, 'cells', 0)!, {
      verified: false,
      status: 'failed',
      run: null,
      receipt: null,
      power: null,
      completion: {
        scheduled: 20,
        attempted: 0,
        completed: 0,
        valid: 0,
        failed: 20,
        not_started: 20,
        unfinished: 0,
      },
    });
    const source = videoHistoryEntry(artifact, null).sources[0];
    expect(source.error).toBeNull();
    expect(source.observations[0]).toMatchObject({ samples: 0, workloadKey: null, p50: null });
    expect(source).toHaveProperty(
      'serving',
      expect.arrayContaining([
        expect.objectContaining({
          cell: 'c1',
          scheduled: 20,
          attempted: 0,
          completed: 0,
          valid: 0,
          failed: 0,
          timedOut: 0,
          notStarted: 20,
          legacyFailedSlots: 20,
          qualitySloGoodput: null,
          workloadKey: null,
        }),
      ]),
    );
  });
});

it('preserves sealed planned counts when missing execution evidence cannot support a chart point', () => {
  const artifact = saved(20);
  const source = artifact.sources[0];
  const matrix = new Map(source.documents).get('serving-smoke.json');
  Object.assign(at(matrix, 'cells', 0)!, {
    verified: false,
    status: 'failed',
    run: null,
    power: null,
    completion: {
      scheduled: 20,
      attempted: 0,
      completed: 0,
      valid: 0,
      failed: 20,
      not_started: 20,
      unfinished: 0,
    },
  });
  source.documents = source.documents.filter(([path]) => path !== 'gpu/c1/spec.json');
  const projected = videoHistoryEntry(artifact, null).sources[0];
  expect(projected.error).toContain('supervisor, workload or hardware identity');
  expect(projected.observations).toEqual([]);
  expect(projected.serving?.[0]).toMatchObject({
    scheduled: 20,
    attempted: 0,
    notStarted: 20,
    failed: 0,
    legacyFailedSlots: 20,
    workloadKey: null,
    provenance: 'cell-summary',
  });
});

it('keeps planned AMD counts when recorded GPU identity cannot qualify execution', () => {
  const artifact = saved(20);
  const matrix = new Map(artifact.sources[0].documents).get('serving-smoke.json');
  Object.assign(matrix!, { gpu_uuids: ['a4ff7295', '73ff7654'] });
  Object.assign(at(matrix, 'cells', 0)!, {
    verified: false,
    status: 'failed',
    run: null,
    power: null,
    completion: {
      scheduled: 20,
      attempted: 0,
      completed: 0,
      valid: 0,
      failed: 20,
      not_started: 20,
      unfinished: 0,
    },
  });
  const projected = videoHistoryEntry(artifact, null).sources[0];
  expect(projected.error).toContain('GPU identity');
  expect(projected.observations).toEqual([]);
  expect(projected.serving?.[0]).toMatchObject({
    scheduled: 20,
    attempted: 0,
    notStarted: 20,
    failed: 0,
    legacyFailedSlots: 20,
    workloadKey: null,
  });
});

describe('Wan producer model identity', () => {
  it.each(['Wan-AI/Wan2.2-T2V-A14B-Diffusers', 'Wan-AI/Wan2.2-T2V-A14B'])(
    'retains %s on a sealed preflight failure without result.json or generated media',
    (modelId) => {
      const artifact = saved(20);
      changePlans(artifact, (plan) => Object.assign(plan!, { model_id: modelId }));
      const matrix = new Map(artifact.sources[0].documents).get('serving-smoke.json');
      Object.assign(matrix!, {
        gpu_uuids: [],
        bundle_type: 'video_serving_smoke_matrix',
        cells: [
          {
            concurrency: 1,
            status: 'failed',
            verified: false,
            run: null,
            receipt: null,
            power: null,
            completion: {
              scheduled: 20,
              attempted: 0,
              completed: 0,
              valid: 0,
              failed: 20,
              not_started: 20,
              unfinished: 0,
            },
          },
        ],
      });
      const entry = videoHistoryEntry(artifact, null);
      expect(entry.sources[0].model).toBe('Wan-AI/Wan2.2-T2V-A14B-Diffusers');
      const pages = [{ schemaVersion: 1 as const, entries: [entry], nextPage: null }];
      const wan = videoModelHistory(pages, 'wan22');
      expect(wan[0].entries).toHaveLength(1);
      expect(wan[0].entries[0].sources[0].serving?.[0]).toMatchObject({
        scheduled: 20,
        attempted: 0,
        notStarted: 20,
        failed: 0,
        qualitySloGoodput: null,
      });
      expect(videoModelHistory(pages, 'h3')[0].entries).toEqual([]);
    },
  );
});

it('projects synthetic video-only success through Wan while preserving missing quality', () => {
  const entry = videoHistoryEntry(saved(20, wanServingFixture()), null);
  const source = entry.sources[0];
  expect(source.error).toBeNull();
  expect(source.observations).toHaveLength(3);
  expect(videoHistoryEntry(saved(20), null).sources[0].observations[0].durationSeconds).toBe(4);
  expect(source.observations[0]).toMatchObject({
    model: 'Wan-AI/Wan2.2-T2V-A14B-Diffusers',
    valid: 20,
    samples: 20,
    p50: 120,
    durationSeconds: 81 / 16,
  });
  expect(source.serving?.[0]).toMatchObject({
    scheduled: 20,
    attempted: 20,
    completed: 20,
    valid: 20,
    unjudged: 20,
    qualitySloGoodput: null,
  });
  const pages = [{ schemaVersion: 1 as const, entries: [entry], nextPage: null }];
  expect(
    videoModelHistory(pages, 'wan22')[0].entries[0].sources[0].observations.every(
      (o) => o.quality === null,
    ),
  ).toBe(true);
  expect(videoModelHistory(pages, 'h3')[0].entries).toEqual([]);
});

it('retains the manifest model and error when a stored result contradicts it', () => {
  const artifact = saved(20, wanServingFixture());
  artifact.sources[0].documents.push([
    'result.json',
    { workload: { plan: { model_id: 'MiniMaxAI/MiniMax-H3' } } },
  ]);
  const entry = videoHistoryEntry(artifact, null);
  expect(entry.sources[0]).toMatchObject({
    model: 'Wan-AI/Wan2.2-T2V-A14B-Diffusers',
    observations: [],
    error: 'Manifest and result identify different video models',
  });
  expect(
    videoModelHistory([{ schemaVersion: 1, entries: [entry], nextPage: null }], 'h3')[0].entries,
  ).toEqual([]);
});

it('does not classify an unidentified generic producer as a legacy H3 source', () => {
  const artifact = saved();
  artifact.artifact.name = 'video-serving-123-1';
  changePlans(artifact, (plan) => Object.assign(plan!, { model_id: '' }));
  const page = {
    schemaVersion: 1 as const,
    entries: [videoHistoryEntry(artifact, null)],
    nextPage: null,
  };
  for (const model of ['h3', 'wan22'] as const)
    expect(videoModelHistory([page], model)[0].entries).toEqual([]);
});

it('resolves a legacy mixed missing/known projection from its unique nonempty model identity', () => {
  const source = videoHistoryEntry(saved(), null).sources[0];
  source.model = null;
  source.observations = [
    { ...source.observations[0], model: '' },
    { ...source.observations[1], model: 'Wan-AI/Wan2.2-T2V-A14B-Diffusers' },
  ];
  const entry = videoHistoryEntry(saved(), null);
  entry.sources = [source];
  const pages = [{ schemaVersion: 1 as const, entries: [entry], nextPage: null }];
  expect(videoModelHistory(pages, 'h3')[0].entries).toEqual([]);
  expect(videoModelHistory(pages, 'wan22')[0].entries).toHaveLength(1);
});
