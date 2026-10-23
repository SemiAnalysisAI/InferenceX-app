import type { GpuSpecs } from '@/lib/catalog/constants';

import { MS_PER_MONTH, outputTokPerChip, splitTokenStreams } from './lifecycle';
import { getThroughputForType } from './power-ranking';
import type { CostProvider, CostType, InterpolatedResult } from './types';

export const HOURS_PER_MONTH = 730;

export interface FleetStats {
  gpus: number;
  fleetTokPerSec: number;
  concurrentUsers: number;
  costPerHour: number;
  costPerMonth: number;
}

export interface FleetInputs {
  mw: number;
  powerKwPerGpu: number;
  costPerGpuHour: number;
  tputPerGpu: number;
  outputTputPerGpu: number;
  interactivity: number;
}

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
  mw: number;
  specs: Pick<GpuSpecs, 'power' | 'costh' | 'costr'>;
  costProvider: CostProvider;
  costType: CostType;
  interactivity: number;
  totalThroughput?: number;
}

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

export function formatCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(digits)}k`;
  return value.toFixed(abs >= 100 || Number.isInteger(value) ? 0 : digits);
}
