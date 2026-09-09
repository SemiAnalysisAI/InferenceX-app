import { describe, expect, it } from 'vitest';
import {
  tradeoffPoints,
  latencyValue,
  efficiencyValue,
  costValue,
  type TradeoffRun,
} from './tradeoff';
import type { Json } from './bundle';

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
