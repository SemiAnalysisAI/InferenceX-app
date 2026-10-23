import { describe, expect, it } from 'vitest';

import { buildComparison, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';
import { generateVendorColors } from '@/lib/charts/dynamic-colors';

import { hardwareLabel, operatorXColors, peakBandwidthTBs, peakTflops } from './hardware';
import { metricById } from './metrics';

function comparison() {
  const op = {
    type: 'gemm',
    args: { m: 1024, n: 1024, k: 1024, a: { dtype: 'bf16' }, b: { dtype: 'bf16' }, out: 'bf16' },
    sources: ['deepseek-ai/DeepSeek-V4-Pro/mlp'],
    backend: 'torch_npu_linear',
  };
  const dataset = normalizeBundle({
    run: {
      run_id: 'ascend-test',
      run_attempt: 1,
      source_sha: 'test',
      source_branch: null,
      generated_at: '2026-10-22T00:00:00Z',
      conclusion: 'success',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: 'cluster:ascend950pr-external',
          mode: 'timing',
          backends: ['torch_npu_linear'],
          cases: [{ testlist: 'gemm_deepseek_v4', shape: op }],
        },
      ],
    },
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            rows: [{ testlist: 'gemm_deepseek_v4', op, status: 'ok', metrics: { latency_us: 10 } }],
          },
        ],
      },
    ],
  });
  return buildComparison('gemm', [{ runner: 'ascend950pr-external', dataset }]);
}

describe('Ascend OperatorX reference', () => {
  it('exposes the same qualified normalization basis through the comparison API and UI', () => {
    const view = comparisonView(comparison(), 'gemm:DeepSeek-V4-Pro');
    const reference = view.hardware[0].reference!;
    expect(view.workload).toBe('gemm:DeepSeek-V4-Pro');
    expect(reference).toMatchObject({
      peakTflops: { bf16: 378, fp8: null, fp4: null },
      memoryBandwidthTBs: 1.6,
      memoryBandwidthAssumed: true,
    });
    expect(reference.source).toContain('Ascend-ubench.md');
    expect(reference.qualification).toContain('memory/ECC');
    expect(hardwareLabel('ascend950pr')).toBe(reference.label);
    expect(reference.label).toBe('950PR');
    expect(view.defaults).toEqual({
      metricVsSizeSlice: null,
      rooflinePrecision: 'bf16',
      rooflineNormalized: true,
    });
    expect(peakTflops('ascend950pr', 'bf16')).toBe(reference.peakTflops.bf16);
    expect(peakBandwidthTBs('ascend950pr')).toBe(reference.memoryBandwidthTBs);
    expect(reference.peakTflops.bf16! / reference.memoryBandwidthTBs).toBe(236.25);
    const c = view.cases[0];
    const us = view.measurements.ascend950pr.latencyUs[0]!;
    expect(us).toBe(10);
    expect(metricById('computeUtil').value(c, us, 'ascend950pr')).toBeCloseTo(
      214.7483648 / 378,
      12,
    );
    expect(metricById('bandwidthUtil').value(c, us, 'ascend950pr')).toBeCloseTo(
      (3 * 1024 ** 2 * 2) / (10 * 1e6) / 1.6,
      12,
    );
  });

  it('does not invent other precision peaks or change existing hardware references', () => {
    expect(peakTflops('ascend950pr', 'fp8')).toBeNull();
    expect(peakTflops('ascend950pr', 'fp4')).toBeNull();
    expect(peakTflops('ascend950pr', 'other')).toBeNull();
    expect(peakTflops('unknown', 'bf16')).toBeNull();
    expect(peakBandwidthTBs('unknown')).toBeNull();
    expect(peakTflops('h100', 'bf16')).toBe(989);
    expect(peakBandwidthTBs('h100')).toBe(3.35);
    const filtered = comparisonView(
      {
        ...comparison(),
        workloads: [
          { id: 'empty', label: 'Empty', cases: 0, hardware: [] },
          ...comparison().workloads,
        ],
      },
      'empty',
    );
    expect(filtered.hardware).toEqual([]);
    expect(filtered.cases).toEqual([]);
  });

  it.each(['light', 'dark'] as const)(
    'uses a separate crimson without recoloring AMD in %s mode',
    (theme) => {
      const otherKeys = ['mi300x', 'mi325x', 'mi355x', 'h100', 'unknown'];
      const colors = operatorXColors([...otherKeys, 'ascend950pr'], theme);
      for (const key of otherKeys)
        expect(colors[key]).toBe(generateVendorColors(otherKeys, theme)[key]);
      expect(colors.ascend950pr).toMatch(/ 355\)$/u);
      expect(colors.ascend950pr).not.toBe(colors.mi355x);
      expect(operatorXColors(['ascend950pr'], theme).ascend950pr).toBe(colors.ascend950pr);
      expect(operatorXColors([], theme)).toEqual({});
    },
  );
});
