/**
 * Shared pure transform for ubenchX device-memory copy bandwidth.
 *
 * Used by both the UI component and the read-only API route so they cannot
 * silently calculate different results (AGENTS.md read-only coverage rule).
 */

import { GPU_SPECS, parseNumericFromString } from '@/lib/catalog/gpu-specs';
import type { UbenchxRow, UbenchxRun } from './ubenchx-data';

export interface UbenchxDerivedRow extends UbenchxRow {
  /** Memory bandwidth utilization (%) = bandwidthGbps / peakBandwidthGbps * 100. */
  readonly mbuPercent: number;
  /** Human-readable label for the message size. */
  readonly sizeLabel: string;
}

export interface UbenchxViewResult {
  readonly gpu: string;
  readonly peakBandwidthGbps: number;
  readonly peakBandwidthSource: string;
  readonly metadata: UbenchxRun['metadata'];
  readonly rows: readonly UbenchxDerivedRow[];
}

/**
 * Look up the peak memory bandwidth for a GPU from GPU_SPECS.
 * Returns the value in GB/s. Specs store it as e.g. "3.35 TB/s" or "8 TB/s".
 */
export function getPeakBandwidthGbps(gpuSpecName: string): number {
  const spec = GPU_SPECS.find((s) => s.name === gpuSpecName);
  if (!spec) throw new Error(`${gpuSpecName} not found in GPU_SPECS`);
  const tbps = parseNumericFromString(spec.memoryBandwidth);
  if (tbps === null) throw new Error(`Could not parse ${gpuSpecName} memoryBandwidth`);
  return tbps * 1000; // TB/s -> GB/s
}

/** Format bytes as a human-readable size label (e.g. "8 B", "1 KiB", "16 GiB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${bytes / 1024} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${bytes / (1024 * 1024)} MiB`;
  return `${bytes / (1024 * 1024 * 1024)} GiB`;
}

/**
 * Transform a ubenchX run into the view result consumed by both UI and API.
 * This is the single shared pure function required by the read-only coverage rule.
 *
 * The gpuKey must match a GPU_SPECS name so the correct peak HBM bandwidth is
 * used for MBU derivation.
 */
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
