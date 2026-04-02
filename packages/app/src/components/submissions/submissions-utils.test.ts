import { describe, expect, it } from 'vitest';

import type { SubmissionVolumeRow, SubmissionSummaryRow } from '@/lib/submissions-types';

import {
  computeCumulative,
  computeTotalStats,
  getVendor,
  groupVolumeByWeek,
  isNonNvidia,
} from './submissions-utils';

describe('getVendor', () => {
  it('returns NVIDIA for NVIDIA GPUs', () => {
    expect(getVendor('h100')).toBe('NVIDIA');
    expect(getVendor('b200')).toBe('NVIDIA');
  });

  it('returns AMD for AMD GPUs', () => {
    expect(getVendor('mi300x')).toBe('AMD');
    expect(getVendor('mi355x')).toBe('AMD');
  });

  it('returns Unknown for unrecognized hardware', () => {
    expect(getVendor('tpu-v5')).toBe('Unknown');
  });
});

describe('isNonNvidia', () => {
  it('returns false for NVIDIA GPUs', () => {
    expect(isNonNvidia('h200')).toBe(false);
  });

  it('returns true for AMD GPUs', () => {
    expect(isNonNvidia('mi355x')).toBe(true);
  });
});

describe('groupVolumeByWeek', () => {
  const volume: SubmissionVolumeRow[] = [
    { date: '2026-01-05', hardware: 'h100', datapoints: 10 }, // Monday
    { date: '2026-01-06', hardware: 'mi300x', datapoints: 5 }, // Tuesday same week
    { date: '2026-01-12', hardware: 'h100', datapoints: 20 }, // Next Monday
  ];

  it('groups by ISO week', () => {
    const result = groupVolumeByWeek(volume);
    expect(result).toHaveLength(2);
    expect(result[0].week).toBe('2026-01-05');
    expect(result[0].nvidia).toBe(10);
    expect(result[0].nonNvidia).toBe(5);
    expect(result[0].total).toBe(15);
    expect(result[1].week).toBe('2026-01-12');
    expect(result[1].total).toBe(20);
  });

  it('returns empty for empty input', () => {
    expect(groupVolumeByWeek([])).toEqual([]);
  });
});

describe('computeCumulative', () => {
  const volume: SubmissionVolumeRow[] = [
    { date: '2026-01-01', hardware: 'h100', datapoints: 10 },
    { date: '2026-01-01', hardware: 'mi300x', datapoints: 5 },
    { date: '2026-01-02', hardware: 'h100', datapoints: 20 },
  ];

  it('computes running totals', () => {
    const result = computeCumulative(volume);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-01-01', nvidia: 10, nonNvidia: 5, total: 15 });
    expect(result[1]).toEqual({ date: '2026-01-02', nvidia: 30, nonNvidia: 5, total: 35 });
  });

  it('returns empty for empty input', () => {
    expect(computeCumulative([])).toEqual([]);
  });
});

describe('computeTotalStats', () => {
  const summary: SubmissionSummaryRow[] = [
    {
      model: 'dsr1',
      hardware: 'h100',
      framework: 'vllm',
      precision: 'fp8',
      spec_method: 'none',
      disagg: false,
      first_date: '2026-01-01',
      latest_date: '2026-01-10',
      run_days: 10,
      total_datapoints: 100,
    },
    {
      model: 'dsr1',
      hardware: 'mi355x',
      framework: 'sglang',
      precision: 'fp4',
      spec_method: 'none',
      disagg: false,
      first_date: '2026-01-05',
      latest_date: '2026-01-10',
      run_days: 5,
      total_datapoints: 50,
    },
  ];

  it('computes correct totals', () => {
    const stats = computeTotalStats(summary);
    expect(stats.totalDatapoints).toBe(150);
    expect(stats.totalConfigs).toBe(2);
    expect(stats.nvidiaDatapoints).toBe(100);
    expect(stats.nonNvidiaDatapoints).toBe(50);
  });
});
