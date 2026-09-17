import { describe, expect, it } from 'vitest';

import {
  generateTooltipContent,
  generateGPUGraphTooltipContent,
  generateOverlayTooltipContent,
} from '@/components/inference/utils/tooltipUtils';
import { transformBenchmarkRows } from './benchmark-transform';
import { SUPPLEMENTAL_BENCHMARK_ROWS } from './supplemental-benchmarks';

// C256-N8 in the supplied 2026-08-22 GPT-OSS throughput.json:
// chip_count=8, tp=1, ep=8, median_tpot_ms=3.284620495235133.
const source = SUPPLEMENTAL_BENCHMARK_ROWS.find(
  (row) => row.model === 'gptoss120b' && row.conc === 256,
)!;

describe('explicit deployment chip counts', () => {
  it.each(['en', 'zh'] as const)('renders the supplied EP8 point in every %s tooltip', (locale) => {
    const { chartData, hardwareConfig } = transformBenchmarkRows([source]);
    const point = chartData[0][0];
    expect(point.tp).toBe(8);
    expect(point.decode_tp).toBe(1);
    expect(point.ep).toBe(8);
    expect(point.median_intvty).toBeCloseTo(304.449175);
    expect(point.tpPerGpu.y).toBeCloseTo(325426.1649993376 / 8);
    const config = {
      data: point,
      hardwareConfig,
      isPinned: false,
      xLabel: 'Interactivity',
      yLabel: 'Throughput',
      selectedYAxisMetric: 'y_tpPerGpu',
      locale,
    };
    // The overlay consumes the same transform, but has its own tooltip renderer.
    const htmls = [
      generateTooltipContent(config),
      generateGPUGraphTooltipContent(config),
      generateOverlayTooltipContent({
        ...config,
        overlayData: { data: chartData[0], hardwareConfig, label: 'test-run' },
      }),
    ];
    for (const html of htmls) {
      expect(html).toContain(
        `${locale === 'en' ? 'Total Chips' : '芯片总数'}${locale === 'en' ? ':' : '：'}</strong> 8`,
      );
      expect(html).toContain(
        `${locale === 'en' ? 'Tensor Parallelism' : '张量并行 (TP)'}${locale === 'en' ? ':' : '：'}</strong> 1`,
      );
      expect(html).toContain(
        `${locale === 'en' ? 'Expert Parallelism' : '专家并行 (EP)'}${locale === 'en' ? ':' : '：'}</strong> 8`,
      );
    }
  });

  it.each([
    { decode: 8, prefill: 8, expected: 8 },
    { decode: 8, prefill: 0, expected: 8 },
    { decode: 0, prefill: 8, expected: 8 },
    { decode: 0, prefill: 0, expected: 1 },
  ])('handles aggregate counts $decode / $prefill', ({ decode, prefill, expected }) => {
    const { chartData } = transformBenchmarkRows([
      {
        ...source,
        num_decode_gpu: decode,
        num_prefill_gpu: prefill,
      },
    ]);
    expect(chartData[0][0].tp).toBe(expected);
    expect(chartData[0][0].physicalChips).toBe(expected);
  });

  it.each([
    { decode: 4, prefill: 4, expected: 8 },
    { decode: 0, prefill: 4, expected: 8 },
    { decode: 0, prefill: 0, expected: 8 },
    { decode: 16, prefill: 16, expected: 16 },
  ])('keeps the PP floor for counts $decode / $prefill', ({ decode, prefill, expected }) => {
    // Stored legacy rows already contain positive TP × EP defaults, without PP.
    const { chartData } = transformBenchmarkRows([
      {
        ...source,
        prefill_tp: 4,
        decode_tp: 4,
        prefill_ep: 1,
        decode_ep: 1,
        num_decode_gpu: decode,
        num_prefill_gpu: prefill,
        metrics: { ...source.metrics, prefill_pp: 2, decode_pp: 2 },
      },
    ]);
    for (const series of chartData) {
      expect(series[0].tp).toBe(expected);
      expect(series[0].physicalChips).toBe(expected);
      expect(series[0].decode_tp).toBe(4);
      expect(series[0].pp).toBe(2);
      expect(series[0].tpPerGpu.y).toBe(source.metrics.tput_per_gpu);
    }
  });

  it('preserves every supplied GPT-OSS topology, including single-chip points', () => {
    const rows = SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.model === 'gptoss120b');
    const { chartData } = transformBenchmarkRows(rows);
    expect(chartData[0].map((p) => [p.tp, p.decode_tp, p.ep])).toEqual([
      [4, 4, 1],
      [2, 2, 1],
      [1, 1, 1],
      [1, 1, 1],
      ...Array.from({ length: 6 }, () => [8, 1, 8]),
    ]);
  });
});
