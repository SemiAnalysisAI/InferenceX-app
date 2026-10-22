import { GPU_SPECS, parseNumericFromString } from '@/lib/catalog/gpu-specs';
import type { UbenchxRow, UbenchxRun } from './ubenchx-data';

export interface UbenchxDerivedRow extends UbenchxRow {
  readonly mbuPercent: number;
  readonly sizeLabel: string;
}

export interface UbenchxViewResult {
  readonly gpu: string;
  readonly peakBandwidthGbps: number;
  readonly peakBandwidthSource: string;
  readonly metadata: UbenchxRun['metadata'];
  readonly rows: readonly UbenchxDerivedRow[];
}

export function getPeakBandwidthGbps(gpuSpecName: string): number {
  const spec = GPU_SPECS.find((s) => s.name === gpuSpecName);
  if (!spec) throw new Error(`${gpuSpecName} not found in GPU_SPECS`);
  const tbps = parseNumericFromString(spec.memoryBandwidth);
  if (tbps === null) throw new Error(`Could not parse ${gpuSpecName} memoryBandwidth`);
  return tbps * 1000;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${bytes / 1024} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${bytes / (1024 * 1024)} MiB`;
  return `${bytes / (1024 * 1024 * 1024)} GiB`;
}

export function transformUbenchxRun(gpuKey: string, run: UbenchxRun): UbenchxViewResult {
  const peakBandwidthGbps = getPeakBandwidthGbps(gpuKey);
  const rows: UbenchxDerivedRow[] = run.rows.map((row) => ({
    ...row,
    mbuPercent: peakBandwidthGbps > 0 ? (row.bandwidthGbps / peakBandwidthGbps) * 100 : 0,
    sizeLabel: formatBytes(row.bytes),
  }));

  return {
    gpu: gpuKey,
    peakBandwidthGbps,
    peakBandwidthSource: `GPU_SPECS ${gpuKey} memoryBandwidth (${peakBandwidthGbps / 1000} TB/s)`,
    metadata: run.metadata,
    rows,
  };
}
