import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { resolveEffectivePrecisions } from '@/lib/benchmarks/default-precisions';
import { Sequence } from '@/lib/catalog/data-mappings';

import { resolveRowPrecisions } from './throughput-data';

function row(precision: string, isl = 8192, osl = 1024): BenchmarkRow {
  return { precision, isl, osl, benchmark_type: 'single_turn' } as BenchmarkRow;
}

describe('resolveRowPrecisions (calculator / fleet API parity with the dashboard)', () => {
  it('selects every precision the sequence carries when none is requested', () => {
    const rows = [row('fp8'), row('fp4'), row('fp8'), row('bf16', 1024, 1024)];
    const resolved = resolveRowPrecisions(rows, Sequence.EightK_OneK, []);

    expect(resolved).toEqual(['fp4', 'fp8']);
    expect(resolved).toEqual(
      resolveEffectivePrecisions({
        selectedPrecisions: [],
        availablePrecisions: ['fp4', 'fp8'],
        explicit: false,
      }),
    );
  });

  it('includes overlay-only precisions in the default', () => {
    expect(resolveRowPrecisions([row('fp8')], Sequence.EightK_OneK, [], [row('int4')])).toEqual([
      'fp8',
      'int4',
    ]);
  });

  it('honours an explicit request', () => {
    expect(resolveRowPrecisions([row('fp8'), row('fp4')], Sequence.EightK_OneK, ['fp8'])).toEqual([
      'fp8',
    ]);
  });

  it('falls back to fp4 when the sequence has no rows', () => {
    expect(resolveRowPrecisions([], Sequence.EightK_OneK, [])).toEqual(['fp4']);
  });
});
