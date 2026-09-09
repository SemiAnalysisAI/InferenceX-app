import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  tradeoffPoints,
  latencyValue,
  efficiencyValue,
  costValue,
  type TradeoffRun,
} from './tradeoff';
import { at, loadBundle, type Json } from './bundle';
import { servingFixture } from './serving.fixture';

function fixture(
  records: Json[] = Array.from({ length: 10 }, (_, i) => ({
    phase: 'measurement',
    status: 'succeeded',
    submit_to_media_seconds: i + 1,
    media: { valid: true, video: { duration_seconds: 8 } },
  })),
): TradeoffRun {
  return {
    exportRun: '20',
    artifact: '30',
    bundle: {
      manifest: { run_id: '10' },
      manifestSha256: 'synthetic',
      result: {
        schema_version: '1.0.0',
        bundle_type: 'h3_benchmark_result',
        workload: {
          plan: {
            model_id: 'synthetic-model',
            model_revision: 'frozen',
            plan_id: 'synthetic-plan',
            generation: {
              width: 1280,
              height: 720,
              duration_seconds: 8,
              fps: 24,
              num_inference_steps: 50,
            },
            cases: [{ prompt: 'Synthetic fixture', seed: 1 }],
            repetitions: 10,
            warmup_runs: 1,
          },
        },
        hardware: {
          reserved_gpu_count: 8,
          selected_gpu_count: 4,
          devices: [{ name: 'Synthetic GPU' }],
        },
        roles: {
          baseline: {
            records,
            metrics: {
              status: 'valid',
              completion: {
                valid: records.length,
                completed: records.length,
                scheduled: records.length + 1,
                failed: 1,
              },
              measurement: {
                wall_seconds: 3600,
                concurrency: 1,
                boundary: 'submit_to_validated_media',
              },
            },
            power: {
              phases: {
                measurement: { valid: true, aggregate: { joules_per_valid_clip: 360000 } },
              },
            },
          },
        },
      },
    },
  };
}
const cost = { hourly: '2', source: 'Synthetic all-in cost', date: '2026-09-09' };

describe('H3 tradeoff metrics (synthetic result-contract fixtures)', () => {
  it('uses nearest-rank P90 and excludes warmup while preserving failures', () => {
    const run = fixture();
    const data = run.bundle.result as { roles: { baseline: { records: Json[] } } };
    data.roles.baseline.records.push({
      phase: 'warmup',
      status: 'succeeded',
      submit_to_media_seconds: 1000,
      media: { valid: true },
    });
    const p = tradeoffPoints(run)[0];
    expect(latencyValue(p, 'p90')).toBe(9);
    expect(latencyValue(p, 'median')).toBe(5.5);
    expect(p.failed).toBe(1);
    expect(p.rate).toBe(10);
  });
  it('does not call a single measured request P90', () => {
    const p = tradeoffPoints(
      fixture([
        {
          phase: 'measurement',
          status: 'succeeded',
          submit_to_media_seconds: 149,
          media: { valid: true, video: { duration_seconds: 8 } },
        },
      ]),
    )[0];
    expect(latencyValue(p, 'p90')).toBeNull();
    expect(latencyValue(p, 'median')).toBe(149);
  });
  it('uses all allocated GPUs and actual valid video durations', () => {
    const p = tradeoffPoints(fixture())[0];
    expect(efficiencyValue(p, 'clipsGpu')).toBe(1.25);
    expect(efficiencyValue(p, 'secondsGpu')).toBe(10);
    expect(efficiencyValue(p, 'dollar', cost)).toBe(5);
    expect(efficiencyValue(p, 'energy')).toBe(10);
    expect(efficiencyValue({ ...p, allocated: null }, 'clipsGpu')).toBeNull();
    expect(efficiencyValue({ ...p, energy: null }, 'energy')).toBeNull();
  });
  it('rejects incomplete latency populations instead of reporting a fast subset', () => {
    const run = fixture([{ phase: 'measurement', status: 'succeeded', media: { valid: true } }]);
    expect(tradeoffPoints(run)[0].latencies).toEqual([]);
  });
  it('requires finite full deployment cost with a real date and source', () => {
    for (const invalid of [
      { ...cost, hourly: '' },
      { ...cost, hourly: '-1' },
      { ...cost, hourly: 'Infinity' },
      { ...cost, source: ' ' },
      { ...cost, date: '2026-02-30' },
    ])
      expect(costValue(invalid)).toBeNull();
    expect(costValue(cost)).toBe(2);
    expect(
      efficiencyValue({ ...tradeoffPoints(fixture())[0], rate: Number.MAX_VALUE }, 'dollar', {
        ...cost,
        hourly: '0.0001',
      }),
    ).toBeNull();
  });
  it('groups workload identity independently of plan names and repetition counts', () => {
    const a = fixture();
    const b = fixture();
    const result = b.bundle.result as { workload: { plan: Record<string, Json> } };
    result.workload.plan.plan_id = 'renamed';
    result.workload.plan.repetitions = 20;
    expect(tradeoffPoints(a)[0].group).toBe(tradeoffPoints(b)[0].group);
    expect(tradeoffPoints(a)[0].workloadLabel).toBe(tradeoffPoints(b)[0].workloadLabel);
    result.workload.plan.model_revision = 'changed';
    expect(tradeoffPoints(a)[0].group).not.toBe(tradeoffPoints(b)[0].group);
  });
  it('does not mix shape or seed changes and rejects non-result input', () => {
    const a = fixture(),
      b = fixture();
    const result = b.bundle.result as { workload: { plan: Record<string, Json> } };
    result.workload.plan.cases = [{ prompt: 'Synthetic fixture', seed: 2 }];
    expect(tradeoffPoints(a)[0].group).not.toBe(tradeoffPoints(b)[0].group);
    expect(tradeoffPoints(a)[0].workloadLabel).not.toBe(tradeoffPoints(b)[0].workloadLabel);
    result.workload.plan.cases = [{ prompt: 'Synthetic fixture', seed: 1 }];
    result.workload.plan.generation = { width: 1920, height: 1080 };
    expect(tradeoffPoints(a)[0].group).not.toBe(tradeoffPoints(b)[0].group);
    expect(tradeoffPoints(b)[0].completeWorkload).toBe(false);
    b.bundle.result = null;
    expect(tradeoffPoints(b)).toEqual([]);
  });
});

