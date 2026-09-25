import { describe, expect, it } from 'vitest';
import { buildCorrelationData, buildGroupedData, buildTelemetryData } from './chart-data';
import type { GpuMetricRow } from './types';

const rows: GpuMetricRow[] = [
  { timestamp: '2026-09-21T00:00:00Z', index: 0, power: 100 },
  { timestamp: '2026-09-21T00:00:02Z', index: 1, power: 200, temperature: 40 },
  { timestamp: '2026-09-21T00:00:03Z', index: 1, power: 250 },
  { timestamp: '2026-09-21T00:00:04Z', index: 1, power: 0, temperature: 0 },
];

describe('shared telemetry chart preparation', () => {
  it('keeps the whole-series time origin when a chip is hidden and skips missing readings', () => {
    const { t0Ms, groups } = buildTelemetryData(rows, new Set([1]), 'temperature');
    expect(t0Ms).toBe(Date.parse(rows[0].timestamp));
    expect(groups.get(1)?.map(({ seconds, ms, value }) => ({ seconds, ms, value }))).toEqual([
      { seconds: 2, ms: t0Ms + 2000, value: 40 },
      { seconds: 4, ms: t0Ms + 4000, value: 0 },
    ]);
    expect(groups.has(0)).toBe(false);
    expect(buildGroupedData(rows, new Set([1]), 'temperature').get(1)).toEqual([
      { seconds: 2, value: 40, gpuIndex: 1, raw: rows[1] },
      { seconds: 4, value: 0, gpuIndex: 1, raw: rows[3] },
    ]);
  });

  it('omits unsampled correlation metrics while retaining measured zeros', () => {
    expect(buildCorrelationData(rows, new Set([0, 1]), 'power', 'temperature')).toEqual([
      { x: 200, y: 40, gpuIndex: 1, raw: rows[1] },
      { x: 0, y: 0, gpuIndex: 1, raw: rows[3] },
    ]);
  });
});
