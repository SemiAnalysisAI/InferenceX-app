import { describe, expect, it } from 'vitest';

import { normalizeGpuData } from '@/components/gpu-specs/gpu-specs-radar-chart';
import { GPU_CHART_METRICS, GPU_SPECS } from '@/lib/gpu-specs';

const RADAR_METRICS = GPU_CHART_METRICS.filter(
  (m) => m.key !== 'scaleUpWorldSize' && m.key !== 'scaleOutBandwidth',
);

describe('normalizeGpuData', () => {
  it('returns normalized data for all GPUs', () => {
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    expect(result).toHaveLength(9);
  });

  it('each GPU entry has values array matching metrics count', () => {
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    for (const entry of result) {
      expect(entry.values).toHaveLength(RADAR_METRICS.length);
    }
  });

  it('normalized values are between 0 and 1 (inclusive) for non-null values', () => {
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    for (const entry of result) {
      for (const val of entry.values) {
        if (val !== null) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('the GPU with the highest value in a metric gets 1.0', () => {
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);

    // For each metric, at least one GPU should have a normalized value of 1.0
    for (let i = 0; i < RADAR_METRICS.length; i++) {
      const nonNullValues = result.map((r) => r.values[i]).filter((v): v is number => v !== null);
      if (nonNullValues.length > 0) {
        expect(Math.max(...nonNullValues)).toBeCloseTo(1.0, 5);
      }
    }
  });

  it('FP4 returns null for GPUs without FP4 support', () => {
    const fp4Idx = RADAR_METRICS.findIndex((m) => m.key === 'fp4');
    expect(fp4Idx).toBeGreaterThanOrEqual(0);

    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    const h100 = result.find((r) => r.gpu.name === 'H100 SXM');
    expect(h100).toBeDefined();
    expect(h100!.values[fp4Idx]).toBeNull();

    const h200 = result.find((r) => r.gpu.name === 'H200 SXM');
    expect(h200).toBeDefined();
    expect(h200!.values[fp4Idx]).toBeNull();
  });

  it('GB300 NVL72 has the highest FP4 value (normalized to 1.0)', () => {
    const fp4Idx = RADAR_METRICS.findIndex((m) => m.key === 'fp4');
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    const gb300 = result.find((r) => r.gpu.name === 'GB300 NVL72');
    expect(gb300).toBeDefined();
    expect(gb300!.values[fp4Idx]).toBeCloseTo(1.0, 5);
  });

  it('preserves correct GPU references', () => {
    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);
    const names = result.map((r) => r.gpu.name);
    expect(names).toContain('H100 SXM');
    expect(names).toContain('MI355X');
    expect(names).toContain('GB200 NVL72');
  });

  it('handles single GPU input correctly', () => {
    const singleGpu = [GPU_SPECS[0]]; // H100 SXM
    const result = normalizeGpuData(singleGpu, RADAR_METRICS);
    expect(result).toHaveLength(1);
    // With single GPU, non-null values normalize to value/max(value, 1)
    // Values >= 1 normalize to 1.0, values < 1 stay as-is (due to floor of 1)
    for (const val of result[0].values) {
      if (val !== null) {
        expect(val).toBeGreaterThan(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
    // FP8 for H100 is 1979, which is >> 1, so should normalize to 1.0
    const fp8Idx = RADAR_METRICS.findIndex((m) => m.key === 'fp8');
    expect(result[0].values[fp8Idx]).toBeCloseTo(1.0, 5);
  });

  it('handles empty GPU array', () => {
    const result = normalizeGpuData([], RADAR_METRICS);
    expect(result).toHaveLength(0);
  });

  it('memory metric is correctly normalized', () => {
    const memIdx = RADAR_METRICS.findIndex((m) => m.key === 'memory');
    expect(memIdx).toBeGreaterThanOrEqual(0);

    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);

    // H100 has 80 GB, which should be the smallest memory value
    const h100 = result.find((r) => r.gpu.name === 'H100 SXM');
    expect(h100).toBeDefined();
    expect(h100!.values[memIdx]).toBeGreaterThan(0);
    expect(h100!.values[memIdx]).toBeLessThan(1);

    // GB300 NVL72 has 288 GB (one of the highest)
    const gb300 = result.find((r) => r.gpu.name === 'GB300 NVL72');
    expect(gb300).toBeDefined();
    // MI355X also has 288 GB, so both should be 1.0
    expect(gb300!.values[memIdx]).toBeCloseTo(1.0, 5);
  });

  it('computes correct relative values for FP8', () => {
    const fp8Idx = RADAR_METRICS.findIndex((m) => m.key === 'fp8');
    expect(fp8Idx).toBeGreaterThanOrEqual(0);

    const result = normalizeGpuData(GPU_SPECS, RADAR_METRICS);

    // MI355X has fp8=5033 which is the actual max
    const mi355x = result.find((r) => r.gpu.name === 'MI355X');
    const h100 = result.find((r) => r.gpu.name === 'H100 SXM');
    expect(mi355x).toBeDefined();
    expect(h100).toBeDefined();

    // MI355X should be at 1.0 (the max)
    expect(mi355x!.values[fp8Idx]).toBeCloseTo(1.0, 5);
    // H100 should be proportionally lower: 1979/5033 ≈ 0.393
    expect(h100!.values[fp8Idx]!).toBeLessThan(0.5);
    expect(h100!.values[fp8Idx]!).toBeGreaterThan(0.3);
  });
});
