import { describe, expect, it } from 'vitest';

import {
  labelOpacityForActiveState,
  labelOpacityForHover,
} from '@/components/inference/ui/line-label-visibility';

// Regression coverage for GH #470: when one hardware type contributes several
// curves (e.g. b300_sglang_fp4 / _fp8 / _bf16) the render keeps a single line
// label ("B300 (SGLang)") and hides the rest via `data-visible="0"`. Every
// duplicate shares the same `data-hw-key`, so the visibility-sync paths must
// honour `data-visible` or they re-show the hidden duplicates.

describe('labelOpacityForActiveState', () => {
  const active = new Set(['b300_sglang', 'gb300_dynamo-sglang']);
  const precisions = ['fp4'];

  it('shows the kept line label for an active hardware type', () => {
    expect(
      labelOpacityForActiveState({ hwKey: 'b300_sglang', visible: '1' }, active, precisions),
    ).toBe(1);
  });

  it('keeps hidden duplicate line labels hidden even though their hw is active', () => {
    // The fp8 / bf16 B300 curves: same data-hw-key as the visible fp4 label,
    // but the render hid them. They must NOT be re-shown (the #470 bug).
    expect(
      labelOpacityForActiveState({ hwKey: 'b300_sglang', visible: '0' }, active, precisions),
    ).toBe(0);
  });

  it('hides line labels for inactive hardware types', () => {
    expect(
      labelOpacityForActiveState({ hwKey: 'h100_sglang', visible: '1' }, active, precisions),
    ).toBe(0);
  });

  it('treats a missing data-visible attribute as kept (parallelism labels)', () => {
    // Parallelism labels carry a precision and no data-visible gate.
    expect(
      labelOpacityForActiveState({ hwKey: 'b300_sglang', precision: 'fp4' }, active, precisions),
    ).toBe(1);
  });

  it('hides parallelism labels whose precision is not selected', () => {
    expect(
      labelOpacityForActiveState({ hwKey: 'b300_sglang', precision: 'fp8' }, active, precisions),
    ).toBe(0);
  });

  it('returns 0 when there is no hardware key', () => {
    expect(labelOpacityForActiveState({}, active, precisions)).toBe(0);
  });
});

describe('labelOpacityForHover', () => {
  it('lights up the kept label for the hovered hardware', () => {
    expect(labelOpacityForHover({ hwKey: 'b300_sglang', visible: '1' }, 'b300_sglang')).toBe(1);
  });

  it('does not re-show a hidden duplicate when its hardware is hovered', () => {
    expect(labelOpacityForHover({ hwKey: 'b300_sglang', visible: '0' }, 'b300_sglang')).toBe(0);
  });

  it('hides labels for non-hovered hardware', () => {
    expect(labelOpacityForHover({ hwKey: 'h100_sglang', visible: '1' }, 'b300_sglang')).toBe(0);
  });

  it('returns 0 when there is no hardware key', () => {
    expect(labelOpacityForHover({}, 'b300_sglang')).toBe(0);
  });
});
