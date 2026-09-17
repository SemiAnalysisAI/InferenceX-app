import { GPU_SPECS } from '@/lib/gpu-specs';
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
  sku: string;
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
          seriesId: `${dataset.run.run_id}__${result.result_id}__${row.num_blocks}`,
          colorKey: `${result.sku}:${row.num_blocks}`,
          runId: dataset.run.run_id,
          device: result.runtime.device.trim() || SWAP_GPU_NAMES[result.sku] || result.sku,
          sku: result.sku,
          row,
        })),
    ),
  );
}

const SWAP_GPU_NAMES: Record<string, string> = {
  'h100-dgxc': 'H100 SXM',
  'h200-dgxc': 'H200 SXM',
  'b200-nscale': 'B200 SXM',
  b300: 'B300 SXM',
  gb200: 'GB200 NVL72',
  gb300: 'GB300 NVL72',
  mi300x: 'MI300X',
  'mi300x-tw': 'MI300X',
  mi325x: 'MI325X',
  'mi325x-tw': 'MI325X',
  mi355x: 'MI355X',
};

export interface SwapRoofline {
  id: string;
  gbps: number;
  path: 'PCIe 5.0 x16' | 'NVLink-C2C' | 'HBM / 2';
  devices: string[];
}

/** Nominal per-GPU ceilings. GB200/GB300 split 900 GB/s bidirectional C2C
 * across two GPUs: 225 GB/s per GPU per direction. HGX B300's CPU uplink
 * is Gen5, even though the GPU-to-switch connection supports Gen6.
 * Same-GPU copies read and write HBM, while our numerator counts payload once.
 * Sources and the warm-cache qualification are documented in docs/collectivex.md.
 */
export function swapRooflines(
  points: Pick<SwapChartPoint, 'sku'>[],
  direction: CollectiveXSwapPoint['direction'],
): SwapRoofline[] {
  const roofs = new Map<string, SwapRoofline>();
  for (const sku of new Set(points.map((p) => p.sku))) {
    const name = SWAP_GPU_NAMES[sku];
    const spec = GPU_SPECS.find((gpu) => gpu.name === name);
    if (!spec) continue;
    const path =
      direction === 'd2d' ? 'HBM / 2' : sku.startsWith('gb') ? 'NVLink-C2C' : 'PCIe 5.0 x16';
    const gbps =
      direction === 'd2d'
        ? (Number.parseFloat(spec.memoryBandwidth) * 1000) / 2
        : path === 'NVLink-C2C'
          ? 225
          : 64;
    const id = `${path.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}-${gbps}`;
    const roof = roofs.get(id) ?? { id, gbps, path, devices: [] };
    roof.devices.push(name);
    roofs.set(id, roof);
  }
  return [...roofs.values()].sort((a, b) => a.gbps - b.gbps);
}
