import { describe, expect, it } from 'vitest';
import { paretoFrontier } from './frontier';
import fixture from './deployment-frontier.fixture.json';

const b200 = { id: 'b200', x: 78.3, y: 6.66 };

describe('paretoFrontier', () => {
  it('returns an empty frontier for no points', () => {
    expect(paretoFrontier([], 'lower', 'higher')).toEqual([]);
  });
  it('ignores nonfinite axes rather than allowing them to dominate measurements', () => {
    const missing = [
      { id: 'nan', x: Number.NaN, y: 10 },
      { id: 'infinite', x: 1, y: Infinity },
    ];
    expect(paretoFrontier([...missing, b200], 'lower', 'higher')).toEqual([b200]);
  });
});

// The same synthetic cases are consumed by Backend #2916's offline reader.
describe('shared backend dominance cases', () => {
  it.each(fixture.cases)('$name', ({ points, xBetter, yBetter, expected }) => {
    if (
      (xBetter !== 'lower' && xBetter !== 'higher') ||
      (yBetter !== 'lower' && yBetter !== 'higher')
    )
      throw new Error('Invalid fixture direction');
    expect(paretoFrontier(points, xBetter, yBetter).map((point) => point.id)).toEqual(expected);
  });
});
