import { describe, expect, it } from 'vitest';

import {
  labelOpacityForActiveState,
  labelOpacityForHover,
} from '@/components/inference/ui/line-label-visibility';

describe('labelOpacityForActiveState', () => {
  const active = new Set(['b300_sglang', 'gb300_dynamo-sglang']);
  const precisions = ['fp4'];

  it('shows the kept line label for an active hardware type', () => {
    expect(
      labelOpacityForActiveState({ hwKey: 'b300_sglang', visible: '1' }, active, precisions),
    ).toBe(1);
  });

  it('keeps hidden duplicate line labels hidden even though their hw is active', () => {
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

describe('labelOpacityForActiveState with ?unofficialrun= overlays', () => {
  const official = new Set(['gb200_dynamo-sglang']);
  const precisions = ['fp8'];

  it('hides an overlay label when its overlay hardware row is off, even if the official row is on', () => {
    expect(
      labelOpacityForActiveState(
        {
          hwKey: 'gb200_dynamo-sglang',
          lineKey: 'overlay-gb200_dynamo-sglang_fp8_run1',
          visible: '1',
        },
        official,
        precisions,
        new Set(['gb300_dynamo-sglang']),
      ),
    ).toBe(0);
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
