import { describe, expect, it } from 'bun:test';

import { buildComparison, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  hardwareLabel,
  peakBandwidthTBs,
  peakTflops,
  removeHardwareSelection,
  restoresAllHardware,
  scaleUpTBs,
  sortHardware,
  toggleHardwareSelection,
} from './hardware';
import { metricById } from './metrics';
import { rooflineBound } from './roofline-bound';

function comparison(dtype = 'bf16', runner = 'ascend950pr-external', backend = 'torch_npu_linear') {
  const op = {
    type: 'gemm',
    args: { m: 1024, n: 1024, k: 1024, a: { dtype }, b: { dtype }, out: 'bf16' },
    sources: ['deepseek-ai/DeepSeek-V4-Pro/mlp'],
    backend,
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
          runner: `cluster:${runner}`,
          mode: 'timing',
          backends: [backend],
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
  return buildComparison('gemm', [{ runner, dataset }]);
}

describe('Ascend OperatorX reference', () => {
  it('exposes the same qualified normalization basis through the comparison API and UI', () => {
    const view = comparisonView(comparison(), 'gemm:DeepSeek-V4-Pro');
    const reference = view.hardware[0].reference!;
    expect(view.workload).toBe('gemm:DeepSeek-V4-Pro');
    expect(reference).toMatchObject({
      peakTflops: { bf16: 378, fp8: 756, fp4: null },
      memoryBandwidthTBs: 1.6384,
      memoryBandwidthAssumed: true,
    });
    expect(reference.source).toContain('Ascend-ubench.md');
    expect(reference.qualification).toContain('8 HBM stacks × 256 bits × 6.4 Gbps');
    expect(hardwareLabel('ascend950pr')).toBe(reference.label);
    expect(reference.label).toBe('950PR');
    expect(view.defaults).toEqual({
      metricVsSizeSlice: null,
      rooflinePrecision: 'bf16',
      rooflineNormalized: true,
    });
    expect(peakTflops('ascend950pr', 'bf16')).toBe(reference.peakTflops.bf16);
    expect(peakBandwidthTBs('ascend950pr')).toBe(reference.memoryBandwidthTBs);
    expect(reference.peakTflops.bf16! / reference.memoryBandwidthTBs).toBe(230.712890625);
    const c = view.cases[0];
    const us = view.measurements.ascend950pr.latencyUs[0]!;
    expect(us).toBe(10);
    expect(metricById('computeUtil').value(c, us, 'ascend950pr')).toBeCloseTo(
      214.7483648 / 378,
      12,
    );
    expect(metricById('bandwidthUtil').value(c, us, 'ascend950pr')).toBeCloseTo(
      (3 * 1024 ** 2 * 2) / (10 * 1e6) / 1.6384,
      12,
    );
  });

  it('normalizes FP8 measurements with the same Cube peak in the API and UI', () => {
    const view = comparisonView(comparison('e4m3'), 'gemm:DeepSeek-V4-Pro');
    expect(view.hardware[0].reference!.peakTflops.fp8).toBe(756);
    expect(view.defaults.rooflinePrecision).toBe('fp8');
    expect(view.cases[0].computePrecision).toBe('fp8');
    expect(view.measurements.ascend950pr.latencyUs[0]).toBe(10);
    expect(metricById('computeUtil').value(view.cases[0], 10, 'ascend950pr')).toBeCloseTo(
      214.7483648 / 756,
      12,
    );
    expect(peakTflops('ascend950pr', 'fp8')! / peakBandwidthTBs('ascend950pr')!).toBe(461.42578125);
  });

  it('leaves unregistered precisions and existing hardware references unchanged', () => {
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
});

describe('TPU7x OperatorX reference', () => {
  it('normalizes a TPU7x device by half of the per-chip peaks, one chiplet', () => {
    const view = comparisonView(comparison('e4m3', 'tpuv7', 'vllm'), 'gemm:DeepSeek-V4-Pro');
    const reference = view.hardware[0].reference!;
    expect(view.hardware[0].id).toBe('tpuv7');
    expect(reference).toMatchObject({
      label: 'TPU7x',
      peakTflops: { bf16: 1153.5, fp8: 2307, fp4: null },
      memoryBandwidthTBs: 3.69,
    });
    expect(reference.source).toContain('TPU7x');
    expect(hardwareLabel('tpuv7')).toBe(HW_REGISTRY.tpuv7.label);
    expect(peakTflops('tpuv7', 'fp4')).toBeNull();
    const c = view.cases[0];
    expect(metricById('computeUtil').value(c, 10, 'tpuv7')).toBeCloseTo(214.7483648 / 2307, 12);
    expect(metricById('bandwidthUtil').value(c, 10, 'tpuv7')).toBeCloseTo(
      c.bytes! / (10 * 1e6) / 3.69,
      12,
    );
    expect(rooflineBound(c, 'tpuv7')?.us).toBeGreaterThan(0);
  });

  it('sorts after the GPUs and has no scale-up reference', () => {
    expect(sortHardware(['tpuv7', 'mi355x', 'b200'])).toEqual(['b200', 'mi355x', 'tpuv7']);
    expect(scaleUpTBs('tpuv7')).toBeNull();
  });
});

describe('toggleHardwareSelection', () => {
  const all = ['b200', 'h200', 'mi355x'];

  it('isolates a shown GPU, like the inference chart legends', () => {
    expect(toggleHardwareSelection(['b200', 'h200', 'mi355x'], 'h200', all)).toEqual(['h200']);
  });

  it('adds a hidden GPU', () => {
    expect(toggleHardwareSelection(['b200'], 'h200', all)).toEqual(['b200', 'h200']);
  });

  it('restores every GPU when the only shown GPU is clicked', () => {
    expect(toggleHardwareSelection(['h200'], 'h200', all)).toEqual(all);
  });

  it('returns the same array when nothing changes so callers can skip the update', () => {
    const only = ['b200'];
    expect(toggleHardwareSelection(only, 'b200', ['b200'])).toBe(only);
  });
});

describe('removeHardwareSelection', () => {
  it('hides one GPU', () => {
    expect(removeHardwareSelection(['b200', 'h200', 'mi355x'], 'h200')).toEqual(['b200', 'mi355x']);
  });

  it('keeps the last selected GPU and returns the same array', () => {
    const only = ['b200'];
    expect(removeHardwareSelection(only, 'b200')).toBe(only);
    expect(removeHardwareSelection(only, 'h200')).toBe(only);
  });
});

describe('restoresAllHardware', () => {
  it('restores when the clicked GPU is the only one the legend shows', () => {
    expect(restoresAllHardware(['h200'], 'h200')).toBe(true);
  });

  it('isolates or adds otherwise', () => {
    expect(restoresAllHardware(['h200', 'b200'], 'h200')).toBe(false);
    expect(restoresAllHardware(['b200'], 'h200')).toBe(false);
  });
});
