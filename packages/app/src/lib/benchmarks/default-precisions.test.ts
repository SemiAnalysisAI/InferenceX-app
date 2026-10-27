import { describe, expect, it } from 'vitest';

import { resolveEffectivePrecisions, sortPrecisions } from './default-precisions';

describe('sortPrecisions', () => {
  it('orders fp4 first, then the PRECISION_OPTIONS order, unknown keys last', () => {
    expect(sortPrecisions(['bf16', 'mystery', 'fp8', 'fp4', 'fp8'])).toEqual([
      'fp4',
      'fp8',
      'bf16',
      'mystery',
    ]);
  });
});

describe('resolveEffectivePrecisions (default: every available precision)', () => {
  it('selects every available precision when nothing is explicit (dsr1 fp4 + fp8)', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp8', 'fp4'],
        explicit: false,
      }),
    ).toEqual(['fp4', 'fp8']);
  });

  it('includes overlay-only precisions already folded into the available set', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['bf16', 'fp4', 'fp8', 'int4'],
        explicit: false,
      }),
    ).toEqual(['fp4', 'fp8', 'bf16', 'int4']);
  });

  it('returns the single available precision for single-precision models', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: ['fp8'],
        explicit: false,
      }),
    ).toEqual(['fp8']);
  });

  it('keeps the stored selection while availability is still loading', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp4'],
        availablePrecisions: [],
        explicit: false,
      }),
    ).toEqual(['fp4']);
  });
});

describe('resolveEffectivePrecisions (explicit selection is unchanged)', () => {
  it('honours an explicit single precision even when more are available', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp8'],
        availablePrecisions: ['fp4', 'fp8'],
        explicit: true,
      }),
    ).toEqual(['fp8']);
  });

  it('honours an explicit multi-select in the order given', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp8', 'fp4'],
        availablePrecisions: ['fp4', 'fp8', 'bf16'],
        explicit: true,
      }),
    ).toEqual(['fp8', 'fp4']);
  });

  it('drops explicit precisions the scenario lacks', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['fp8', 'int4'],
        availablePrecisions: ['fp4', 'fp8'],
        explicit: true,
      }),
    ).toEqual(['fp8']);
  });

  it('falls back to the first available precision when no explicit precision is available', () => {
    expect(
      resolveEffectivePrecisions({
        selectedPrecisions: ['int4'],
        availablePrecisions: ['fp8', 'fp4'],
        explicit: true,
      }),
    ).toEqual(['fp8']);
  });
});
