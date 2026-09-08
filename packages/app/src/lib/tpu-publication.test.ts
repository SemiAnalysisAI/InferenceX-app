import { describe, expect, it } from 'vitest';
import sweep from '../../../db/src/etl/fixtures/tpu-manual-sweep.json';
import { normalizeArtifactRows, normalizeEvalArtifactRows } from '@/app/api/unofficial-run/route';
import { buildChartData } from '@/components/unofficial-run-provider';
import { getPointLabel } from '@/components/inference/utils/tooltipUtils';
import { pointLabelText } from '@/components/inference/ui/point-label';
import { rowToAggDataEntry, transformBenchmarkRows } from './benchmark-transform';
import { buildDerivedChartFields } from './chart-utils';
import { getGpuSpecs } from './constants';
import { inferenceChartToCsv } from './csv-export-helpers';
import { calculatePowerForGpus } from './utils';
import { getVendor } from './dynamic-colors';
import { rowToLightweightPoint } from '@/components/inference/hooks/useInterpolatedTrendData';
import { buildGpuGroups } from '@/components/calculator/useThroughputData';
import { Sequence } from './data-mappings';

const url = 'https://github.com/SemiAnalysisAI/InferenceX-Private-TPU/actions/runs/30864013158';
const rows = normalizeArtifactRows(sweep.benchmarks, '2026-08-03', url);

describe('TPU publication paths', () => {
  it('shows four physical chips and independent TP/DP on official and overlay points', () => {
    const official = transformBenchmarkRows(rows).chartData[0];
    const overlay = Object.values(buildChartData(rows))[0].e2e.data;
    expect(official).toHaveLength(6);
    expect(overlay).toHaveLength(6);
    for (const points of [official, overlay]) {
      const point = points.find((p) => p.decode_tp === 1)!;
      expect(point.physicalChips).toBe(4);
      expect(point.dp).toBe(8);
      expect(getPointLabel(point)).toBe('TP1/DP8');
      expect(pointLabelText(point, false, false)).toBe('4');
      expect(pointLabelText(point, true, false)).toBe('TP1/DP8');
      expect(point.tput_per_gpu).toBeCloseTo(3674.8418266267754);
      expect(point.tpPerMw!.y).toBeCloseTo((3674.8418266267754 * 1000) / 1.207);
      expect(point.jTotal!.y).toBeCloseTo(1207 / 3674.8418266267754);
      expect(calculatePowerForGpus([point], { tpuv7: 1.5 })[0].powerUser!.y).toBeGreaterThan(0);
    }
    const evals = normalizeEvalArtifactRows(
      sweep.evaluations,
      '2026-08-03',
      '2026-08-03T23:57:41Z',
      url,
    ).rows;
    expect(evals).toHaveLength(3);
    expect(evals.every((row) => !row.disagg && row.num_decode_gpu === 4)).toBe(true);
    expect(getVendor('tpuv7_vllm')).toBe('google');
    expect(getVendor('jalapeno_vllm')).toBe('openai');
    const csv = inferenceChartToCsv([], 'Qwen-3.5-397B-A17B', '8k/1k', overlay);
    const dp8 = csv.rows.find((row) => row[csv.headers.indexOf('DP')] === 8)!;
    expect(dp8[csv.headers.indexOf('TP')]).toBe(1);
    expect(dp8[csv.headers.indexOf('Physical Chips')]).toBe(4);
    expect(dp8[csv.headers.indexOf('Throughput/Chip (tok/s)')]).toBeCloseTo(3674.8418266267754);
  });

  it('applies the selected assumption identically to full charts, trends and calculator overlays', () => {
    const row = rows.find((r) => r.decode_tp === 1)!;
    const entry = rowToAggDataEntry(row);
    const external = buildDerivedChartFields(entry, 'tpuv7_vllm');
    const internal = buildDerivedChartFields(entry, 'tpuv7_vllm', undefined, 'internal');
    expect(internal.costh.y / external.costh.y).toBeCloseTo(1.03 / 1.21);
    expect(internal.tokensPerDollarH!.y / external.tokensPerDollarH!.y).toBeCloseTo(1.21 / 1.03);
    expect(rowToLightweightPoint(row, ['costh'], null, 'internal')!.costh.y).toBeCloseTo(
      internal.costh.y,
    );
    const groups = buildGpuGroups([row], {
      sequence: Sequence.EightK_OneK,
      precisions: ['fp8'],
      tcoBasis: 'internal',
      classify: (hwKey) => ({ key: hwKey, meta: { hwKey } }),
    });
    expect(Object.values(groups.grouped)[0][0].costh).toBeCloseTo(internal.costh.y);
    expect(getGpuSpecs('h100_vllm', 'internal')).toEqual(getGpuSpecs('h100_vllm'));
    expect(getGpuSpecs('tpuv7_vllm').power).toBe(1.207);
  });
});
