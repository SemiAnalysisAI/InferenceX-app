import type {
  CollectiveXChartPoint,
  CollectiveXCohort,
  CollectiveXComponent,
  CollectiveXMetric,
  CollectiveXMode,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXPhase,
  CollectiveXPoint,
  CollectiveXSeries,
  CollectiveXTopologyScope,
  CollectiveXXAxis,
  CollectiveXYAxis,
} from './types';

export type CollectiveXFabricScope = 'all' | CollectiveXTopologyScope;

export interface CollectiveXSeriesSelection {
  mode: CollectiveXMode;
  epSize: number;
  phase: CollectiveXPhase;
  fabricScope: CollectiveXFabricScope;
}

const DECISION_ORDER = {
  phase: { decode: 0, prefill: 1 },
  measure: { latency_us: 0, logical_payload_rate_gbps_at_latency_percentile: 1 },
  statistic: { p50: 0, p99: 1 },
  objective: { min: 0, max: 1 },
} as const;

export function compareCollectiveXDecisionMetrics(
  left: CollectiveXMetric,
  right: CollectiveXMetric,
): number {
  return (
    DECISION_ORDER.phase[left.phase] - DECISION_ORDER.phase[right.phase] ||
    left.tokens_per_rank - right.tokens_per_rank ||
    DECISION_ORDER.measure[left.measure] - DECISION_ORDER.measure[right.measure] ||
    DECISION_ORDER.statistic[left.statistic] - DECISION_ORDER.statistic[right.statistic] ||
    DECISION_ORDER.objective[left.objective] - DECISION_ORDER.objective[right.objective]
  );
}

export function collectiveXTopologyLabel(
  system: Pick<
    CollectiveXSeries['system'],
    | 'nodes'
    | 'gpus_per_node'
    | 'scale_up_domain'
    | 'scale_up_transport'
    | 'scale_out_transport'
    | 'topology_class'
  >,
): string {
  const transports = system.scale_out_transport
    ? `${system.scale_up_transport}+${system.scale_out_transport}`
    : system.scale_up_transport;
  return `${system.nodes}x${system.gpus_per_node} · domain ${system.scale_up_domain} · ${transports} · ${system.topology_class}`;
}

export function collectiveXSeriesLabel(series: CollectiveXSeries): string {
  const version = series.backend.version ?? 'unversioned';
  const build = series.build.implementation_contract_sha256.slice(0, 8);
  const identity = series.series_id.slice(-8);
  const tier = series.publication_tier === 'official' ? 'official' : 'experimental';
  const routing = `${series.workload.routing}${series.workload.eplb ? '+eplb' : ''}`;
  return `${series.system.sku.toUpperCase()} EP${series.system.ep_size} · ${series.backend.label} · ${series.mode} · ${series.system.scope} · ${series.system.topology_class} · ${series.phase} · ${routing} · ${version} · ${series.resource.profile} · build ${build} · series ${identity} · ${tier}`;
}

export function collectiveXColorKey(series: CollectiveXSeries): string {
  const routing = `${series.workload.routing}${series.workload.eplb ? '-eplb' : ''}`;
  const eplb = series.eplb.enabled
    ? `${series.eplb.planner ?? 'enabled'}-${series.eplb.mapping_sha256 ?? 'unmapped'}-${series.eplb.physical_experts}`
    : 'eplb-off';
  const units = `${series.resource.comm_units_kind ?? 'units'}-${series.resource.configured_units ?? 'default'}`;
  return [
    series.system.sku,
    series.mode,
    `ep${series.system.ep_size}`,
    series.system.scope,
    `${series.system.nodes}x${series.system.gpus_per_node}`,
    `scaleup${series.system.scale_up_domain}`,
    series.system.scale_up_transport,
    series.system.scale_out_transport ?? 'no-scaleout',
    series.system.topology_class,
    series.system.transport,
    series.backend.id,
    series.backend.generation ?? 'default',
    series.backend.version ?? 'unversioned',
    series.publication_tier,
    series.build.implementation_contract_sha256,
    series.build.public_config_sha256,
    series.build.routing_control_sha256,
    series.build.runtime_fingerprint_sha256,
    series.build.image_digest,
    series.build.source_sha,
    series.build.squash_sha256,
    routing,
    eplb,
    series.resource.profile,
    units,
  ].join('_');
}

