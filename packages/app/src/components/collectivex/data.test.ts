import { describe, expect, it } from 'vitest';

import {
  chartPoints,
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  comparisonDifferences,
  metricValue,
  seriesMatchesSelection,
  type CollectiveXSeriesSelection,
} from './data';
import { makeCollectiveXDataset, makeCollectiveXSeries } from './test-fixture';

const dataset = makeCollectiveXDataset();
// series[0]: deepep-v2 EP8 scale-up (nvlink, single node).
// series[1]: deepep EP16 scale-out (nvlink scale-up + rdma scale-out, two nodes).
const [scaleUp, scaleOut] = dataset.series;

describe('collectiveXTopologyLabel', () => {
  it('shows only the scale-up transport when there is no scale-out fabric', () => {
    expect(collectiveXTopologyLabel(scaleUp.system)).toBe(
      '1x8 · domain 8 · nvlink · nvlink-domain',
    );
  });

  it('joins scale-up and scale-out transports when a scale-out fabric is present', () => {
    expect(collectiveXTopologyLabel(scaleOut.system)).toBe(
      '2x8 · domain 8 · nvlink+rdma · multi-node',
    );
  });
});

describe('collectiveXSeriesLabel', () => {
  it('renders the identifying axes of a series', () => {
    const label = collectiveXSeriesLabel(scaleUp);
    expect(label.startsWith('H200-DGXC EP8 · deepep-v2 · normal · scale-up')).toBe(true);
    expect(label).toContain('decode');
    expect(label).toContain('unversioned');
    expect(label).toContain('build cccccccc');
  });

  it('shows the backend version when one is present', () => {
    expect(collectiveXSeriesLabel(scaleOut)).toContain('EP16');
    expect(collectiveXSeriesLabel(scaleOut)).toContain('2.1');
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

  it('leads with the system vendor so getVendor places series in vendor hue zones', () => {
    // The chart color system reads the first "_"-separated token to classify the
    // vendor (NVIDIA greens, AMD reds), matching the InferenceX charts.
    expect(collectiveXColorKey(scaleUp).split('_')[0]).toBe('nvidia');
    const amd = makeCollectiveXSeries({ sku: 'mi355x-oam', vendor: 'amd' });
    expect(collectiveXColorKey(amd).split('_')[0]).toBe('amd');
  });
});

describe('seriesMatchesSelection', () => {
  const base: CollectiveXSeriesSelection = {
    mode: 'normal',
    epSize: 8,
    phase: 'decode',
    fabricScope: 'all',
  };

  it('matches on mode, ep size, phase, and any fabric scope', () => {
    expect(seriesMatchesSelection(scaleUp, base)).toBe(true);
    expect(seriesMatchesSelection(scaleUp, { ...base, fabricScope: 'scale-up' })).toBe(true);
  });

  it('rejects a series whose scope, ep, mode, or phase differs from the selection', () => {
    expect(seriesMatchesSelection(scaleUp, { ...base, fabricScope: 'scale-out' })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, epSize: 16 })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, mode: 'low-latency' })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, phase: 'prefill' })).toBe(false);
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

  it('returns the activation and total-logical data rates', () => {
    expect(metricValue(point, 'dispatch', 'p50', 'activation-rate')).toBeGreaterThan(0);
    expect(metricValue(point, 'dispatch', 'p50', 'total-logical-rate')).toBeGreaterThan(0);
  });

  it('returns null for an unavailable component', () => {
    const unavailable = makeCollectiveXSeries({ rows: [{ stageUnavailable: true }] }).points[0];
    expect(metricValue(unavailable, 'stage', 'p50', 'latency')).toBeNull();
  });

  it('returns null for a derived component with no byte accounting', () => {
    expect(metricValue(point, 'isolated-sum', 'p50', 'activation-rate')).toBeNull();
  });
});

describe('chartPoints', () => {
  it('emits one point per token row with populated axes', () => {
    const points = chartPoints([scaleUp], 'dispatch', 'p50', 'tokens-per-rank', 'latency');
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
    expect(
      chartPoints([scaleUp], 'dispatch', 'p50', 'tokens-per-rank', 'tokens-per-second'),
    ).toHaveLength(0);
  });

  it('keeps roundtrip token-rate points', () => {
    const points = chartPoints([scaleUp], 'roundtrip', 'p50', 'global-tokens', 'tokens-per-second');
    expect(points).toHaveLength(scaleUp.points.length);
  });
});

describe('comparisonDifferences', () => {
  it('returns no warnings for a single series or a series compared with itself', () => {
    expect(comparisonDifferences([scaleUp])).toEqual([]);
    expect(comparisonDifferences([scaleUp, scaleUp])).toEqual([]);
  });

  it('flags the dimensions that differ across compared series', () => {
    const warnings = comparisonDifferences([scaleUp, scaleOut]);
    expect(warnings).toContain('EP degree');
    expect(warnings).toContain('fabric scope');
    expect(warnings).toContain('backend implementation');
    expect(warnings).toContain('transport');
  });
});
