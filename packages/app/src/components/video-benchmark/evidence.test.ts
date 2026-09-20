import { describe, expect, it } from 'vitest';
import fixture from '../../../cypress/fixtures/api/video-history.json';
import {
  concurrencyPlateau,
  evidenceFacts,
  meterPercent,
  parseBandwidthTbps,
  plateauSummary,
  powerRange,
  powerUtilization,
  readSpeedup,
  scalingVsSpec,
  specNumbers,
} from './evidence';
import { hardwareSort } from './hardware';
import type { VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { videoPoints } from './points';

// Retained 2026-09-09 H100/H200/B200 C1/C2/C4 serving cells, n = 20 each; MI355X has no valid run.
const points = videoPoints([fixture as unknown as VideoHistoryPage]);
const cell = (hardwareKey: string, concurrency: number): VideoPoint => {
  const point = points.find((p) => p.hardwareKey === hardwareKey && p.concurrency === concurrency);
  if (!point) throw new Error(`fixture lacks ${hardwareKey} C${concurrency}`);
  return point;
};
const c1 = points.filter((p) => p.concurrency === 1);
const registryOrder = (keys: string[]) =>
  keys.toSorted((a, b) => hardwareSort(a) - hardwareSort(b));

describe('powerUtilization', () => {
  it('reads mean board power against the recorded enforced limit per measured hardware at C1', () => {
    const rows = powerUtilization(points);
    const keys = rows.map((row) => row.hardwareKey);
    expect(keys).toEqual(registryOrder(['h100', 'h200', 'b200']));
    expect(keys).toEqual(registryOrder(keys));
    const byKey = new Map(rows.map((row) => [row.hardwareKey, row]));
    expect(byKey.get('h100')?.avgPowerW).toBeCloseTo(2574.55, 1);
    expect(byKey.get('h100')?.enforcedLimitW).toBe(2800);
    expect(byKey.get('h100')?.percentOfCap).toBeCloseTo(91.95, 1);
    expect(byKey.get('h200')?.percentOfCap).toBeCloseTo(97.41, 1);
    expect(byKey.get('b200')?.avgPowerW).toBeCloseTo(3856.02, 1);
    expect(byKey.get('b200')?.enforcedLimitW).toBe(4000);
    expect(byKey.get('b200')?.percentOfCap).toBeCloseTo(96.4, 1);
  });
  it('summarises the measured spread and keeps missing limits null', () => {
    expect(powerRange(powerUtilization(points))).toEqual({
      measured: 3,
      min: expect.closeTo(91.95, 1),
      max: expect.closeTo(97.41, 1),
    });
    const unlimited = powerUtilization([{ ...cell('h100', 1), enforcedLimitW: null }]);
    expect(unlimited).toEqual([
      {
        hardwareKey: 'h100',
        avgPowerW: expect.closeTo(2574.55, 1),
        enforcedLimitW: null,
        percentOfCap: null,
      },
    ]);
    expect(powerRange(unlimited)).toBeNull();
    expect(powerUtilization([{ ...cell('h100', 1), avgPowerW: 0 }])[0].percentOfCap).toBeNull();
    expect(powerUtilization(points.filter((p) => p.concurrency !== 1))).toEqual([]);
  });
  it('keeps an over-cap share as measured while the meter position stays within 0–100', () => {
    const [over] = powerUtilization([{ ...cell('h200', 1), avgPowerW: 2856 }]);
    expect(over.enforcedLimitW).toBe(2800);
    expect(over.percentOfCap).toBeCloseTo(102, 6);
    expect(meterPercent(102)).toBe(100);
    expect(meterPercent(100.04)).toBe(100);
    expect(meterPercent(97.41)).toBe(97.4);
    expect(meterPercent(91.948)).toBe(91.9);
    expect(meterPercent(0)).toBe(0);
  });
});

describe('concurrencyPlateau', () => {
  it('holds throughput within 1.5 % of C1 while P50 scales with client concurrency', () => {
    const rows = concurrencyPlateau(points);
    expect(rows).toHaveLength(9);
    const row = (key: string, c: number) =>
      rows.find((r) => r.hardwareKey === key && r.concurrency === c);
    expect(row('h100', 1)).toEqual({
      hardwareKey: 'h100',
      concurrency: 1,
      videosPerGpuHour: expect.closeTo(5.374, 3),
      p50: expect.closeTo(167.333, 3),
      throughputRatioVsC1: 1,
      latencyRatioVsC1: 1,
    });
    expect(row('h100', 2)?.throughputRatioVsC1).toBeCloseTo(0.999, 3);
    expect(row('h100', 2)?.latencyRatioVsC1).toBeCloseTo(2.0007, 3);
    expect(row('h100', 4)?.throughputRatioVsC1).toBeCloseTo(0.9989, 3);
    expect(row('h100', 4)?.latencyRatioVsC1).toBeCloseTo(3.9995, 3);
    expect(row('h200', 2)?.throughputRatioVsC1).toBeCloseTo(1.004, 3);
    expect(row('h200', 2)?.latencyRatioVsC1).toBeCloseTo(1.9925, 3);
    expect(row('h200', 4)?.throughputRatioVsC1).toBeCloseTo(1.0023, 3);
    expect(row('h200', 4)?.latencyRatioVsC1).toBeCloseTo(3.9917, 3);
    expect(row('b200', 2)?.throughputRatioVsC1).toBeCloseTo(1.0144, 3);
    expect(row('b200', 2)?.latencyRatioVsC1).toBeCloseTo(1.9706, 3);
    expect(row('b200', 4)?.videosPerGpuHour).toBeCloseTo(11.692, 3);
    expect(row('b200', 4)?.p50).toBeCloseTo(307.284, 3);
    expect(row('b200', 4)?.throughputRatioVsC1).toBeCloseTo(1.0144, 3);
    expect(row('b200', 4)?.latencyRatioVsC1).toBeCloseTo(3.9423, 3);
  });
  it('switches the throughput denominator with the basis without moving the ratios', () => {
    const rows = concurrencyPlateau(points, 'allocated');
    const h100 = rows.filter((r) => r.hardwareKey === 'h100');
    expect(h100[0].videosPerGpuHour).toBeCloseTo(2.687, 3);
    expect(h100[2].throughputRatioVsC1).toBeCloseTo(0.9989, 3);
    // H200 allocated 4 of 4, so its denominator is unchanged.
    expect(rows.find((r) => r.hardwareKey === 'h200')?.videosPerGpuHour).toBeCloseTo(5.973, 3);
  });
  it('leaves ratios null without a C1 baseline and never reports 0', () => {
    const rows = concurrencyPlateau(
      points.filter((p) => !(p.hardwareKey === 'h200' && p.concurrency === 1)),
    );
    const h200 = rows.filter((r) => r.hardwareKey === 'h200');
    expect(h200).toHaveLength(2);
    expect(h200.every((r) => r.throughputRatioVsC1 === null && r.latencyRatioVsC1 === null)).toBe(
      true,
    );
    expect(h200[0].videosPerGpuHour).toBeCloseTo(5.997, 3);
    const broken = concurrencyPlateau([{ ...cell('b200', 1), wallSeconds: null, p50: 0 }]);
    expect(broken[0]).toMatchObject({
      videosPerGpuHour: null,
      p50: null,
      throughputRatioVsC1: null,
      latencyRatioVsC1: null,
    });
  });
  it('summarises queued cells: deviation from C1 and latency spread per concurrency', () => {
    const summary = plateauSummary(concurrencyPlateau(points));
    expect(summary).toEqual({
      queued: 6,
      throughputDeviationPct: expect.closeTo(1.437, 2),
      latency: [
        { concurrency: 2, min: expect.closeTo(1.9706, 3), max: expect.closeTo(2.0007, 3) },
        { concurrency: 4, min: expect.closeTo(3.9423, 3), max: expect.closeTo(3.9995, 3) },
      ],
    });
    expect(plateauSummary(concurrencyPlateau(c1))).toBeNull();
    expect(plateauSummary([])).toBeNull();
  });
});

describe('scalingVsSpec', () => {
  it('parses spec-sheet bandwidth strings in TB/s or GB/s', () => {
    expect(parseBandwidthTbps('4.8 TB/s')).toBe(4.8);
    expect(parseBandwidthTbps('3.35 TB/s')).toBe(3.35);
    expect(parseBandwidthTbps('8 TB/s')).toBe(8);
    expect(parseBandwidthTbps('3350 GB/s')).toBeCloseTo(3.35, 6);
    expect(parseBandwidthTbps('0 TB/s')).toBeNull();
    expect(parseBandwidthTbps('n/a')).toBeNull();
    expect(parseBandwidthTbps('')).toBeNull();
    expect(parseBandwidthTbps(null)).toBeNull();
  });
  it('looks up the campaign hardware on the GPU specs page by SKU name', () => {
    expect(specNumbers('h100')).toEqual({
      memoryBandwidthTbps: 3.35,
      bf16Tflops: 989,
      fp8Tflops: 1979,
    });
    expect(specNumbers('h200')).toEqual({
      memoryBandwidthTbps: 4.8,
      bf16Tflops: 989,
      fp8Tflops: 1979,
    });
    expect(specNumbers('b200')).toEqual({
      memoryBandwidthTbps: 8,
      bf16Tflops: 2250,
      fp8Tflops: 4500,
    });
    expect(specNumbers('unknown')).toEqual({
      memoryBandwidthTbps: null,
      bf16Tflops: null,
      fp8Tflops: null,
    });
  });
  it('pairs consecutive hardware from slowest to fastest C1 P50 against spec ratios', () => {
    const rows = scalingVsSpec(points);
    expect(rows.map((r) => [r.fromKey, r.toKey])).toEqual([
      ['h100', 'h200'],
      ['h200', 'b200'],
    ]);
    expect(rows[0].observedSpeedup).toBeCloseTo(1.111, 3);
    expect(rows[0].memoryBandwidthRatio).toBeCloseTo(1.4328, 3);
    expect(rows[0].bf16Ratio).toBe(1);
    expect(rows[0].fp8Ratio).toBe(1);
    expect(rows[1].observedSpeedup).toBeCloseTo(1.932, 3);
    expect(rows[1].memoryBandwidthRatio).toBeCloseTo(1.6667, 3);
    expect(rows[1].bf16Ratio).toBeCloseTo(2.275, 3);
    expect(rows[1].fp8Ratio).toBeCloseTo(2.2739, 3);
  });
  it('reads which spec ratio the observed speedup sits closer to, and says when it cannot tell', () => {
    const [h200, b200] = scalingVsSpec(points);
    expect(readSpeedup(h200)).toEqual({ closest: 'compute', position: 'between', decisive: true });
    expect(readSpeedup(b200)).toEqual({
      closest: 'bandwidth',
      position: 'between',
      decisive: false,
    });
    expect(readSpeedup({ ...b200, memoryBandwidthRatio: null })).toBeNull();
    expect(readSpeedup({ ...b200, bf16Ratio: null, fp8Ratio: null })).toBeNull();
    expect(readSpeedup({ ...b200, observedSpeedup: 2.5 })).toEqual({
      closest: 'compute',
      position: 'above',
      decisive: true,
    });
    expect(readSpeedup({ ...h200, observedSpeedup: 0.9 })).toEqual({
      closest: 'compute',
      position: 'below',
      decisive: true,
    });
  });
  it('nulls every ratio for hardware missing from the specs page and needs two hardware', () => {
    const rows = scalingVsSpec([
      { ...cell('h100', 1), hardwareKey: 'gb200', id: 'gb200:c1' },
      cell('b200', 1),
    ]);
    expect(rows).toEqual([
      {
        fromKey: 'gb200',
        toKey: 'b200',
        observedSpeedup: expect.closeTo(2.1468, 3),
        memoryBandwidthRatio: null,
        bf16Ratio: null,
        fp8Ratio: null,
      },
    ]);
    expect(readSpeedup(rows[0])).toBeNull();
    expect(scalingVsSpec([cell('h100', 1)])).toEqual([]);
    expect(scalingVsSpec([cell('h100', 1), { ...cell('h200', 1), p50: null }])).toEqual([]);
  });
});

describe('evidenceFacts', () => {
  it('reads the shared recipe, sample count and workload from the cells', () => {
    expect(evidenceFacts(points)).toEqual({
      participating: 4,
      tp: 2,
      ulysses: 2,
      samples: { min: 20, max: 20 },
      workload: '1344 × 768 · 8 s · 24 fps · 50 steps',
      attention: [],
    });
  });
  it('drops a fact the cells disagree on and lists attention backends only when they differ', () => {
    const b200 = cell('b200', 1);
    const h200 = cell('h200', 1);
    const facts = evidenceFacts([
      {
        ...b200,
        participating: 8,
        samples: 18,
        server: { tp: 4, ulysses: 2, attention: 'dynamic_cudnn_sdpa' },
      },
      { ...h200, server: { tp: 2, ulysses: 2, attention: 'fa' } },
      { ...cell('h100', 1), server: null, workload: '' },
    ]);
    expect(facts).toEqual({
      participating: null,
      tp: null,
      ulysses: 2,
      samples: { min: 18, max: 20 },
      workload: '1344 × 768 · 8 s · 24 fps · 50 steps',
      attention: expect.arrayContaining([
        { hardwareKey: 'b200', attention: 'dynamic_cudnn_sdpa' },
        { hardwareKey: 'h200', attention: 'fa' },
      ]),
    });
    expect(facts.attention).toHaveLength(2);
    expect(
      evidenceFacts([{ ...b200, server: { tp: 2, ulysses: 2, attention: 'fa' } }]).attention,
    ).toEqual([]);
    expect(evidenceFacts([])).toEqual({
      participating: null,
      tp: null,
      ulysses: null,
      samples: null,
      workload: null,
      attention: [],
    });
  });
});