function matrixFixture(): TradeoffRun {
  return {
    exportRun: '123',
    artifact: '456',
    bundle: { ...servingFixture(), result: null, manifestSha256: 'synthetic-serving' },
  };
}
function replace(value: Json, key: string, replacement: Json) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  value[key] = replacement;
}

describe('Serving matrix tradeoff metrics (synthetic contract fixture)', () => {
  it('plots one point per concurrency and never pools twelve requests into P90', () => {
    const points = tradeoffPoints(matrixFixture());
    expect(points.map((p) => [p.cellId, p.concurrency, p.role, p.latencies.length])).toEqual([
      ['c1', 1, 'serving', 4],
      ['c2', 2, 'serving', 4],
      ['c4', 4, 'serving', 4],
    ]);
    expect(points.map((p) => latencyValue(p, 'median'))).toEqual([120, 240, 300]);
    expect(points.map((p) => latencyValue(p, 'p90'))).toEqual([null, null, null]);
    expect(new Set(points.map((p) => p.group)).size).toBe(1);
    expect(points.every((p) => p.completeWorkload)).toBe(true);
  });
  it('uses the delivery window, all allocated GPUs, actual durations and one shared power envelope', () => {
    const points = tradeoffPoints(matrixFixture());
    for (const p of points) {
      expect(p.boundary).toBe('submit_to_downloaded_media');
      expect(p.allocated).toBe(2);
      expect(p.participating).toBe(2);
      expect(p.rate).toBe(30);
      expect(efficiencyValue(p, 'clipsGpu')).toBe(15);
      expect(efficiencyValue(p, 'secondsGpu')).toBeCloseTo(66.875);
      expect(p.power).toBe(1400);
      expect(p.energy).toBe(168000);
      expect(efficiencyValue(p, 'energy')).toBeCloseTo(3600000 / 168000);
      expect(p.powerWindow).toBe(480);
    }
  });
  it('does not substitute requested or participating GPUs for missing allocation evidence', () => {
    const run = matrixFixture();
    replace(at(run.bundle.ci, 'slurm_job'), 'AllocTRES', 'cpu=32,mem=512G,node=1');
    expect(tradeoffPoints(run).map((p) => efficiencyValue(p, 'clipsGpu'))).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('keeps changed quality semantics separate while allowing parallel layout comparisons', () => {
    const run = matrixFixture();
    const initial = tradeoffPoints(run)[0].group;
    const server = at(run.bundle.documents!.get('gpu/c2/spec.json'), 'server');
    replace(server, 'ulysses_degree', 4);
    replace(server, 'attention_backend', 'aiter');
    expect(tradeoffPoints(run)[1].group).toBe(initial);
    replace(server, 'performance_mode', 'quality');
    expect(tradeoffPoints(run)[1].group).not.toBe(initial);
    expect(tradeoffPoints(run)[1].server).toEqual(server);
  });
  it('counts all eight AMD allocations only with a matching physical step inventory', () => {
    const run = matrixFixture();
    const ids = Array.from(
      { length: 8 },
      (_, i) => `75ff75a3-0000-1000-80e3-${String(i).padStart(12, '0')}`,
    );
    replace(run.bundle.ci ?? null, 'site', { cluster: 'mi355x-amds' });
    replace(run.bundle.ci ?? null, 'slurm_job', {
      AllocTRES: 'cpu=128,mem=512G,node=1,billing=128',
      TresPerNode: 'gres/gpu:8',
      OverSubscribe: 'NO',
      NumNodes: '1',
    });
    run.bundle.documents!.set('binding.json', {
      slurm: { H3_AMD_ALLOCATION_UUIDS: ids.join(',') },
    });
    run.bundle.documents!.set(
      'amd-allocated-devices.json',
      ids.map((uuid) => ({ uuid })),
    );
    expect(tradeoffPoints(run)[0].allocated).toBe(8);
    expect(efficiencyValue(tradeoffPoints(run)[0], 'clipsGpu')).toBe(3.75);
    run.bundle.documents!.set(
      'amd-allocated-devices.json',
      ids.slice(1).map((uuid) => ({ uuid })),
    );
    expect(efficiencyValue(tradeoffPoints(run)[0], 'clipsGpu')).toBeNull();
  });
  it('withholds incomplete latency data and invalid power without dropping their cells', () => {
    const run = matrixFixture();
    replace(
      at(run.bundle.documents!.get('gpu/c1/baseline/run.json'), 'records', 1),
      'submit_to_media_seconds',
      null,
    );
    const phase = at(run.bundle.documents!.get('gpu/c2/power.json'), 'phases', 'measurement');
    replace(phase, 'valid', false);
    replace(
      at(
        run.bundle.documents!.get('serving-smoke.json'),
        'cells',
        1,
        'power',
        'phases',
        'measurement',
      ),
      'valid',
      false,
    );
    const points = tradeoffPoints(run);
    expect(points).toHaveLength(3);
    expect(points[0].latencies).toEqual([]);
    expect(points[1].energy).toBeNull();
    expect(points[1].power).toBeNull();
    expect(points[2].energy).toBe(168000);
  });
  it('withholds stale latency and power for an unverified cell while retaining verified siblings', () => {
    const run = matrixFixture();
    const matrix = run.bundle.documents!.get('serving-smoke.json');
    replace(matrix!, 'status', 'failed');
    replace(at(matrix, 'cells', 0), 'status', 'failed');
    replace(at(matrix, 'cells', 0), 'verified', false);
    const points = tradeoffPoints(run);
    expect(points).toHaveLength(3);
    expect(points[0].valid).toBe(4);
    expect(points[0].completeWorkload).toBe(false);
    expect(latencyValue(points[0], 'median')).toBeNull();
    expect(points[0].rate).toBeNull();
    expect(points[0].energy).toBeNull();
    expect(points[0].power).toBeNull();
    expect(points[0].powerWindow).toBeNull();
    expect(latencyValue(points[1], 'median')).toBe(240);
    expect(points[1].completeWorkload).toBe(true);
    expect(points[1].energy).toBe(168000);
  });
});

it.skipIf(!process.env.H3_SERVING_ARTIFACT_DIR)(
  'extracts three measured points from the original serving CI artifact',
  async () => {
    const bundle = await loadBundle(
      async (path) => new Blob([await readFile(join(process.env.H3_SERVING_ARTIFACT_DIR!, path))]),
    );
    const points = tradeoffPoints({ bundle, exportRun: '34318467752', artifact: 'original' });
    expect(points).toHaveLength(3);
    const expected = [119.5026524469722, 237.67639482504455, 297.68666791851865];
    for (const [index, p] of points.entries()) {
      expect(latencyValue(p, 'median')).toBeCloseTo(expected[index]);
      expect(latencyValue(p, 'p90')).toBeNull();
      expect(p.valid).toBe(4);
      expect(p.hardware).toBe('NVIDIA H200');
      expect(p.allocated).toBe(2);
      expect(p.participating).toBe(2);
      expect(p.completeWorkload).toBe(true);
    }
    expect(new Set(points.map((p) => p.group)).size).toBe(1);
    expect(points[0].energy).toBeCloseTo(164180.49905077327);
    expect(efficiencyValue(points[0], 'clipsGpu')).toBeCloseTo(15.0621776301);
  },
);
