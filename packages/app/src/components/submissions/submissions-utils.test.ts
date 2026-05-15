import { describe, expect, it } from 'vitest';

import type { SubmissionVolumeRow, SubmissionSummaryRow } from '@/lib/submissions-types';

import {
  computeCumulative,
  computePreviousImages,
  computeTotalStats,
  getVendor,
  groupVolumeByWeek,
  isNonNvidia,
  submissionRowKey,
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
      is_multinode: false,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
      prefill_tp: 4,
      prefill_ep: 1,
      decode_tp: 4,
      decode_ep: 1,
      date: '2026-01-10',
      total_datapoints: 100,
      distinct_sequences: 3,
      distinct_concurrencies: 10,
      max_concurrency: 30,
      image: null,
    },
    {
      model: 'dsr1',
      hardware: 'mi355x',
      framework: 'sglang',
      precision: 'fp4',
      spec_method: 'none',
      disagg: false,
      is_multinode: false,
      num_prefill_gpu: 8,
      num_decode_gpu: 8,
      prefill_tp: 8,
      prefill_ep: 1,
      decode_tp: 8,
      decode_ep: 1,
      date: '2026-01-05',
      total_datapoints: 50,
      distinct_sequences: 2,
      distinct_concurrencies: 5,
      max_concurrency: 15,
      image: null,
    },
  ];

  it('computes correct totals', () => {
    const stats = computeTotalStats(summary);
    expect(stats.totalDatapoints).toBe(150);
    expect(stats.totalConfigs).toBe(2);
    expect(stats.uniqueModels).toBe(1);
    expect(stats.uniqueGpus).toBe(2);
  });
});

describe('computePreviousImages', () => {
  const base: Omit<SubmissionSummaryRow, 'date' | 'image'> = {
    model: 'dsr1',
    hardware: 'h200',
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    prefill_tp: 8,
    prefill_ep: 1,
    decode_tp: 8,
    decode_ep: 1,
    total_datapoints: 10,
    distinct_sequences: 2,
    distinct_concurrencies: 5,
    max_concurrency: 64,
  };

  it('flags the row where the image changed, not the steady-state rows', () => {
    const oldImg = 'lmsysorg/sglang:v0.5.9-cu130';
    const newImg = 'lmsysorg/sglang:v0.5.11-cu130';
    const rows: SubmissionSummaryRow[] = [
      { ...base, date: '2026-05-10', image: oldImg },
      { ...base, date: '2026-05-11', image: oldImg },
      { ...base, date: '2026-05-12', image: newImg }, // bump day
      { ...base, date: '2026-05-13', image: newImg },
    ];
    const map = computePreviousImages(rows);
    expect(map.size).toBe(1);
    expect(map.get(submissionRowKey(rows[2]))).toBe(oldImg);
  });

  it('does not cross config boundaries', () => {
    const rows: SubmissionSummaryRow[] = [
      { ...base, hardware: 'h200', date: '2026-05-10', image: 'img-a' },
      { ...base, hardware: 'b300', date: '2026-05-11', image: 'img-b' },
    ];
    expect(computePreviousImages(rows).size).toBe(0);
  });

  it('ignores rows missing image data', () => {
    const rows: SubmissionSummaryRow[] = [
      { ...base, date: '2026-05-10', image: null },
      { ...base, date: '2026-05-11', image: 'img-new' },
    ];
    expect(computePreviousImages(rows).size).toBe(0);
  });

  it('returns empty for a single-row config', () => {
    const rows: SubmissionSummaryRow[] = [{ ...base, date: '2026-05-10', image: 'img-a' }];
    expect(computePreviousImages(rows).size).toBe(0);
  });
});
