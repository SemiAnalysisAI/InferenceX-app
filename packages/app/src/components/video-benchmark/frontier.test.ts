import { describe, expect, it } from 'vitest';
import { paretoFrontier } from './frontier';

const b200 = { id: 'b200', x: 78.3, y: 6.66 };
const h200 = { id: 'h200', x: 151.1, y: 4.9 };
const h100 = { id: 'h100', x: 168.1, y: 4.59 };

describe('paretoFrontier', () => {
  it('keeps only the dominating point when one hardware is faster and more efficient', () => {
    expect(paretoFrontier([h100, h200, b200], 'lower', 'higher').map((p) => p.id)).toEqual([
      'b200',
    ]);
  });
  it('keeps a slower but more efficient point on a lower/higher frontier, sorted by x', () => {
    const cheapSlow = { id: 'slow', x: 400, y: 9 };
    expect(
      paretoFrontier([cheapSlow, h100, h200, b200], 'lower', 'higher').map((p) => p.id),
    ).toEqual(['b200', 'slow']);
  });
  it('handles higher/higher (generation speed vs efficiency)', () => {
    const fast = { id: 'fast', x: 2.46, y: 6.66 };
    const mid = { id: 'mid', x: 1.27, y: 4.9 };
    const midEfficient = { id: 'midEff', x: 1.2, y: 7 };
    expect(paretoFrontier([fast, mid, midEfficient], 'higher', 'higher').map((p) => p.id)).toEqual([
      'midEff',
      'fast',
    ]);
  });
  it('handles lower/lower (time to video vs $/video)', () => {
    const cost = [
      { id: 'b200', x: 78.3, y: 0.15 },
      { id: 'h200', x: 151.1, y: 0.204 },
      { id: 'cheap', x: 300, y: 0.1 },
    ];
    expect(paretoFrontier(cost, 'lower', 'lower').map((p) => p.id)).toEqual(['b200', 'cheap']);
  });
  it('returns an empty frontier for no points', () => {
    expect(paretoFrontier([], 'lower', 'higher')).toEqual([]);
  });
});
