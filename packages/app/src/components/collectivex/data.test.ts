import { describe, expect, it } from 'vitest';

import {
  chartPoints,
  collectiveXCaseLabel,
  collectiveXColorKey,
  collectiveXLegendLabel,
  collectiveXRunDasharray,
  collectiveXSeriesForRun,
  collectiveXSeriesLabel,
  collectiveXSkuLabel,
  collectiveXBackendLabel,
  collectiveXTopologyLabel,
  fitAlphaBeta,
  formatCollectiveXLatencyPercentiles,
  metricValue,
  normalizeCollectiveXSku,
  seriesMatchesSelection,
  type CollectiveXSeriesSelection,
  collectiveXRangeBands,
  collectiveXRangeColorKey,
} from './data';
import type { CollectiveXPercentiles, CollectiveXSeries } from './types';
import { makeCollectiveXDataset, makeCollectiveXSeries } from './test-fixture';

const dataset = makeCollectiveXDataset();
const [scaleUp, scaleOut] = dataset.series;

describe('collectiveXTopologyLabel', () => {
  it('shows only the scale-up transport when there is no scale-out fabric', () => {
    expect(collectiveXTopologyLabel(scaleUp.system)).toBe(
      '1x8 · domain 8 · nvlink · h200-nvlink-island',
    );
    expect(collectiveXTopologyLabel(scaleUp.system, 'zh')).toBe(
      '1x8 · 域内芯片数 8 · nvlink · h200-nvlink-island',
    );
  });

  it('joins scale-up and scale-out transports when a scale-out fabric is present', () => {
    expect(collectiveXTopologyLabel(scaleOut.system)).toBe(
      '2x8 · domain 8 · xgmi+rdma · mi355x-xgmi-rdma',
    );
  });
});

describe('collectiveXSeriesLabel', () => {
  it('normalizes runner-pool suffixes in known SKU labels', () => {
    expect(normalizeCollectiveXSku('B200-nscale')).toBe('b200');
    expect(normalizeCollectiveXSku('H100-DGXC')).toBe('h100');
    expect(collectiveXSkuLabel('B200-nscale')).toBe('B200');
    expect(collectiveXBackendLabel('mori')).toBe('MoRI');
    expect(collectiveXBackendLabel('deepep-v2')).toBe('deepep-v2');
    expect(collectiveXCaseLabel('h100-dgxc · deepep-v2', 'h100-dgxc')).toBe('H100 · deepep-v2');
    expect(normalizeCollectiveXSku('future-accelerator')).toBe('future-accelerator');
  });

  it('renders the varying identity axes of a series', () => {
    expect(collectiveXSeriesLabel(scaleUp)).toBe('H200 · deepep-v2 · EP8 · normal · decode · bf16');
  });

  it('distinguishes the dispatch precision', () => {
    expect(collectiveXSeriesLabel(makeCollectiveXSeries({ precision: 'fp8' }))).toBe(
      'H200 · deepep-v2 · EP8 · normal · decode · fp8',
    );
  });

  it('shows the selected EP degree, mode, and phase', () => {
    expect(collectiveXSeriesLabel(scaleOut)).toContain('EP16 · normal · decode');
  });

  it('keeps the stored snapshot id out of the label', () => {
    const [runSeries] = collectiveXSeriesForRun([scaleUp], '30165164821');
    expect(collectiveXSeriesLabel(runSeries)).toBe(
      'H200 · deepep-v2 · EP8 · normal · decode · bf16',
    );
  });

  it('keeps run ids out of the configuration label used by the legend', () => {
    const [runSeries] = collectiveXSeriesForRun([scaleUp], '30165164821');
    expect(collectiveXLegendLabel(runSeries)).toBe(
      'H200 · deepep-v2 · EP8 · normal · decode · bf16',
    );
    expect(collectiveXLegendLabel(runSeries, 'zh')).toBe(
      'H200 · deepep-v2 · EP8 · 常规 · 解码 · bf16',
    );
    expect(
      collectiveXLegendLabel(
        makeCollectiveXSeries({ mode: 'low-latency', phase: 'prefill' }),
        'zh',
      ),
    ).toBe('H200 · deepep-v2 · EP8 · 低延迟 · 预填充 · bf16');
  });
});

