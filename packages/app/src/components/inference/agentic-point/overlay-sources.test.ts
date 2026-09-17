import { describe, expect, it } from 'vitest';

import type { TraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';

import { availableOverlaySources, OVERLAY_SOURCES } from './overlay-sources';

const base: TraceServerMetrics = {
  meta: {} as TraceServerMetrics['meta'],
  startNs: 1_789_508_185_611_923_200,
  endNs: 1_789_512_197_546_315_776,
  durationS: 4011.9,
  timeslicesCount: 3,
  kvCacheUsage: [],
  prefixCacheHitRate: [],
  queueDepth: [],
  promptTokensBySource: {},
  prefillTps: [],
  decodeTps: [],
  prefixCacheHitsTps: [],
  hostKvCacheUsage: [],
  kvCacheUsageByEngine: [],
  kvCachePoolTokens: null,
  metricSources: [],
};

describe('availableOverlaySources', () => {
  it('returns nothing without metrics or when every series is empty', () => {
    expect(availableOverlaySources(null)).toEqual([]);
    expect(availableOverlaySources(base)).toEqual([]);
  });

  it('offers only non-empty series, in menu order', () => {
    const metrics: TraceServerMetrics = {
      ...base,
      queueDepth: [{ t: 0, running: 3, waiting: 2, total: 5 }],
      decodeTps: [{ t: 0, value: 1200 }],
    };
    expect(availableOverlaySources(metrics).map((s) => s.key)).toEqual(['decodeTps', 'queueDepth']);
  });

  it('converts ratios to percent and queue depth to the total', () => {
    const metrics: TraceServerMetrics = {
      ...base,
      kvCacheUsage: [{ t: 1, value: 0.42 }],
      hostKvCacheUsage: [{ t: 1, value: 0.05 }],
      prefixCacheHitRate: [{ t: 1, value: 1 }],
      queueDepth: [{ t: 1, running: 3, waiting: 2, total: 5 }],
    };
    const byKey = Object.fromEntries(OVERLAY_SOURCES.map((s) => [s.key, s.points(metrics)]));
    expect(byKey.kvCacheUsage).toEqual([{ t: 1, value: 42 }]);
    expect(byKey.hostKvCacheUsage[0]!.value).toBeCloseTo(5, 9);
    expect(byKey.prefixCacheHitRate).toEqual([{ t: 1, value: 100 }]);
    expect(byKey.queueDepth).toEqual([{ t: 1, value: 5 }]);
    expect(byKey.decodeTps).toEqual([]);
  });

  it('gives every source a distinct key and color', () => {
    expect(new Set(OVERLAY_SOURCES.map((s) => s.key)).size).toBe(OVERLAY_SOURCES.length);
    expect(new Set(OVERLAY_SOURCES.map((s) => s.color)).size).toBe(OVERLAY_SOURCES.length);
  });
});
