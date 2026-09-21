/**
 * Pure fleet-scale projection math — no React, no 'use client'.
 *
 * Scales the calculator's per-GPU interpolated operating point to a fleet
 * sized by a facility power budget. "Facility power" means all-in critical IT
 * power per GPU (host, networking, cooling overhead) from the SemiAnalysis
 * Datacenter Industry Model — the same `power` field behind the tok/s/MW
 * metric. Projections assume 100% utilization at the benchmark operating
 * point and owned-datacenter economics for the selected TCO tier.
 */

import type { GpuSpecs } from '@/lib/constants';

import { MS_PER_MONTH, outputTokPerChip, splitTokenStreams } from './lifecycle';
import { getThroughputForType } from './power-ranking';
import type { CostProvider, CostType, InterpolatedResult } from './types';

/** 24h × 365d ÷ 12 — the convention used for $/GPU/hr → $/mo conversions. */
export const HOURS_PER_MONTH = 730;

export interface FleetStats {
  /** Whole GPUs deployable within the facility power budget */
  gpus: number;
  /** Fleet-wide throughput for the selected token type (tok/s) */
  fleetTokPerSec: number;
  /** Simultaneous user streams: fleet output tok/s ÷ interactivity (tok/s/user) */
  concurrentUsers: number;
  /** Fleet TCO for the selected tier ($/hr) */
  costPerHour: number;
  /** Fleet TCO for the selected tier ($/mo, 730 hr/mo) */
  costPerMonth: number;
}

export interface FleetInputs {
  /** Facility power budget in megawatts */
  mw: number;
  /** All-in facility power per GPU in kilowatts (HW_REGISTRY.power) */
  powerKwPerGpu: number;
  /** TCO rate for the selected cost tier ($/GPU/hr) */
  costPerGpuHour: number;
  /** Interpolated per-GPU throughput for the selected token type (tok/s/gpu) */
  tputPerGpu: number;
  /** Interpolated per-GPU output throughput (tok/s/gpu) — users stream output tokens */
  outputTputPerGpu: number;
  /** Operating-point interactivity (output tok/s/user) */
  interactivity: number;
}

/**
 * Returns null when the fleet cannot be sized: no power budget, unknown
 * per-GPU power (e.g. hardware missing from HW_REGISTRY), or a budget too
 * small to power a single GPU.
 */
export function computeFleetStats(inputs: FleetInputs): FleetStats | null {
  const { mw, powerKwPerGpu, costPerGpuHour, tputPerGpu, outputTputPerGpu, interactivity } = inputs;
  if (!(mw > 0) || !(powerKwPerGpu > 0)) return null;

  const gpus = Math.floor((mw * 1000) / powerKwPerGpu);
  if (gpus < 1) return null;

  const fleetTokPerSec = gpus * tputPerGpu;
  const concurrentUsers =
    interactivity > 0 ? Math.floor((gpus * outputTputPerGpu) / interactivity) : 0;
  const costPerHour = gpus * costPerGpuHour;

  return {
    gpus,
    fleetTokPerSec,
    concurrentUsers,
    costPerHour,
    costPerMonth: costPerHour * HOURS_PER_MONTH,
  };
}

export interface FleetSizingOptions {
  /** Facility power budget in megawatts */
  mw: number;
  /** Base-chip specs for the selected TCO basis (`getGpuSpecs`) */
  specs: Pick<GpuSpecs, 'power' | 'costh' | 'costr'>;
  costProvider: CostProvider;
  costType: CostType;
  /** Operating-point interactivity (output tok/s/user) */
  interactivity: number;
  /**
   * Total throughput actually served at the operating point. Defaults to the
   * interpolated `result.value`; callers sizing at a clamped frontier edge pass
   * the edge throughput so the output split follows the served point.
   */
  totalThroughput?: number;
}

/**
 * Size a fleet from one interpolated operating point: chips from the power
 * budget, billable throughput on the selected token type, and user streams from
 * the measured output share. Shared by the calculator API and fleet schedules.
 */
export function sizeFleetForResult(
  result: InterpolatedResult,
  options: FleetSizingOptions,
): FleetStats | null {
  const total = options.totalThroughput ?? result.value;
  return computeFleetStats({
    mw: options.mw,
    powerKwPerGpu: options.specs.power,
    costPerGpuHour: options.specs[options.costProvider],
    tputPerGpu:
      options.costType === 'total' ? total : getThroughputForType(result, options.costType),
    outputTputPerGpu: outputTokPerChip(total, result.inputTokenShare, result.outputTputValue),
    interactivity: options.interactivity,
  });
}

/**
 * One chip's measured schedule: opening-rung sizing and cost stay fixed while
 * concurrent users follow the latest rung. Revenue always uses total tokens,
 * split onto the same per-chip denominator and discounted for measured cache hits.
 */
export function buildFleetSchedule(
  progression: readonly { date: string; result: InterpolatedResult }[],
  options: Omit<FleetSizingOptions, 'totalThroughput'> & {
    anchorMs: number;
    cacheReadRatio: number;
  },
) {
  const first = progression[0];
  const last = progression.at(-1);
  if (!first || !last || !Number.isFinite(options.anchorMs)) return null;
  const opening = sizeFleetForResult(first.result, options);
  const latest = sizeFleetForResult(last.result, options);
  if (!opening || !latest) return null;

  return {
    gpus: opening.gpus,
    costPerHour: opening.costPerHour,
    // Whole chips leave the budget's fractional remainder unprovisioned.
    provisionedMw: (opening.gpus * options.specs.power) / 1000,
    concurrentUsersNow: latest.concurrentUsers,
    steps: progression.map(({ date, result }) => ({
      month: (Date.parse(`${date}T00:00:00Z`) - options.anchorMs) / MS_PER_MONTH,
      ...splitTokenStreams(
        opening.gpus * getThroughputForType(result, 'total'),
        result.inputTokenShare,
        result.cacheHitRate,
        options.cacheReadRatio,
      ),
    })),
  };
}

/** Compact display formatting for fleet-scale magnitudes (1.24M, 48.3k, 950). */
export function formatCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(digits)}k`;
  return value.toFixed(abs >= 100 || Number.isInteger(value) ? 0 : digits);
}