describe('collectiveXColorKey', () => {
  it('assigns the same key to two series with identical configuration', () => {
    const a = makeCollectiveXSeries({ variant: 'a' });
    const b = makeCollectiveXSeries({ variant: 'b' });
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
    expect(collectiveXColorKey(scaleUp).split('_')[0]).toBe('nvidia');
    const amd = makeCollectiveXSeries({ sku: 'mi355x', vendor: 'amd' });
    expect(collectiveXColorKey(amd).split('_')[0]).toBe('amd');
  });

  it('keeps the same configuration color across different runs', () => {
    const [first] = collectiveXSeriesForRun([scaleUp], '30165164821');
    const [second] = collectiveXSeriesForRun([scaleUp], '30177021271');
    expect(collectiveXColorKey(first)).toBe(collectiveXColorKey(second));
  });

  it('assigns the same hardware color across runner-pool SKU suffixes', () => {
    const nscale = makeCollectiveXSeries({ sku: 'b200-nscale' });
    const dgxc = makeCollectiveXSeries({ sku: 'b200-dgxc' });
    expect(collectiveXColorKey(nscale)).toBe(collectiveXColorKey(dgxc));
  });
});

describe('collectiveXSeriesForRun', () => {
  it('namespaces otherwise-colliding series ids without mutating the source', () => {
    const originalId = scaleUp.series_id;
    const [first] = collectiveXSeriesForRun([scaleUp], '30165164821', 2);
    const [second] = collectiveXSeriesForRun([scaleUp], '30177021271', 3);

    expect(first.series_id).toBe(`30165164821:${originalId}`);
    expect(first.run_id).toBe('30165164821');
    expect(first.run_index).toBe(2);
    expect(second.series_id).toBe(`30177021271:${originalId}`);
    expect(second.run_index).toBe(3);
    expect(scaleUp.series_id).toBe(originalId);
  });
});

describe('collectiveXRunDasharray', () => {
  it('uses a solid line for the first selected run and distinct patterns for following runs', () => {
    expect(collectiveXRunDasharray(0)).toBe('none');
    expect(collectiveXRunDasharray(1)).toBe('9 4');
    expect(collectiveXRunDasharray(2)).toBe('3 3');
  });

  it('normalizes invalid negative and fractional indexes', () => {
    expect(collectiveXRunDasharray(-1)).toBe('none');
    expect(collectiveXRunDasharray(1.9)).toBe('9 4');
  });

  it('does not repeat styles after the base six patterns', () => {
    expect(collectiveXRunDasharray(6)).not.toBe(collectiveXRunDasharray(0));
    expect(collectiveXRunDasharray(12)).not.toBe(collectiveXRunDasharray(6));
    expect(collectiveXRunDasharray(55)).not.toBe(collectiveXRunDasharray(6));
  });
});

describe('seriesMatchesSelection', () => {
  const base: CollectiveXSeriesSelection = {
    epSize: 8,
    phase: 'decode',
    modes: ['normal'],
    precision: 'bf16',
  };

  it('matches on EP size, phase, mode, and precision', () => {
    expect(seriesMatchesSelection(scaleUp, base)).toBe(true);
  });

  it('rejects a series whose EP, phase, mode, or precision differs from the selection', () => {
    expect(seriesMatchesSelection(scaleUp, { ...base, epSize: 16 })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, phase: 'prefill' })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, modes: ['low-latency'] })).toBe(false);
    expect(seriesMatchesSelection(scaleUp, { ...base, precision: 'fp8' })).toBe(false);
  });

  it('matches every selected kernel mode', () => {
    const lowLatency = makeCollectiveXSeries({ mode: 'low-latency' });
    const bothModes = { ...base, modes: ['normal', 'low-latency'] as const };

    expect(seriesMatchesSelection(scaleUp, bothModes)).toBe(true);
    expect(seriesMatchesSelection(lowLatency, bothModes)).toBe(true);
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
  const EP = 8;
  const point = (bytesPerGpu: number) => {
    const latency = 10 + bytesPerGpu / (250 * 1e3);
    const rate = (bytesPerGpu / latency) * 1e-3;
    const component = {
      latency_us: pct(latency),
      activation_data_rate_gbps_at_latency_percentile: pct(rate),
      payload_data_rate_gbps_at_latency_percentile: pct(rate),
      payload_bytes: bytesPerGpu * EP,
    };
    return {
      tokens_per_rank: bytesPerGpu / 1e4,
      global_tokens: bytesPerGpu / 1e3,
      components: {
        pair_period: component,
        dispatch: component,
        stage: null,
        combine: component,
        roundtrip: component,
      },
      roundtrip_token_rate_at_latency_percentile: pct(1),
    };
  };

  function fitSeries(): CollectiveXSeries {
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
    expect(fitAlphaBeta(makeCollectiveXSeries(), 'dispatch')).toBeNull();
  });
});

