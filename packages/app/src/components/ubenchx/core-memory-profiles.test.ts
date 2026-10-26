import { describe, expect, it } from 'vitest';
import { summarizeCoreProfile } from './core-memory-profiles';

describe('core profile pair statistics', () => {
  it('averages unique off-diagonal pairs in their decoded groups', () => {
    const result = summarizeCoreProfile(
      [
        [0, 2, 8],
        [2, 0, 10],
        [8, 10, 0],
      ],
      ['A', 'A', 'B'],
    );
    expect(result).toEqual({ withinDieGroupMean: 2, betweenDieGroupMean: 9 });
  });
  it('rejects malformed, asymmetric and nonfinite measurements', () => {
    expect(() => summarizeCoreProfile([[0, 2]], ['A'])).toThrow('dimensions');
    expect(() =>
      summarizeCoreProfile(
        [
          [0, 2],
          [3, 0],
        ],
        ['A', 'B'],
      ),
    ).toThrow('symmetric');
    expect(() =>
      summarizeCoreProfile(
        [
          [0, NaN],
          [NaN, 0],
        ],
        ['A', 'B'],
      ),
    ).toThrow('Invalid');
  });
});

it('preserves an absent pair class instead of inventing a zero measurement', () => {
  expect(
    summarizeCoreProfile(
      [
        [0, 8],
        [8, 0],
      ],
      ['A', 'B'],
    ),
  ).toEqual({ withinDieGroupMean: null, betweenDieGroupMean: 8 });
});
