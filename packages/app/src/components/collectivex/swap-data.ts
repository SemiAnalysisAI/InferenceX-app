import { GPU_SPECS } from '@/lib/catalog/gpu-specs';
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
      result.points.flatMap((row) => {
        if (row.direction !== selection.direction || row.layout !== selection.layout) return [];
        const y: number | null =
          selection.metric === 'latency'
            ? row.latency_us[selection.percentile]
            : row.payload_gbps_at_latency_percentile[selection.percentile];
        if (y === null || !Number.isFinite(y)) return [];
        return [
          {
            x: row.block_bytes,
            y,
            seriesId: `${dataset.run.run_id}__${result.result_id}__${row.num_blocks}`,
            colorKey: `${result.sku}:${row.num_blocks}`,
            runId: dataset.run.run_id,
            device: result.runtime.device.trim() || SWAP_GPU_NAMES[result.sku] || result.sku,
            sku: result.sku,
            row,
          },
        ];
      }),
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

/**
 * Pools whose host link is PCIe 4.0 x16, not 5.0: h100-dgxc runs on AWS p5.48xlarge, whose AMD
 * Milan hosts are PCIe 4.0 (32 GB/s one way).
 */
const SWAP_PCIE4_POOLS = new Set(['h100-dgxc']);

export interface SwapRoofline {
  id: string;
  gbps: number;
  path: 'PCIe 4.0 x16' | 'PCIe 5.0 x16' | 'NVLink-C2C' | 'HBM / 2';
  devices: string[];
}

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
      direction === 'd2d'
        ? 'HBM / 2'
        : sku.startsWith('gb')
          ? 'NVLink-C2C'
          : SWAP_PCIE4_POOLS.has(sku)
            ? 'PCIe 4.0 x16'
            : 'PCIe 5.0 x16';
    const gbps =
      direction === 'd2d'
        ? (Number.parseFloat(spec.memoryBandwidth) * 1000) / 2
        : path === 'NVLink-C2C'
          ? 225
          : path === 'PCIe 4.0 x16'
            ? 32
            : 64;
    const id = `${path.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}-${gbps}`;
    const roof = roofs.get(id) ?? { id, gbps, path, devices: [] };
    roof.devices.push(name);
    roofs.set(id, roof);
  }
  return [...roofs.values()].sort((a, b) => a.gbps - b.gbps);
}

/**
 * Linear y-axis for the bandwidth chart. A roofline far above the measured data (NVLink-C2C at
 * 225 GB/s next to ~80 GB/s of data) would squash every series into the bottom third, so the
 * axis breaks just above the data and stacks those rooflines in a short band above the break.
 * Plot coordinates equal GB/s below the break; `toPlot`/`fromPlot` convert the compressed band.
 */
export interface SwapYAxis {
  domainMax: number;
  /** Plot-space y where the axis breaks, or null when every roofline fits on a true scale. */
  breakAt: number | null;
  toPlot: (gbps: number) => number;
  /** GB/s for a plot-space tick, or null for a position inside the break band. */
  fromPlot: (plot: number) => number | null;
}

export function swapYAxis(dataMax: number, rooflineGbps: number[]): SwapYAxis {
  const top = dataMax > 0 ? dataMax : 1;
  // Rooflines up to 1.7x the data stay on the true scale; the break sits above all of them.
  const far = [...new Set(rooflineGbps.filter((gbps) => gbps > top * 1.7))].sort((a, b) => a - b);
  const breakAt = Math.max(top, ...rooflineGbps.filter((gbps) => gbps <= top * 1.7)) * 1.15;
  if (far.length === 0) {
    return {
      domainMax: Math.max(top, ...rooflineGbps) * 1.1,
      breakAt: null,
      toPlot: (gbps) => gbps,
      fromPlot: (plot) => plot,
    };
  }
  const step = breakAt * 0.14;
  const plotOf = new Map(far.map((gbps, i) => [gbps, breakAt + step * (i + 1)]));
  return {
    domainMax: breakAt + step * (far.length + 0.6),
    breakAt,
    toPlot: (gbps) => plotOf.get(gbps) ?? gbps,
    fromPlot: (plot) => {
      if (plot <= breakAt) return plot;
      for (const [gbps, at] of plotOf) if (Math.abs(at - plot) < 1e-9 * breakAt) return gbps;
      return null;
    },
  };
}

/** One block count's value inside a SKU range at one block size. */
export interface SwapRangeMember {
  seriesId: string;
  numBlocks: number;
  y: number;
}

/** A SKU's lowest, median and highest value across block counts at one block size. */
export interface SwapRangePoint {
  x: number;
  lo: number;
  mid: number;
  hi: number;
  /** Best first: highest bandwidth or lowest latency. */
  members: SwapRangeMember[];
}

/** Every block count of one SKU in one run, combined into one band. */
export interface SwapRangeBand {
  id: string;
  runId: string;
  sku: string;
  device: string;
  points: SwapRangePoint[];
}

/**
 * Combine swap series into one band per (run, SKU): at each block size, the band spans the lowest
 * to the highest value across block counts and its line is their median (mean of the two middle
 * values for an even count), matching the EP "Range by SKU" view.
 */
export function swapRangeBands(
  points: readonly SwapChartPoint[],
  metric: 'latency' | 'bandwidth',
): SwapRangeBand[] {
  const bands = new Map<
    string,
    { band: Omit<SwapRangeBand, 'points'>; byX: Map<number, SwapRangeMember[]> }
  >();
  for (const p of points) {
    const id = `${p.runId}__${p.sku}`;
    let entry = bands.get(id);
    if (!entry) {
      entry = { band: { id, runId: p.runId, sku: p.sku, device: p.device }, byX: new Map() };
      bands.set(id, entry);
    }
    const members = entry.byX.get(p.x) ?? [];
    members.push({ seriesId: p.seriesId, numBlocks: p.row.num_blocks, y: p.y });
    entry.byX.set(p.x, members);
  }
  return [...bands.values()]
    .map(({ band, byX }) => ({
      ...band,
      points: [...byX]
        .map(([x, members]) => {
          const ys = members.map((m) => m.y).toSorted((a, b) => a - b);
          const middle = Math.floor(ys.length / 2);
          return {
            x,
            lo: ys[0],
            mid: ys.length % 2 === 1 ? ys[middle] : (ys[middle - 1] + ys[middle]) / 2,
            hi: ys.at(-1)!,
            members: members.toSorted((a, b) => (metric === 'bandwidth' ? b.y - a.y : a.y - b.y)),
          };
        })
        .toSorted((a, b) => a.x - b.x),
    }))
    .toSorted((a, b) => a.device.localeCompare(b.device) || a.runId.localeCompare(b.runId));
}
