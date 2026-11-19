import { describe, expect, it } from 'vitest';

import type { AvailabilityRow } from '@/lib/api/api';

import { indexAvailability } from './availability-index';
import { compactAvailability } from './compact-availability';
import { summarizeModelHistory } from './model-history-summary';

const row = (model: string, date: string, hardware = 'h200'): AvailabilityRow =>
  ({
    model,
    isl: 8192,
    osl: 1024,
    precision: 'fp8',
    hardware,
    framework: 'trt',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date,
  }) as AvailabilityRow;

describe('summarizeModelHistory', () => {
  it('reports benchmark days, calendar span and vendors per display model', () => {
    const rows = [
      row('dsr1', '2026-01-01'),
      row('dsr1', '2026-01-01', 'mi355x'),
      row('dsr1', '2026-01-10', 'b200'),
      row('gptoss120b', '2026-01-02'),
    ];
    const summary = summarizeModelHistory(indexAvailability(compactAvailability(rows)), [
      'DeepSeek-R1-0528',
      'gpt-oss-120b',
      'Unknown',
    ]);
    expect(summary.get('DeepSeek-R1-0528')).toEqual({
      snapshotDays: 2,
      spanDays: 10,
      firstDate: '2026-01-01',
      lastDate: '2026-01-10',
      vendors: ['NVIDIA', 'AMD'],
    });
    expect(summary.get('gpt-oss-120b')).toMatchObject({ snapshotDays: 1, spanDays: 1 });
    expect(summary.get('Unknown')).toMatchObject({ snapshotDays: 0, spanDays: 0, vendors: [] });
  });
});
