import { describe, expect, it } from 'vitest';

import {
  chartPoints,
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  fitAlphaBeta,
  metricValue,
  seriesMatchesSelection,
  type CollectiveXSeriesSelection,
} from './data';
import type { CollectiveXPercentiles, CollectiveXSeries } from './types';
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

  it('returns the activation data rate', () => {
    expect(metricValue(point, 'dispatch', 'p50', 'activation-rate')).toBeGreaterThan(0);
  });

  it('returns the per-GPU payload bandwidth distinct from the activation rate', () => {
    const payload = metricValue(point, 'dispatch', 'p50', 'payload-rate');
    const activation = metricValue(point, 'dispatch', 'p50', 'activation-rate');
    expect(payload).toBeGreaterThan(0);
    // Payload uses total_logical_bytes ÷ ep; activation uses aggregate activation bytes.
    expect(payload).not.toBeCloseTo(activation as number, 1);
  });

  it('returns null for an unavailable component', () => {
    const unavailable = makeCollectiveXSeries({ rows: [{ stageUnavailable: true }] }).points[0];
    expect(metricValue(unavailable, 'stage', 'p50', 'latency')).toBeNull();
  });
});

function pct(value: number): CollectiveXPercentiles {
  return { p50: value, p90: value, p95: value, p99: value };
}

describe('fitAlphaBeta', () => {
  // Build a series whose dispatch latency is exactly α + bytesPerGpu/β with
  // α = 10 µs and β = 250 GB/s (per GPU), so the OLS must recover both. ep = 8,
  // so aggregate payload_bytes = bytesPerGpu × 8 and fitAlphaBeta divides it back.
  const EP = 8;
  function fitSeries(): CollectiveXSeries {
    const point = (bytesPerGpu: number) => {
      const latency = 10 + bytesPerGpu / (250 * 1e3); // µs
      const rate = (bytesPerGpu / latency) * 1e-3; // GB/s per GPU
      const component = {
        latency_us: pct(latency),
        activation_data_rate_gbps_at_latency_percentile: pct(rate),
        payload_data_rate_gbps_at_latency_percentile: pct(rate),
        payload_bytes: bytesPerGpu * EP,
      };
      return {
        tokens_per_rank: bytesPerGpu / 1e4,
        global_tokens: bytesPerGpu / 1e3,
        components: { dispatch: component, stage: null, combine: component, roundtrip: component },
        roundtrip_token_rate_at_latency_percentile: pct(1),
      };
    };
    return {
      series_id: 'fit-series',
      phase: 'decode',
      mode: 'normal',
      precision: 'bf16',
      backend: 'nccl-ep',
      system: {
        ep_size: 8,
        nodes: 1,
        gpus_per_node: 8,
        scale_up_domain: 8,
        scale_up_transport: 'nvlink',
        scale_out_transport: null,
        topology_class: 'h100-nvlink-island',
        sku: 'h100',
        vendor: 'nvidia',
      },
      points: [point(1e6), point(2e6), point(3e6)],
    };
  }

  it('recovers the fixed overhead (alpha) and per-GPU bandwidth (beta)', () => {
    const fit = fitAlphaBeta(fitSeries(), 'dispatch');
    expect(fit).not.toBeNull();
    expect(fit?.alphaUs).toBeCloseTo(10, 3);
    expect(fit?.betaGbps).toBeCloseTo(250, 3);
    expect(fit?.pointCount).toBe(3);
  });

  it('returns null when the byte axis has no variance across the ladder', () => {
    // The default fixture holds bytes constant across the ladder, so bytes/GPU
    // reconstructs to a single value and there is no slope to fit.
    expect(fitAlphaBeta(makeCollectiveXSeries(), 'dispatch')).toBeNull();
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
