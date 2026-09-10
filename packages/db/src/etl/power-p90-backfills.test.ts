import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { planBenchmarkPointBackfill } from '../lib/benchmark-point-backfill';
import { applyBenchmarkPointBackfill } from './run-overrides';
import { QWEN35_P90_POWER_BACKFILLS } from './power-p90-backfills';

const evidence = JSON.parse(
  readFileSync(new URL('../../../../docs/data/power-p90-backfill.json', import.meta.url), 'utf8'),
);

function sourcePoint(backfill = QWEN35_P90_POWER_BACKFILLS[0]) {
  return {
    configId: 999999,
    config: backfill.config,
    benchmarkType: backfill.benchmarkType,
    isl: backfill.isl,
    osl: backfill.osl,
    conc: backfill.conc,
    offloadMode: backfill.offloadMode,
    recipeFingerprint: backfill.recipeFingerprint,
    metrics: { ...backfill.expectedMetrics },
  };
}

describe('Qwen3.5 measured P90 backfills', () => {
  it('ties all 34 exact selectors and values to their raw audit evidence', () => {
    expect(QWEN35_P90_POWER_BACKFILLS).toHaveLength(34);
    for (const backfill of QWEN35_P90_POWER_BACKFILLS) {
      const record = evidence.records.find(
        (r: { row_id: string }) => Number(r.row_id) === backfill.productionBenchmarkId,
      );
      expect(record.config).toEqual(backfill.config);
      expect(record.recipe_fingerprint).toBe(backfill.recipeFingerprint);
      expect(record.conc).toBe(backfill.conc);
      expect(record.run_attempt).toBe(backfill.runAttempt);
      expect(record.run_url).toContain(
        `/runs/${backfill.githubRunId}/attempts/${backfill.runAttempt}`,
      );
      expect(backfill.expectedMetrics).toEqual({
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: record.source_avg_power_w,
      });
      expect(backfill.set.metricsMerge).toEqual({
        p90_power_w: record.p90_power_w,
        p90_total_gpu_power_w: record.p90_total_gpu_power_w,
      });
      expect(Math.abs(record.average_power_parity_w)).toBeLessThan(0.001);
      expect(record.p90_total_gpu_power_w / record.gpu_count).toBeCloseTo(record.p90_power_w, 2);
      expect(record.window.end_time_unix).toBeGreaterThan(record.window.start_time_unix);
      for (const hash of Object.values(record.source_sha256))
        expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it.each([undefined, null, 1])(
    'does not apply attempt-2 telemetry when source attempt is %s',
    (attempt) => {
      const backfill = QWEN35_P90_POWER_BACKFILLS.find((b) => b.runAttempt === 2)!;
      const point = sourcePoint(backfill);
      expect(
        applyBenchmarkPointBackfill(backfill.githubRunId, attempt, point).backfillId,
      ).toBeNull();
      expect(
        applyBenchmarkPointBackfill(backfill.githubRunId, 2, point).point.metrics,
      ).toMatchObject(backfill.set.metricsMerge!);
    },
  );

  it.each([
    { power_valid: 0 },
    { power_valid: undefined },
    { power_metric_schema_version: undefined },
    { power_metric_schema_version: 1 },
    { avg_power_w: -1 },
  ])('withholds a replay when source metrics changed: %j', (changed) => {
    const backfill = QWEN35_P90_POWER_BACKFILLS[0];
    const point = sourcePoint(backfill);
    const metrics = { ...point.metrics, ...changed };
    const result = applyBenchmarkPointBackfill(backfill.githubRunId, backfill.runAttempt, {
      ...point,
      metrics,
    });
    expect(result.backfillId).toBeNull();
    expect(result.point.metrics).toEqual(metrics);
    expect(() => planBenchmarkPointBackfill({ offload_mode: 'off', metrics }, backfill)).toThrow(
      /source metrics differ/u,
    );
  });

  it('applies once to an unchanged audited source and preserves unrelated metrics', () => {
    const backfill = QWEN35_P90_POWER_BACKFILLS[0];
    const metrics = { ...backfill.expectedMetrics, median_itl: 0.01 };
    const patched = planBenchmarkPointBackfill({ offload_mode: 'off', metrics }, backfill)!;
    expect(patched).toEqual({ ...metrics, ...backfill.set.metricsMerge });
    expect(
      planBenchmarkPointBackfill({ offload_mode: 'off', metrics: patched }, backfill),
    ).toBeNull();
  });
});
