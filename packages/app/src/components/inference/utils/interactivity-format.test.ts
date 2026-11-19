import { describe, expect, it } from 'vitest';

import { formatInteractivity, interactivityAxisTicks } from './interactivity-format';

describe('formatInteractivity', () => {
  it('keeps one decimal under 10 tok/s/user and whole numbers from 10 up', () => {
    expect(formatInteractivity(2.37)).toBe('2.4');
    expect(formatInteractivity(2.6)).toBe('2.6');
    expect(formatInteractivity(9.94)).toBe('9.9');
    expect(formatInteractivity(12.4)).toBe('12');
    expect(formatInteractivity(1234.5)).toBe('1,235');
  });
});

const labels = (values: number[], width: number) =>
  interactivityAxisTicks(values, width).map((tick) => tick.label);

describe('interactivityAxisTicks', () => {
  const sweep = [2.06, 2.08, 2.4, 2.66, 2.99, 3.06, 3.32, 4.75, 5.11, 5.16];

  it('labels a single-digit sweep with distinct one-decimal values', () => {
    // Wide plot: every slot has room, and only 2.08 (also "2.1") goes unlabelled.
    expect(labels(sweep, 600)).toEqual([
      '2.1',
      '2.4',
      '2.7',
      '3.0',
      '3.1',
      '3.3',
      '4.8',
      '5.1',
      '5.2',
    ]);
  });

  it('thins ticks on a phone-width plot so labels never crowd', () => {
    const ticks = interactivityAxisTicks(sweep, 240);
    expect(ticks.map((tick) => tick.index)).toEqual([0, 2, 4, 6, 8]);
    expect(ticks.map((tick) => tick.label)).toEqual(['2.1', '2.4', '3.0', '3.3', '5.1']);
    expect(new Set(ticks.map((tick) => tick.label)).size).toBe(ticks.length);
  });

  it('adds a decimal past 10 tok/s/user only when whole numbers would repeat', () => {
    expect(labels([25, 42, 60, 93, 118, 219], 600)).toEqual(['25', '42', '60', '93', '118', '219']);
    expect(labels([12.2, 12.4, 30, 60], 600)).toEqual(['12.2', '12.4', '30.0', '60.0']);
    // A sweep across 10 keeps each side's own precision.
    expect(labels([5.2, 8.46, 12, 60], 600)).toEqual(['5.2', '8.5', '12', '60']);
  });

  it('drops a slot that reads like its neighbour at the finest precision', () => {
    expect(labels([3.01, 3.02, 4.5], 600)).toEqual(['3.0', '4.5']);
  });

  it('returns nothing for an empty series', () => {
    expect(interactivityAxisTicks([], 300)).toEqual([]);
  });
});