describe('formatCollectiveXLatencyPercentiles', () => {
  const component = scaleUp.points[0].components.dispatch!;

  it('formats all four latency percentiles', () => {
    const latency = { p50: 12.34, p90: 15, p95: 18.06, p99: 120.4 };
    expect(
      formatCollectiveXLatencyPercentiles({ ...component, latency_us: latency }, 'unavailable'),
    ).toBe('12.3 / 15.0 / 18.1 / 120.4 µs');
  });

  it('renders a placeholder for percentiles the artifact left null', () => {
    const latency = {
      p50: 9.5,
      p90: null,
      p95: null,
      p99: null,
    } as unknown as CollectiveXPercentiles;
    expect(
      formatCollectiveXLatencyPercentiles({ ...component, latency_us: latency }, 'unavailable'),
    ).toBe('9.5 / - / - / - µs');
  });

  it('uses the unavailable label when the component was not measured', () => {
    expect(formatCollectiveXLatencyPercentiles(null, '不可用')).toBe('不可用');
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
    expect(chartPoints([scaleUp], 'dispatch', 'p50', 'latency', 'zh')[0].seriesLabel).toBe(
      'H200 · deepep-v2 · EP8 · 常规 · 解码 · bf16',
    );
  });

  it('drops points whose metric is unavailable', () => {
    expect(chartPoints([scaleUp], 'dispatch', 'p50', 'tokens-per-second')).toHaveLength(0);
  });

  it('keeps roundtrip token-rate points', () => {
    const points = chartPoints([scaleUp], 'roundtrip', 'p50', 'tokens-per-second');
    expect(points).toHaveLength(scaleUp.points.length);
  });
});

describe('collectiveXRangeBands', () => {
  // Same SKU and EP size, three libraries at scaled latencies, plus another EP size.
  const scaled = (backend: string, factor: number, tokens?: number[]) => {
    const base = collectiveXSeriesForRun([scaleUp], '7')[0];
    return {
      ...base,
      series_id: `7:${backend}`,
      backend,
      points: base.points
        .filter((point) => !tokens || tokens.includes(point.tokens_per_rank))
        .map((point) => ({
          ...point,
          components: {
            ...point.components,
            dispatch: point.components.dispatch && {
              ...point.components.dispatch,
              latency_us: {
                ...point.components.dispatch.latency_us,
                p50: (point.components.dispatch.latency_us.p50 ?? 0) * factor,
              },
            },
          },
        })),
    };
  };
  const first = scaleUp.points[0].tokens_per_rank;
  const base = scaleUp.points[0].components.dispatch!.latency_us.p50!;

  it('spans the lowest to the highest library with the median as its line', () => {
    const bands = collectiveXRangeBands(
      [scaled('a', 1), scaled('b', 2), scaled('c', 4)],
      'dispatch',
      'p50',
      'latency',
    );
    expect(bands).toHaveLength(1);
    expect(bands[0].colorKey).toBe(collectiveXRangeColorKey(scaleUp));
    expect(bands[0].label).toBe('H200 · EP8');
    const point = bands[0].points[0];
    expect(point.x).toBe(first);
    expect([point.lo, point.mid, point.hi]).toEqual([base, base * 2, base * 4]);
    expect(point.members.map((member) => member.label)).toEqual([
      'a · normal',
      'b · normal',
      'c · normal',
    ]);
  });

  it('averages the middle two for an even count and orders rates best-first', () => {
    const [band] = collectiveXRangeBands(
      [scaled('a', 1), scaled('b', 3)],
      'dispatch',
      'p50',
      'latency',
    );
    expect(band.points[0].mid).toBe(base * 2);
    const [rate] = collectiveXRangeBands(
      [scaled('a', 1), scaled('b', 3)],
      'roundtrip',
      'p50',
      'tokens-per-second',
    );
    const ys = rate.points[0].members.map((member) => member.y);
    expect(ys).toEqual(ys.toSorted((a, b) => b - a));
  });

  it('covers every token count any library measured', () => {
    const [band] = collectiveXRangeBands(
      [scaled('a', 1, [first]), scaled('b', 2)],
      'dispatch',
      'p50',
      'latency',
    );
    expect(band.points).toHaveLength(scaleUp.points.length);
    expect(band.points[0].members).toHaveLength(2);
    expect(band.points.at(-1)!.members).toHaveLength(1);
    const last = band.points.at(-1)!;
    expect(last.lo).toBe(last.hi);
  });

  it('counts libraries, not library-and-mode series', () => {
    const lowLatency = { ...scaled('a', 2), series_id: '7:a-ll', mode: 'low-latency' as const };
    const [band] = collectiveXRangeBands(
      [scaled('a', 1), lowLatency, scaled('b', 3)],
      'dispatch',
      'p50',
      'latency',
    );
    expect(band.points[0].members).toHaveLength(3);
    expect(band.points[0].libraries).toBe(2);
  });

  it('keeps SKUs and EP sizes apart', () => {
    const other = collectiveXSeriesForRun([scaleOut], '7')[0];
    const bands = collectiveXRangeBands([scaled('a', 1), other], 'dispatch', 'p50', 'latency');
    expect(bands.map((band) => band.label)).toEqual(['H200 · EP8', 'MI355X · EP16']);
  });
});
