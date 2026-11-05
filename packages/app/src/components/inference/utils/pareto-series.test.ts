import { describe, expect, it } from 'vitest';
import { globalParetoFrontier } from './global-pareto';
import { frontierHardwareKeys } from './pareto-series';

describe('frontierHardwareKeys', () => {
  it('keeps all tied hardware series, not just the observation retained by the frontier', () => {
    const points = [
      { hwKey: 'h100', x: 20, y: 80 },
      { hwKey: 'b200', x: 80, y: 20 },
      { hwKey: 'mi355x', x: 80, y: 20 },
      { hwKey: 'h200', x: 10, y: 10 },
      { hwKey: 'h100', x: 5, y: 5 },
    ];
    expect(frontierHardwareKeys(points, globalParetoFrontier(points, true, true))).toEqual(
      new Set(['h100', 'b200', 'mi355x']),
    );
  });

  it('recomputes membership after an unofficial winner is dismissed', () => {
    const official = [{ hwKey: 'h100', x: 20, y: 80 }];
    const overlay = { hwKey: 'b200', x: 90, y: 90 };
    const all = [...official, overlay];
    expect(frontierHardwareKeys(all, globalParetoFrontier(all, true, true))).toEqual(
      new Set(['b200']),
    );
    expect(frontierHardwareKeys(official, globalParetoFrontier(official, true, true))).toEqual(
      new Set(['h100']),
    );
  });

  it('has no members without a frontier', () => {
    expect(frontierHardwareKeys([{ hwKey: 'h100', x: 1, y: 2 }], [])).toEqual(new Set());
  });
});
