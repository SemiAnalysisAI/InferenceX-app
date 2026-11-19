import { describe, expect, it } from 'vitest';
import {
  CORE_PROFILE_GPU_KEYS,
  coreMemoryProfileResults,
  summarizeCoreProfile,
} from './core-memory-profiles';

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

it('filters the unified collection without inventing absent measurements', () => {
  expect(coreMemoryProfileResults('H100 SXM')).toEqual([]);
  expect(coreMemoryProfileResults('Ascend 950PR_9579')).toHaveLength(1);
  const all = coreMemoryProfileResults();
  expect(all.map((run) => run.gpu)).toEqual(['Ascend 950PR_9579', 'B200 SXM']);
  expect(CORE_PROFILE_GPU_KEYS).toEqual(all.map((run) => run.gpu));
  expect(coreMemoryProfileResults('B200 SXM')).toEqual([all[1]]);
  expect(coreMemoryProfileResults('Ascend 950PR_9579')).toEqual([all[0]]);
});
