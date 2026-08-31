import { describe, expect, it } from 'vitest';

import {
  RECONCILIATION_OK_PCT,
  RECONCILIATION_WARN_PCT,
  alignWindowToTrace,
  classifyDelta,
  integrateWindowPower,
  parseTimestampUtcMs,
} from './power-window';
import type { GpuMetricRow } from './types';

const BASE_UNIX = 1_755_000_000;

function row(overrides: Partial<GpuMetricRow> & { timestamp: string }): GpuMetricRow {
  return {
    index: 0,
    power: 400,
    temperature: 60,
    smClock: 1500,
    memClock: 2000,
    gpuUtil: 90,
    memUtil: 70,
    ...overrides,
  };
}

function gpuRows(
  gpuIndex: number,
  startOffsetS: number,
  endOffsetS: number,
  powerAt: (offsetS: number) => number,
  stepS = 1,
): GpuMetricRow[] {
  const rows: GpuMetricRow[] = [];
  for (let t = startOffsetS; t <= endOffsetS; t += stepS) {
    rows.push(row({ timestamp: String(BASE_UNIX + t), index: gpuIndex, power: powerAt(t) }));
  }
  return rows;
}

describe('parseTimestampUtcMs', () => {
  it('parses nvidia-smi naive timestamps as UTC regardless of viewer timezone', () => {
    expect(parseTimestampUtcMs('2025/01/15 12:34:56.789')).toBe(
      Date.UTC(2025, 0, 15, 12, 34, 56, 789),
    );
    expect(parseTimestampUtcMs('2025/01/15 12:34:56')).toBe(Date.UTC(2025, 0, 15, 12, 34, 56));
    // short fraction pads to milliseconds
    expect(parseTimestampUtcMs('2025/01/15 12:34:56.5')).toBe(
      Date.UTC(2025, 0, 15, 12, 34, 56, 500),
    );
  });

  it('parses naive ISO timestamps as UTC', () => {
    expect(parseTimestampUtcMs('2026-03-01T00:00:00')).toBe(Date.UTC(2026, 2, 1));
    expect(parseTimestampUtcMs('2026-03-01 00:00:00.250')).toBe(Date.UTC(2026, 2, 1, 0, 0, 0, 250));
  });

  it('parses TZ-suffixed ISO timestamps via Date', () => {
    expect(parseTimestampUtcMs('2026-03-01T00:00:00Z')).toBe(Date.UTC(2026, 2, 1));
    expect(parseTimestampUtcMs('2026-03-01T01:00:00+01:00')).toBe(Date.UTC(2026, 2, 1));
  });

  it('parses numeric epochs in seconds and milliseconds', () => {
    expect(parseTimestampUtcMs('1755000000')).toBe(1_755_000_000_000);
    expect(parseTimestampUtcMs('1755000000.5')).toBe(1_755_000_000_500);
    expect(parseTimestampUtcMs('1755000000123')).toBe(1_755_000_000_123);
  });

  it('returns null for formats whose UTC placement would be a guess', () => {
    expect(parseTimestampUtcMs('')).toBeNull();
    expect(parseTimestampUtcMs('N/A')).toBeNull();
    expect(parseTimestampUtcMs('Wed Mar 01 2026')).toBeNull();
  });
});

describe('alignWindowToTrace', () => {
  const trace = gpuRows(0, 0, 100, () => 400);

  it('places a window fully inside the trace', () => {
    const aligned = alignWindowToTrace(trace, {
      start_unix: BASE_UNIX + 20,
      end_unix: BASE_UNIX + 80,
    });
    expect(aligned).toEqual({
      startSeconds: 20,
      endSeconds: 80,
      clampedStart: false,
      clampedEnd: false,
    });
  });

  it('clamps and flags a window extending past the trace', () => {
    const aligned = alignWindowToTrace(trace, {
      start_unix: BASE_UNIX - 10,
      end_unix: BASE_UNIX + 120,
    });
    expect(aligned).toEqual({
      startSeconds: 0,
      endSeconds: 100,
      clampedStart: true,
      clampedEnd: true,
    });
  });

  it('returns null for a disjoint window (never a shifted guess)', () => {
    expect(
      alignWindowToTrace(trace, { start_unix: BASE_UNIX + 500, end_unix: BASE_UNIX + 600 }),
    ).toBeNull();
    expect(
      alignWindowToTrace(trace, { start_unix: BASE_UNIX - 600, end_unix: BASE_UNIX - 500 }),
    ).toBeNull();
  });

  it('returns null for an empty or unparseable trace and degenerate windows', () => {
    expect(alignWindowToTrace([], { start_unix: 0, end_unix: 1 })).toBeNull();
    expect(
      alignWindowToTrace([row({ timestamp: 'garbage' })], { start_unix: 0, end_unix: 1 }),
    ).toBeNull();
    expect(
      alignWindowToTrace(trace, { start_unix: BASE_UNIX + 50, end_unix: BASE_UNIX + 50 }),
    ).toBeNull();
  });
});

