import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';
import { applyBenchmarkPointBackfill } from '@semianalysisai/inferencex-db/etl/run-overrides';
import { transformBenchmarkRows } from './benchmark-transform';
import type { BenchmarkRow } from './api';

const cases: {
  source: Record<string, unknown>;
  api: BenchmarkRow;
  expected: { p75_power_w: number; p90_power_w: number };
}[] = JSON.parse(
  readFileSync(new URL('fixtures/power-percentile-recovery.json', import.meta.url), 'utf8'),
);

// Replayed telemetry hashes/windows live in docs/data/power-p90-backfill.json.
describe('audited Qwen3.5 power percentile recovery', () => {
  it.each(cases)(
    'restores P75/P90 through ingest and chart conversion for row $api.id',
    ({ source, api, expected }) => {
      const point = mapBenchmarkRow(source, createSkipTracker());
      expect(point).not.toBeNull();
      if (!point) throw new Error('Fixture must map to a benchmark point');
      const { run, attempt } = api.run_url!.match(
        /\/runs\/(?<run>\d+)\/attempts\/(?<attempt>\d+)/u,
      )!.groups!;
      const original = api;
      const before = transformBenchmarkRows([original]).chartData[0][0];
      expect(before.measuredAvgPower?.y).toBe(api.metrics.avg_power_w);
      expect(before.measuredP90Power).toBeUndefined();
      const recovered = applyBenchmarkPointBackfill(Number(run), Number(attempt), {
        ...point,
        configId: 999999,
      });
      expect(recovered.backfillId).not.toBeNull();
      expect(recovered.point.metrics).toMatchObject(expected);
      const after = transformBenchmarkRows([{ ...original, metrics: recovered.point.metrics }])
        .chartData[0][0];
      expect(after.measuredP75Power?.y).toBe(expected.p75_power_w);
      expect(after.measuredP90Power?.y).toBe(expected.p90_power_w);
      expect(after.measuredAvgPower).toEqual(before.measuredAvgPower);
      expect(after.outputTputPerGpu).toEqual(before.outputTputPerGpu);
    },
  );

  it('keeps AgentX recovery bound to its exact workload, offload, recipe and attempt', () => {
    const { source, api } = cases.find((entry) => entry.api.benchmark_type === 'agentic_traces')!;
    const mapped = mapBenchmarkRow(source, createSkipTracker());
    if (!mapped) throw new Error('Fixture must map to a benchmark point');
    const point = { ...mapped, configId: 999999 };
    const { run, attempt } = api.run_url!.match(
      /\/runs\/(?<run>\d+)\/attempts\/(?<attempt>\d+)/u,
    )!.groups!;
    for (const changed of [
      { ...point, isl: 8192, osl: 1024 },
      { ...point, offloadMode: 'off' },
      { ...point, recipeFingerprint: 'different-recipe' },
    ]) {
      const result = applyBenchmarkPointBackfill(Number(run), Number(attempt), changed);
      expect(result.backfillId).toBeNull();
      expect(result.point.metrics).toEqual(point.metrics);
    }
    expect(
      applyBenchmarkPointBackfill(Number(run), Number(attempt) + 1, point).backfillId,
    ).toBeNull();
  });
});
