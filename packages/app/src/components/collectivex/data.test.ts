import { describe, expect, it } from 'vitest';

import {
  chartPoints,
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  metricValue,
  seriesMatchesSelection,
  type CollectiveXSeriesSelection,
} from './data';
import { makeCollectiveXDataset, makeCollectiveXSeries } from './test-fixture';

const dataset = makeCollectiveXDataset();
// series[0]: deepep-v2 EP8 scale-up (nvlink, single node).
// series[1]: MoRI EP16 scale-out (xGMI scale-up + RDMA scale-out, two nodes).
const [scaleUp, scaleOut] = dataset.series;

describe('collectiveXTopologyLabel', () => {
  it('shows only the scale-up transport when there is no scale-out fabric', () => {
    expect(collectiveXTopologyLabel(scaleUp.system)).toBe(
      '1x8 · domain 8 · nvlink · h200-nvlink-island',
    );
  });

  it('joins scale-up and scale-out transports when a scale-out fabric is present', () => {
    expect(collectiveXTopologyLabel(scaleOut.system)).toBe(
      '2x8 · domain 8 · xgmi+rdma · mi355x-xgmi-rdma',
    );
  });
});

describe('collectiveXSeriesLabel', () => {
  it('renders the varying identity axes of a series', () => {
    expect(collectiveXSeriesLabel(scaleUp)).toBe(
      'H200-DGXC · deepep-v2 · EP8 · normal · decode · bf16',
    );
  });

  it('distinguishes the dispatch precision', () => {
    expect(collectiveXSeriesLabel(makeCollectiveXSeries({ precision: 'fp8' }))).toBe(
      'H200-DGXC · deepep-v2 · EP8 · normal · decode · fp8',
    );
  });

  it('shows the selected EP degree, mode, and phase', () => {
    expect(collectiveXSeriesLabel(scaleOut)).toContain('EP16 · normal · decode');
  });
});

describe('collectiveXColorKey', () => {
  it('assigns the same key to two series with identical configuration', () => {
    const a = makeCollectiveXSeries({ variant: 'a' });
    const b = makeCollectiveXSeries({ variant: 'b' });
    // The color key is configuration-derived and excludes the series id.
    expect(collectiveXColorKey(a)).toBe(collectiveXColorKey(b));
  });

  it('assigns distinct keys to series differing in EP degree', () => {
    const a = makeCollectiveXSeries({ ep: 8 });
    const b = makeCollectiveXSeries({ ep: 16 });
    expect(collectiveXColorKey(a)).not.toBe(collectiveXColorKey(b));
  });

  it('assigns distinct keys to bf16 and fp8 series of one configuration', () => {
    const bf16 = makeCollectiveXSeries();
    const fp8 = makeCollectiveXSeries({ precision: 'fp8' });
    expect(collectiveXColorKey(bf16)).not.toBe(collectiveXColorKey(fp8));
  });

  it('assigns distinct keys to normal and low-latency series of one configuration', () => {
    const normal = makeCollectiveXSeries();
    const lowLatency = makeCollectiveXSeries({ mode: 'low-latency' });
    expect(collectiveXColorKey(normal)).not.toBe(collectiveXColorKey(lowLatency));
  });

  it('leads with the system vendor so getVendor places series in vendor hue zones', () => {
    // The chart color system reads the first "_"-separated token to classify the
    // vendor (NVIDIA greens, AMD reds), matching the InferenceX charts.
    expect(collectiveXColorKey(scaleUp).split('_')[0]).toBe('nvidia');
    const amd = makeCollectiveXSeries({ sku: 'mi355x', vendor: 'amd' });
    expect(collectiveXColorKey(amd).split('_')[0]).toBe('amd');
  });
});

describe('seriesMatchesSelection', () => {
  const base: CollectiveXSeriesSelection = {
    epSize: 8,
    phase: 'decode',
    mode: 'normal',
    precision: 'bf16',
  };

  it('matches on EP size, phase, mode, and precision', () => {
    expect(seriesMatchesSelection(scaleUp, base)).toBe(true);
  });

  it('rejects a series whose EP, phase, mode, or precision differs from the selection', () => {
    expect(seriesMatchesSelection(scaleUp, { ...base, epSize: 16 })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, phase: 'prefill' })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, mode: 'low-latency' })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, precision: 'fp8' })).toBe(false);
  });
});

describe('metricValue', () => {
  const point = scaleUp.points[0];

  it('returns the latency percentile for the requested component', () => {
    expect(metricValue(point, 'dispatch', 'p50', 'latency')).toBe(
      point.components.dispatch?.latency_us.p50,
    );
  });

  it('returns the roundtrip token rate only for the roundtrip operation', () => {
    expect(metricValue(point, 'roundtrip', 'p50', 'tokens-per-second')).toBe(
      point.roundtrip_token_rate_at_latency_percentile.p50,
    );
    expect(metricValue(point, 'dispatch', 'p50', 'tokens-per-second')).toBeNull();
  });

  it('returns the payload data rate', () => {
    expect(metricValue(point, 'dispatch', 'p50', 'activation-rate')).toBeGreaterThan(0);
  });

  it('returns null for an unavailable component', () => {
    const unavailable = makeCollectiveXSeries({ rows: [{ stageUnavailable: true }] }).points[0];
    expect(metricValue(unavailable, 'stage', 'p50', 'latency')).toBeNull();
  });
});

describe('chartPoints', () => {
  it('emits one point per token row with populated axes', () => {
    const points = chartPoints([scaleUp], 'dispatch', 'p50', 'latency');
    expect(points).toHaveLength(scaleUp.points.length);
    for (const point of points) {
      expect(point.seriesId).toBe(scaleUp.series_id);
      expect(point.colorKey).toBe(collectiveXColorKey(scaleUp));
      expect(point.x).toBeGreaterThan(0);
      expect(point.y).toBeGreaterThan(0);
    }
  });

  it('drops points whose metric is unavailable', () => {
    // Dispatch has no per-operation token rate, so tokens-per-second is null everywhere.
    expect(chartPoints([scaleUp], 'dispatch', 'p50', 'tokens-per-second')).toHaveLength(0);
  });

  it('keeps roundtrip token-rate points', () => {
    const points = chartPoints([scaleUp], 'roundtrip', 'p50', 'tokens-per-second');
    expect(points).toHaveLength(scaleUp.points.length);
  });
});
