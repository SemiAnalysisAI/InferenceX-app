import type {
  CollectiveXChartPoint,
  CollectiveXComponent,
  CollectiveXMode,
  CollectiveXOperation,
  CollectiveXPercentile,
  CollectiveXPhase,
  CollectiveXPoint,
  CollectiveXPrecision,
  CollectiveXSeries,
  CollectiveXYAxis,
} from './types';

export interface CollectiveXSeriesSelection {
  epSize: number;
  phase: CollectiveXPhase;
  mode: CollectiveXMode;
  precision: CollectiveXPrecision;
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
  return `${series.system.sku.toUpperCase()} · ${series.backend} · EP${series.system.ep_size} · ${series.mode} · ${series.phase} · ${series.precision}`;
}

export function collectiveXColorKey(series: CollectiveXSeries): string {
  return `${series.system.vendor}_${series.system.sku}_${series.backend}_ep${series.system.ep_size}_${series.mode}_${series.phase}_${series.precision}`;
}

export function seriesMatchesSelection(
  series: CollectiveXSeries,
  selection: CollectiveXSeriesSelection,
): boolean {
  return (
    series.system.ep_size === selection.epSize &&
    series.phase === selection.phase &&
    series.mode === selection.mode &&
    series.precision === selection.precision
  );
}

export function metricValue(
  point: CollectiveXPoint,
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
): number | null {
  const component: CollectiveXComponent | null = point.components[operation];
  if (component === null) return null;
  if (yAxis === 'latency') return component.latency_us[percentile];
  if (yAxis === 'tokens-per-second') {
    return operation === 'roundtrip'
      ? point.roundtrip_token_rate_at_latency_percentile[percentile]
      : null;
  }
  return component.activation_data_rate_gbps_at_latency_percentile?.[percentile] ?? null;
}

export function chartPoints(
  series: CollectiveXSeries[],
  operation: CollectiveXOperation,
  percentile: CollectiveXPercentile,
  yAxis: CollectiveXYAxis,
): CollectiveXChartPoint[] {
  return series.flatMap((item) =>
    item.points.flatMap((point) => {
      const x = point.tokens_per_rank;
      const y = metricValue(point, operation, percentile, yAxis);
      if (!Number.isFinite(x) || x <= 0 || y === null || y <= 0 || !Number.isFinite(y)) return [];
      return [
        {
          seriesId: item.series_id,
          seriesLabel: collectiveXSeriesLabel(item),
          colorKey: collectiveXColorKey(item),
          x,
          y,
          point,
        },
      ];
    }),
  );
}