describe('integrateWindowPower', () => {
  it('recovers a constant power exactly', () => {
    const data = gpuRows(0, 0, 100, () => 400);
    const result = integrateWindowPower(data, {
      start_unix: BASE_UNIX + 20,
      end_unix: BASE_UNIX + 80,
    });
    expect(result).not.toBeNull();
    expect(result!.avgPowerPerGpuW).toBeCloseTo(400, 9);
    expect(result!.totalEnergyJ).toBeCloseTo(400 * 60, 9);
    expect(result!.gpuCount).toBe(1);
    expect(result!.partialCoverage).toBe(false);
  });

  it('matches the hand-computed trapezoid for a linear ramp', () => {
    // power(t) = 100 + 10t over t ∈ [0, 10]; ∫ from 2 to 8 = 900 J
    const data = gpuRows(0, 0, 10, (t) => 100 + 10 * t);
    const result = integrateWindowPower(data, {
      start_unix: BASE_UNIX + 2,
      end_unix: BASE_UNIX + 8,
    });
    expect(result!.totalEnergyJ).toBeCloseTo(900, 9);
    expect(result!.avgPowerPerGpuW).toBeCloseTo(150, 9);
  });

  it('interpolates linearly at both window boundaries', () => {
    // Only two samples: 100 W at t=0, 200 W at t=10. Window [2.5, 7.5]:
    // boundary powers 125/175, energy = 5 * 150 = 750 J.
    const data = [
      row({ timestamp: String(BASE_UNIX), power: 100 }),
      row({ timestamp: String(BASE_UNIX + 10), power: 200 }),
    ];
    const result = integrateWindowPower(data, {
      start_unix: BASE_UNIX + 2.5,
      end_unix: BASE_UNIX + 7.5,
    });
    expect(result!.totalEnergyJ).toBeCloseTo(750, 9);
    expect(result!.avgPowerPerGpuW).toBeCloseTo(150, 9);
    expect(result!.partialCoverage).toBe(false);
  });

  it('averages across GPUs with different sample cadences', () => {
    const data = [...gpuRows(0, 0, 100, () => 300, 1), ...gpuRows(1, 0, 100, () => 500, 2)];
    const result = integrateWindowPower(data, {
      start_unix: BASE_UNIX + 10,
      end_unix: BASE_UNIX + 90,
    });
    expect(result!.gpuCount).toBe(2);
    expect(result!.avgPowerPerGpuW).toBeCloseTo(400, 9);
  });

  it('clamps and flags a window not fully covered by the trace', () => {
    const data = gpuRows(0, 0, 50, () => 400);
    const result = integrateWindowPower(data, {
      start_unix: BASE_UNIX + 40,
      end_unix: BASE_UNIX + 60,
    });
    expect(result!.partialCoverage).toBe(true);
    expect(result!.avgPowerPerGpuW).toBeCloseTo(400, 9);
    expect(result!.totalEnergyJ).toBeCloseTo(400 * 10, 9);
  });

  it('returns null when no GPU has at least 2 overlapping samples', () => {
    expect(
      integrateWindowPower([row({ timestamp: String(BASE_UNIX + 30) })], {
        start_unix: BASE_UNIX + 20,
        end_unix: BASE_UNIX + 80,
      }),
    ).toBeNull();
    // Two samples but disjoint from the window
    expect(
      integrateWindowPower(
        gpuRows(0, 0, 10, () => 400),
        {
          start_unix: BASE_UNIX + 100,
          end_unix: BASE_UNIX + 200,
        },
      ),
    ).toBeNull();
  });
});

describe('classifyDelta', () => {
  it('classifies at the 2% and 5% boundaries (inclusive)', () => {
    expect(RECONCILIATION_OK_PCT).toBe(2);
    expect(RECONCILIATION_WARN_PCT).toBe(5);
    expect(classifyDelta(102, 100)).toEqual({ deltaPct: 2, level: 'ok' });
    expect(classifyDelta(98, 100)).toEqual({ deltaPct: -2, level: 'ok' });
    expect(classifyDelta(102.5, 100)).toEqual({ deltaPct: 2.5, level: 'warn' });
    expect(classifyDelta(105, 100)).toEqual({ deltaPct: 5, level: 'warn' });
    expect(classifyDelta(105.1, 100).level).toBe('alert');
    expect(classifyDelta(94, 100).level).toBe('alert');
  });

  it('handles a zero published value without dividing by zero', () => {
    expect(classifyDelta(0, 0)).toEqual({ deltaPct: 0, level: 'ok' });
    expect(classifyDelta(5, 0)).toEqual({ deltaPct: Infinity, level: 'alert' });
  });
});
