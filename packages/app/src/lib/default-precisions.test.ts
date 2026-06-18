import { describe, expect, it } from 'vitest';

import {
  MIN_SOLE_DEFAULT_CURVES,
  countCurvesByPrecision,
  pickDefaultPrecisions,
  resolveEffectivePrecisions,
} from './default-precisions';

function row(precision: string, hardware: string, framework = 'vllm', disagg = false) {
  return { precision, hardware, framework, spec_method: 'none', disagg };
}

describe('countCurvesByPrecision', () => {
  it('counts distinct (hardware, framework, spec_method, disagg) per precision', () => {
    const counts = countCurvesByPrecision([
      row('fp8', 'b200'),
      row('fp8', 'b300'),
      row('fp8', 'b200'), // dup curve, not counted again
      row('fp4', 'mi355x', 'atom'),
    ]);
    expect(counts).toEqual({ fp8: 2, fp4: 1 });
  });

  it('treats disagg and non-disagg of the same hw as distinct curves', () => {
    const counts = countCurvesByPrecision([
      row('fp8', 'b200', 'vllm', false),
      row('fp8', 'b200', 'vllm', true),
    ]);
    expect(counts).toEqual({ fp8: 2 });
  });

  it('returns {} for no rows', () => {
    expect(countCurvesByPrecision([])).toEqual({});
  });
});

describe('pickDefaultPrecisions', () => {
  it('picks the single densest precision only when every precision clears the threshold', () => {
    // dsr1 shape: both dense.
    expect(pickDefaultPrecisions({ fp4: 23, fp8: 38 })).toEqual(['fp8']);
  });

  it('shows both when one precision is below the threshold (MiniMax M3 shape)', () => {
    // fp4 barren (1 curve) next to a dense fp8 → surface both, not just fp8.
    expect(pickDefaultPrecisions({ fp4: 1, fp8: 14 })).toEqual(['fp4', 'fp8']);
  });

  it('keeps fp4 when it is the densest and both clear the threshold (dsv4 shape)', () => {
    expect(pickDefaultPrecisions({ fp4: 28, fp8: 5 })).toEqual(['fp4']);
  });

  it('breaks ties in favor of fp4 when both clear the threshold', () => {
    expect(pickDefaultPrecisions({ fp4: 8, fp8: 8 })).toEqual(['fp4']);
  });

  it('breaks non-fp4 ties by canonical enum order', () => {
    // fp8 precedes bf16 in PRECISION_OPTIONS.
    expect(pickDefaultPrecisions({ bf16: 6, fp8: 6 })).toEqual(['fp8']);
  });

  it('surfaces all precisions (sorted) when any is below threshold', () => {
    expect(pickDefaultPrecisions({ fp8: 3, fp4: 2 })).toEqual(['fp4', 'fp8']);
    // llama70b shape: fp4 sparse (3), fp8 dense (8) → both.
    expect(pickDefaultPrecisions({ fp4: 3, fp8: 8 })).toEqual(['fp4', 'fp8']);
    expect(MIN_SOLE_DEFAULT_CURVES).toBe(4);
  });

  it('returns the lone precision for a single-precision model regardless of count', () => {
    expect(pickDefaultPrecisions({ fp4: 2 })).toEqual(['fp4']);
    expect(pickDefaultPrecisions({ fp4: 10 })).toEqual(['fp4']);
  });

  it('returns [] when there are no precisions', () => {
    expect(pickDefaultPrecisions({})).toEqual([]);
  });
});

describe('resolveEffectivePrecisions', () => {
  const M3_COUNTS = { fp4: 1, fp8: 14 };
  const M3_AVAIL = ['fp4', 'fp8'];

  it('auto-defaults to both when one precision is sparse (M3 → fp4 + fp8)', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: M3_AVAIL,
        curveCounts: M3_COUNTS,
        explicit: false,
      }),
    ).toEqual(['fp4', 'fp8']);
  });

  it('auto-defaults to the densest precision when every precision is dense (dsr1 → fp8)', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp4', 'fp8'],
        curveCounts: { fp4: 23, fp8: 38 },
        explicit: false,
      }),
    ).toEqual(['fp8']);
  });

  it('leaves an unchanged model on fp4 when fp4 is densest and both are dense', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp4', 'fp8'],
        curveCounts: { fp4: 28, fp8: 5 },
        explicit: false,
      }),
    ).toEqual(['fp4']);
  });

  it('honors an explicit selection even when it is the sparse precision', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: M3_AVAIL,
        curveCounts: M3_COUNTS,
        explicit: true,
      }),
    ).toEqual(['fp4']);
  });

  it('honors an explicit multi-precision selection (e.g. a preset)', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4', 'fp8'],
        availablePrecisions: M3_AVAIL,
        curveCounts: M3_COUNTS,
        explicit: true,
      }),
    ).toEqual(['fp4', 'fp8']);
  });

  it('drops explicitly-selected precisions that are unavailable, falling back to first available', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp8'],
        availablePrecisions: ['fp4'],
        curveCounts: { fp4: 10 },
        explicit: true,
      }),
    ).toEqual(['fp4']);
  });

  it('includes a loaded unofficial run precision so the overlay is visible by default', () => {
    // Both official precisions dense → base is the sole densest (fp8); the user
    // opened an fp4 unofficial run, so fp4 must be merged in.
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp4', 'fp8'],
        curveCounts: { fp4: 23, fp8: 38 },
        unofficialPrecisions: ['fp4'],
        explicit: false,
      }),
    ).toEqual(['fp4', 'fp8']);
  });

  it('ignores unofficial precisions that have no available data', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp4', 'fp8'],
        curveCounts: { fp4: 23, fp8: 38 },
        unofficialPrecisions: ['int4'],
        explicit: false,
      }),
    ).toEqual(['fp8']);
  });

  it('falls back to the first available precision when curve data is missing (still loading)', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp4'],
        curveCounts: {},
        explicit: false,
      }),
    ).toEqual(['fp4']);
  });
});
