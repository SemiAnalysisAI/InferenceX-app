import { describe, expect, it } from 'vitest';

import {
  chartPoints,
  cohortMatchesSelection,
  compareCollectiveXDecisionMetrics,
  collectiveXColorKey,
  collectiveXSeriesLabel,
  collectiveXTopologyLabel,
  comparisonDifferences,
  metricValue,
} from './data';
import { makeCollectiveXDataset } from './test-fixture';

describe('CollectiveX EP projections', () => {
  it('orders decision metrics by phase, token count, measure, and percentile', () => {
    const base = makeCollectiveXDataset().rankings[0].metric;
    const metrics = [
      { ...base, phase: 'prefill' as const, tokens_per_rank: 512, statistic: 'p99' as const },
      {
        ...base,
        measure: 'logical_payload_rate_gbps_at_latency_percentile' as const,
        objective: 'max' as const,
        statistic: 'p50' as const,
      },
      { ...base, tokens_per_rank: 16, statistic: 'p99' as const },
      { ...base, tokens_per_rank: 16, statistic: 'p50' as const },
    ].toSorted(compareCollectiveXDecisionMetrics);

    expect(
      metrics.map(
        (metric) =>
          `${metric.phase}/${metric.tokens_per_rank}/${metric.measure}/${metric.statistic}`,
      ),
    ).toEqual([
      'decode/16/latency_us/p50',
      'decode/16/latency_us/p99',
      'decode/128/logical_payload_rate_gbps_at_latency_percentile/p50',
      'prefill/512/latency_us/p99',
    ]);
  });

  it('uses measured roundtrip without synthesizing nullable components', () => {
    const dataset = makeCollectiveXDataset();
    const pairedOnly = dataset.series[1].points[0];

    expect(metricValue(pairedOnly, 'dispatch', 'p99', 'latency')).toBeNull();
    expect(metricValue(pairedOnly, 'combine', 'p99', 'payload-rate')).toBeNull();
    expect(metricValue(pairedOnly, 'roundtrip', 'p99', 'latency')).toBe(120);
    expect(metricValue(pairedOnly, 'roundtrip', 'p99', 'tokens-per-second')).toBeCloseTo(
      8_533_333.33,
    );
  });

  it('uses publisher supplied logical rates', () => {
    const point = makeCollectiveXDataset().series[0].points[0];
    point.components.roundtrip!.logical_payload_rate_gbps_at_latency_percentile!.p99 = 123.45;

    expect(metricValue(point, 'roundtrip', 'p99', 'payload-rate')).toBe(123.45);
    expect(metricValue(point, 'roundtrip', 'p95', 'payload-rate')).toBeGreaterThan(0);
  });

  it('omits unavailable series from a component projection', () => {
    const series = makeCollectiveXDataset().series;

    expect(chartPoints(series, 'dispatch', 'p99', 'tokens-per-rank', 'latency')).toHaveLength(1);
    expect(chartPoints(series, 'roundtrip', 'p99', 'tokens-per-rank', 'latency')).toHaveLength(7);
  });

  it('reports mismatched diagnostic factors without deciding comparability', () => {
    const series = makeCollectiveXDataset().series;
    series[1].workload.routing = 'zipf';
    series[1].system.topology_class = 'other-topology';

    expect(comparisonDifferences(series)).toEqual(expect.arrayContaining(['routing', 'topology']));
  });

  it('reports implementation, transport, and resource differences', () => {
    const base = makeCollectiveXDataset().series[0];
    const different = structuredClone(base);
    different.backend.version = '2.0.0';
    different.build.image_digest = `sha256:${'f'.repeat(64)}`;
    different.system.transport = 'pcie';
    different.resource.configured_units = 12;

    expect(comparisonDifferences([base, different])).toEqual(
      expect.arrayContaining([
        'backend implementation',
        'implementation build',
        'transport',
        'resource profile',
      ]),
    );
    expect(collectiveXColorKey(base)).not.toBe(collectiveXColorKey(different));
    expect(collectiveXSeriesLabel(base)).toContain(
      '1.0.0 · backend-default · build dddddddd · series 00000001',
    );
    expect(collectiveXSeriesLabel(base)).toContain('normal · scale-up · single-node-nvlink');
    expect(collectiveXTopologyLabel(base.system)).toContain('1x8 · domain 8 · nvlink');
  });

  it('keeps publisher cohorts whole when applying mode, EP, phase, and fabric filters', () => {
    const dataset = makeCollectiveXDataset();
    const cohort = dataset.cohorts[0];
    const seriesById = new Map(dataset.series.map((series) => [series.series_id, series]));
    const selection = {
      mode: 'normal' as const,
      epSize: 8,
      phase: 'decode' as const,
      fabricScope: 'scale-up' as const,
    };

    expect(cohortMatchesSelection(cohort, seriesById, selection)).toBe(true);

    const mixedMode = new Map(seriesById);
    const changed = structuredClone(mixedMode.get(cohort.series_ids[0])!);
    changed.mode = 'low-latency';
    mixedMode.set(changed.series_id, changed);
    expect(cohortMatchesSelection(cohort, mixedMode, selection)).toBe(false);

    expect(
      cohortMatchesSelection(cohort, seriesById, { ...selection, fabricScope: 'scale-out' }),
    ).toBe(false);
    expect(cohortMatchesSelection(cohort, seriesById, { ...selection, epSize: 16 })).toBe(false);
    expect(cohortMatchesSelection(cohort, seriesById, { ...selection, phase: 'prefill' })).toBe(
      false,
    );
  });

  it('binds mode and exact topology into labels, colors, and mismatch warnings', () => {
    const base = makeCollectiveXDataset().series[0];
    const different = structuredClone(base);
    different.mode = 'low-latency';
    different.system.scope = 'scale-out';
    different.system.nodes = 2;
    different.system.scale_out_transport = 'rdma';
    different.system.transport = 'nvlink-rdma';
    different.system.topology_class = 'h100-nvlink-rdma';

    expect(collectiveXColorKey(base)).not.toBe(collectiveXColorKey(different));
    expect(collectiveXSeriesLabel(different)).toContain(
      'low-latency · scale-out · h100-nvlink-rdma',
    );
    expect(comparisonDifferences([base, different])).toEqual(
      expect.arrayContaining(['mode', 'fabric scope', 'topology']),
    );
  });

  it('gives routing variants distinct visual identities', () => {
    const [uniform, zipf] = makeCollectiveXDataset().series;
    zipf.workload.routing = 'zipf';

    expect(collectiveXColorKey(uniform)).not.toBe(collectiveXColorKey(zipf));
    zipf.workload.eplb = true;
    expect(collectiveXColorKey(zipf)).toContain('zipf-eplb');
  });

  it('keeps public config, routing-control, and runtime builds visually distinct', () => {
    const base = makeCollectiveXDataset().series[0];
    const publicConfig = structuredClone(base);
    const routingControl = structuredClone(base);
    const runtime = structuredClone(base);
    publicConfig.build.public_config_sha256 = '0'.repeat(64);
    routingControl.build.routing_control_sha256 = '9'.repeat(64);
    runtime.build.runtime_fingerprint_sha256 = '6'.repeat(64);

    expect(collectiveXColorKey(base)).not.toBe(collectiveXColorKey(publicConfig));
    expect(collectiveXColorKey(base)).not.toBe(collectiveXColorKey(routingControl));
    expect(collectiveXColorKey(base)).not.toBe(collectiveXColorKey(runtime));
  });
});
