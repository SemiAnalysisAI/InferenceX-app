import type {
  CollectiveXDataset,
  CollectiveXPercentile,
  CollectiveXSwapPoint,
} from '@semianalysisai/inferencex-db/collectivex/types';

export function formatSwapBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.max(
    0,
    Math.min(units.length - 1, Math.floor(Math.log2(Math.max(1, bytes)) / 10)),
  );
  return `${Number((bytes / 1024 ** index).toPrecision(3))} ${units[index]}`;
}
export interface SwapChartPoint {
  x: number;
  y: number;
  seriesId: string;
  colorKey: string;
  runId: string;
  device: string;
  row: CollectiveXSwapPoint;
}
export function swapChartPoints(
  datasets: CollectiveXDataset[],
  selection: {
    direction: CollectiveXSwapPoint['direction'];
    layout: CollectiveXSwapPoint['layout'];
    metric: 'latency' | 'bandwidth';
    percentile: CollectiveXPercentile;
  },
): SwapChartPoint[] {
  return datasets.flatMap((dataset) =>
    (dataset.swap_blocks ?? []).flatMap((result) =>
      result.points
        .filter((row) => row.direction === selection.direction && row.layout === selection.layout)
        .map((row) => ({
          x: row.block_bytes,
          y:
            selection.metric === 'latency'
              ? row.latency_us[selection.percentile]
              : row.payload_gbps_at_latency_percentile[selection.percentile],
          seriesId: `${dataset.run.run_id}:${result.result_id}:${row.num_blocks}`,
          colorKey: `${result.sku}:${row.num_blocks}`,
          runId: dataset.run.run_id,
          device: result.runtime.device,
          row,
        })),
    ),
  );
}
