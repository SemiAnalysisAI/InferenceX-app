import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformBenchmarkRows } from './benchmark-transform';
import {
  experimentBenchmarkRows,
  experimentQualificationNote,
  experimentReferenceRows,
  withExperimentRows,
  LATEST_WEKA_EXPERIMENT,
  type ExperimentResponse,
} from './experiment-benchmarks';
import { scatterPointJoinId } from '@/components/inference/utils/point-identity';
import { isFrontierEligible } from '@/lib/charts/chart-utils';

const manifest = JSON.parse(
  readFileSync(
    new URL('../../../../db/experiments/weka-amg-kimi-k3-latest-3h.manifest.json', import.meta.url),
    'utf8',
  ),
);
const response: ExperimentResponse = {
  campaign: { ...manifest, manifest_sha256: '', expected_run_count: 22, complete: true },
  runs: manifest.runs.map((run: Record<string, any>) => ({
    ...run,
    configuration: {
      ...run.configuration,
      date: new Date(Number(run.cache_evidence.phase_time_ranges.profiling.start_ns) / 1e6)
        .toISOString()
        .slice(0, 10),
    },
    campaign_slug: manifest.slug,
    metrics: {},
    record_sha256: '',
  })),
};

describe('latest three-hour experiment chart integration', () => {
  it('isolates the 22 measurements from published one-hour data in exactly two series', () => {
    const official = {
      ...experimentBenchmarkRows(response)[0],
      framework: 'vllm',
      experiment: undefined,
      id: 123,
    };
    const rows = withExperimentRows([official, { ...official, hardware: 'h200' }], response);
    expect(rows).toHaveLength(22);
    expect(experimentReferenceRows(response)).toEqual([]);
    const { chartData, hardwareConfig } = transformBenchmarkRows(
      rows,
      'p90',
      'internal',
      'uncached',
    );
    const points = chartData[0];
    expect(points).toHaveLength(22);
    expect(new Set(points.map((p) => scatterPointJoinId(p, false))).size).toBe(22);
    expect(Object.keys(hardwareConfig).sort()).toEqual([
      'b300_vllm-mooncake-internal',
      'b300_vllm-weka-amg-latest',
    ]);
    expect(points.every((p) => p.experiment?.campaign === LATEST_WEKA_EXPERIMENT)).toBe(true);
    expect(points.filter((p) => p.framework === 'vllm-weka-amg-latest')).toHaveLength(13);
  });

  it('preserves every source metric, including dominated measurements and distinct actual dates', () => {
    const { chartData } = transformBenchmarkRows(
      experimentBenchmarkRows(response),
      'p90',
      'internal',
      'uncached',
    );
    for (const point of chartData[0]) {
      const run = response.runs.find((r) => r.run_id === point.experiment?.runId)!;
      expect(point.tpPerGpu.y).toBeCloseTo(Number(run.plot_metrics.uncached_tps_gpu), 8);
      expect(point.p90_intvty).toBeCloseTo(Number(run.plot_metrics.p90_interactivity), 8);
      expect(point.p90_ttft).toBe(Number(run.plot_metrics.p90_ttft));
      expect(point.date).toBe('2026-11-09');
      expect(point.actualDate).toBe(run.configuration.date);
      expect(point.id).toBeUndefined();
      expect(point.experiment?.detailHref).toContain(encodeURIComponent(run.run_id));
    }
    const c220 = chartData
      .flat()
      .find((p) => p.framework === 'vllm-weka-amg-latest' && p.conc === 220)!;
    expect(c220.tpPerGpu.y).toBeCloseTo(632.9353, 3);
  });

  it('keeps all three flagged measurements but excludes them from clean frontier candidates', () => {
    const { chartData } = transformBenchmarkRows(experimentBenchmarkRows(response), 'p90');
    const points = chartData[0];
    expect(points.filter(isFrontierEligible)).toHaveLength(19);
    const flagged = points.filter((p) => !isFrontierEligible(p));
    expect(flagged.map((p) => p.conc).sort((a, b) => a - b)).toEqual([128, 140, 180]);
    const c128 = flagged.find((p) => p.conc === 128)!;
    expect(experimentQualificationNote(c128.experiment!, 'en')).toContain('counter integrity');
    expect(experimentQualificationNote(c128.experiment!, 'en')).not.toContain('0.89');
    for (const p of flagged.filter((point) => point.conc !== 128)) {
      expect(experimentQualificationNote(p.experiment!, 'en')).toContain(
        'DRAM-cache load failures',
      );
    }
    const variants = new Set(
      points
        .filter((p) => p.framework === 'vllm-mooncake-internal')
        .map((p) => p.experiment?.configurationVariant),
    );
    expect(variants.size).toBe(4);
  });
});
