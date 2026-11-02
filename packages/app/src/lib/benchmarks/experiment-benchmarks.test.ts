import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformBenchmarkRows } from './benchmark-transform';
import {
  experimentBenchmarkRows,
  experimentReferenceRows,
  withExperimentRows,
  type ExperimentResponse,
} from './experiment-benchmarks';
import { scatterPointJoinId } from '@/components/inference/utils/point-identity';
import { isFrontierEligible } from '@/lib/charts/chart-utils';

// The exact campaign manifest supplies real measurements and repeat identities.
const manifest = JSON.parse(
  readFileSync(
    new URL('../../../../db/experiments/weka-amg-kimi-k3.manifest.json', import.meta.url),
    'utf8',
  ),
);
const response: ExperimentResponse = {
  campaign: { ...manifest, manifest_sha256: '', expected_run_count: 16, complete: true },
  runs: manifest.runs.map((run: Record<string, unknown>) => ({
    ...run,
    campaign_slug: manifest.slug,
    metrics: {},
    record_sha256: '',
  })),
};

describe('WEKA experiment chart integration', () => {
  it('preserves all measured repeats and the eleven archived reference points with real B300 hardware', () => {
    // Existing official rows are replaced by the archived reference, not doubled.
    const rows = withExperimentRows(experimentReferenceRows(response), response);
    expect(rows).toHaveLength(27);
    const { chartData, hardwareConfig } = transformBenchmarkRows(
      rows,
      'p90',
      'internal',
      'uncached',
    );
    const points = chartData[0];
    expect(points).toHaveLength(27);
    expect(new Set(points.map((p) => scatterPointJoinId(p, false))).size).toBe(27);
    expect(points.filter((p) => p.experiment)).toHaveLength(16);
    expect(points.every((p) => p.hw === 'b300')).toBe(true);
    expect(hardwareConfig['b300_vllm-weka-amg'].gpu).toContain('WEKA AMG');
    expect(points.filter((p) => p.hwKey === 'b300_vllm-weka-amg' && p.conc === 56)).toHaveLength(2);
  });

  it('uses the same uncached-throughput and slow-tail interactivity definitions as the final artifact', () => {
    const rows = experimentBenchmarkRows(response);
    const { chartData } = transformBenchmarkRows(rows, 'p90', 'internal', 'uncached');
    for (const point of chartData[0]) {
      const raw = response.runs.find((run) => run.run_id === point.experiment?.runId)!;
      expect(point.tpPerGpu.y).toBeCloseTo(Number(raw.plot_metrics.uncached_tps_gpu), 8);
      expect(point.p90_intvty).toBeCloseTo(Number(raw.plot_metrics.p90_interactivity), 8);
      expect(point.p90_ttft).toBe(Number(raw.plot_metrics.p90_ttft));
      expect(point.id).toBeUndefined();
      expect(point.experiment?.detailHref).toContain(encodeURIComponent(raw.run_id));
    }
  });

  it('retains actual dates and other measured percentiles while grouping the comparison curve', () => {
    const data: ExperimentResponse = {
      ...response,
      runs: [
        {
          ...response.runs[0],
          configuration: { ...response.runs[0].configuration, date: '2026-10-28' },
          metrics: { p95_itl: 0.125 },
        },
      ],
    };
    const { chartData } = transformBenchmarkRows(experimentBenchmarkRows(data), 'p95');
    expect(chartData[0][0].date).toBe('2026-10-31');
    expect(chartData[0][0].actualDate).toBe('2026-10-28');
    expect(chartData[0][0].p95_intvty).toBe(8);
  });

  it('keeps recovered C150 visible but out of clean frontier candidates, including overlay transformations', () => {
    const { chartData } = transformBenchmarkRows(experimentBenchmarkRows(response), 'p90');
    const flagged = chartData[0].find((p) => p.hwKey === 'b300_vllm-mooncake-recovered')!;
    expect(flagged.conc).toBe(150);
    expect(flagged.x).toBeGreaterThan(0);
    expect(isFrontierEligible(flagged)).toBe(false);
    expect(chartData[0].filter(isFrontierEligible)).toHaveLength(15);
  });
});