export function seriesMatchesSelection(
  series: CollectiveXSeries,
  selection: CollectiveXSeriesSelection,
): boolean {
  return (
    series.mode === selection.mode &&
    series.system.ep_size === selection.epSize &&
    series.phase === selection.phase &&
    (selection.fabricScope === 'all' || series.system.scope === selection.fabricScope)
  );
}

export function cohortMatchesSelection(
  cohort: CollectiveXCohort,
  seriesById: Map<string, CollectiveXSeries>,
  selection: CollectiveXSeriesSelection,
): boolean {
  return cohort.series_ids.every((seriesId) => {
    const series = seriesById.get(seriesId);
    return series !== undefined && seriesMatchesSelection(series, selection);
  });
}

function operationComponent(
  point: CollectiveXPoint,
  operation: CollectiveXOperation,
): CollectiveXComponent | null {
  return point.components[operation === 'isolated-sum' ? 'isolated_sum' : operation];
}

export function metricValue(
  point: CollectiveXPoint,
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
): number | null {
  const component = operationComponent(point, operation);
  if (component === null) return null;
  const latencyUs = component.latency_us[percentile];
  if (yAxis === 'latency') return latencyUs;
  if (yAxis === 'tokens-per-second') {
    return operation === 'roundtrip'
      ? point.roundtrip_token_rate_at_latency_percentile[percentile]
      : null;
  }
  return component.logical_payload_rate_gbps_at_latency_percentile?.[percentile] ?? null;
}

export function chartPoints(
  series: CollectiveXSeries[],
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  xAxis: CollectiveXXAxis,
  yAxis: CollectiveXYAxis,
): CollectiveXChartPoint[] {
  return series.flatMap((item) =>
    item.points.flatMap((point) => {
      const x = xAxis === 'tokens-per-rank' ? point.tokens_per_rank : point.global_tokens;
      const y = metricValue(point, operation, percentile, yAxis);
      if (!Number.isFinite(x) || x <= 0 || y === null || y <= 0 || !Number.isFinite(y)) return [];
      return [
        {
          seriesId: item.series_id,
          seriesLabel: collectiveXSeriesLabel(item),
          colorKey: collectiveXColorKey(item),
          x,
          y,
          operation,
          percentile,
          point,
          series: item,
        },
      ];
    }),
  );
}

export function comparisonDifferences(series: CollectiveXSeries[]): string[] {
  if (series.length === 0) return [];
  const warnings: string[] = [];
  const different = (getValue: (item: CollectiveXSeries) => unknown) =>
    new Set(series.map(getValue)).size > 1;
  const checks: [string, (item: CollectiveXSeries) => unknown][] = [
    ['model', (item) => item.model],
    ['suite', (item) => item.suite],
    ['publication tier', (item) => item.publication_tier],
    ['mode', (item) => item.mode],
    ['phase', (item) => item.phase],
    ['backend implementation', (item) => JSON.stringify(item.backend)],
    ['implementation build', (item) => JSON.stringify(item.build)],
    ['system identity', (item) => `${item.system.sku}/${item.system.vendor}/${item.system.label}`],
    ['fabric scope', (item) => item.system.scope],
    ['topology', (item) => collectiveXTopologyLabel(item.system)],
    ['transport', (item) => item.system.transport],
    ['world size', (item) => item.system.world_size],
    ['EP degree', (item) => item.system.ep_size],
    ['placement', (item) => item.system.placement],
    ['workload', (item) => item.workload.workload_id],
    [
      'model shape',
      (item) =>
        `${item.workload.hidden}/${item.workload.top_k}/${item.workload.experts}/${item.workload.activation_profile}`,
    ],
    ['routing', (item) => `${item.workload.routing}/${item.workload.eplb}`],
    ['EPLB plan', (item) => JSON.stringify(item.eplb)],
    ['dtypes', (item) => `${item.workload.dispatch_dtype}/${item.workload.combine_dtype}`],
    ['resource profile', (item) => JSON.stringify(item.resource)],
    ['measurement', (item) => JSON.stringify(item.measurement)],
    ['token ladder', (item) => item.points.map((point) => point.tokens_per_rank).join(',')],
    [
      'component availability',
      (item) =>
        item.points
          .map((point) =>
            ['dispatch', 'combine', 'roundtrip', 'isolated_sum']
              .map((name) => point.components[name as keyof typeof point.components] !== null)
              .join('/'),
          )
          .join(','),
    ],
    ['correctness', (item) => item.points.map((point) => point.correct).join(',')],
  ];
  for (const [label, getValue] of checks) {
    if (different(getValue)) warnings.push(label);
  }
  return warnings;
}
