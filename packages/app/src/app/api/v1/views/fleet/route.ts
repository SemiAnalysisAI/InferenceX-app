import type { NextRequest } from 'next/server';

import { getModelReleaseDate, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getAllBenchmarksForHistory,
  type BenchmarkRow,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { computeFleetStats } from '@/components/calculator/fleet';
import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  mergeProgressionsByChip,
  type ChipProgression,
} from '@/components/calculator/historical-best';
import {
  availabilityFromInterrupts,
  breakEvenPricePerMTok,
  computeLifecycle,
  effectiveTokPerSec,
  metricValue,
  outputTokPerChip,
  splitTokenStreams,
  MS_PER_MONTH,
  type LifecycleAssumptions,
  type LifecycleMetric,
  type ThroughputStep,
} from '@/components/calculator/lifecycle';
import { resolveRowPrecisions } from '@/components/calculator/throughput-data';
import type { InterpolatedResult } from '@/components/calculator/types';
import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { loadFixture } from '@/lib/test-fixtures';
import { getDisplayLabel } from '@/lib/utils';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
} from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * Fixed internals, matching the dashboard context the Fleet Lifecycle page runs
 * under (`FleetLifecycle.tsx` + its `DEFAULTS`): the fleet is sized at the
 * default 35 tok/s/user target on H100-rental pricing over total tokens, and the
 * two seeded prices keep the published 4x output:input ratio.
 */
const TARGET_INTERACTIVITY = 35;
const COST_PROVIDER = 'costh' as const;
const OUTPUT_PRICE_MULTIPLE = 4;

const METRIC_VALUES = [
  'margin',
  'marginPerMw',
  'revenue',
  'revenuePerMw',
  'cumulativeRevenue',
] as const satisfies readonly LifecycleMetric[];
const PERCENTILE_VALUES = [Percentile.P75, Percentile.P90] as const;

const getCachedFleetHistory = cachedQuery(
  async (modelKeys: string[], sequence: Sequence) => {
    const islOsl = sequenceToIslOsl(sequence);
    // Agentic history has no ISL/OSL to key on and no sequence to trim by, so it
    // comes back whole — the same shape `useHistoricalBest` consumes.
    const rows = islOsl
      ? await getAllBenchmarksForHistory(getDb(), modelKeys, islOsl.isl, islOsl.osl)
      : await getAllBenchmarksForHistory(getDb(), modelKeys, null, null, 'agentic_traces');
    return islOsl ? toCalculatorBenchmarkRows(rows, sequence) : rows;
  },
  'views-fleet-history',
  { blobOnly: true },
);

/** Matches a chip's history line by full hwKey or by its base chip segment. */
function matchesGpuFilter(hwKey: string, gpus: string[]): boolean {
  if (gpus.length === 0) return true;
  const base = hwKey.split('_')[0];
  return gpus.some((gpu) => gpu === hwKey.toLowerCase() || gpu === base.toLowerCase());
}

interface SizedFleet {
  chip: ChipProgression;
  steps: ThroughputStep[];
  costPerHour: number;
  provisionedMw: number;
  gpus: number;
  concurrentUsersNow: number;
}

export function GET(request: NextRequest): Promise<Response> {
  return runViewsRoute('fleet', async () => {
    const search = request.nextUrl.searchParams;

    const model = resolveModelParam(search.get('model'));
    const sequence = parseSequenceParam(search.get('sequence'), Sequence.EightK_OneK);
    const requestedPrecisions = parsePrecisionsParam(search.get('precisions'));
    const mwRaw = search.get('mw');
    if (mwRaw === null || mwRaw === '') {
      throw new ViewsApiParamError('mw', 'mw is required (facility power budget in MW, > 0)');
    }
    const mw = parseNumberParam(mwRaw, 'mw', 0);
    if (mw <= 0) {
      throw new ViewsApiParamError('mw', `Invalid mw: ${mw} (must be > 0)`);
    }
    const priceRaw = search.get('price');
    const price =
      priceRaw === null || priceRaw === ''
        ? undefined
        : parseNumberParam(priceRaw, 'price', 0, { min: 0 });
    const opriceRaw = search.get('oprice');
    const oprice =
      opriceRaw === null || opriceRaw === ''
        ? undefined
        : parseNumberParam(opriceRaw, 'oprice', 0, { min: 0 });
    const ramp = parseNumberParam(search.get('ramp'), 'ramp', 3, { min: 0 });
    const cache = parseNumberParam(search.get('cache'), 'cache', 10, { min: 0, max: 100 });
    const mtbi = parseNumberParam(search.get('mtbi'), 'mtbi', 24, { min: 0 });
    const recovery = parseNumberParam(search.get('recovery'), 'recovery', 12, { min: 0 });
    const horizonRaw = search.get('horizon');
    const horizonParam =
      horizonRaw === null || horizonRaw === ''
        ? undefined
        : parseNumberParam(horizonRaw, 'horizon', 0);
    if (horizonParam !== undefined && horizonParam <= 0) {
      throw new ViewsApiParamError('horizon', `Invalid horizon: ${horizonParam} (must be > 0)`);
    }
    const metric = parseEnumParam(search.get('metric'), 'metric', METRIC_VALUES, 'margin');
    const percentile = parseEnumParam(
      search.get('percentile'),
      'percentile',
      PERCENTILE_VALUES,
      Percentile.P90,
    );
    const gpus = parseFreeListParam(search.get('gpus')).map((gpu) => gpu.toLowerCase());
    const format = parseFormatParam(search.get('format'));

    const rows = FIXTURES_MODE
      ? loadFixture<BenchmarkRow[]>('benchmarks-history')
      : await getCachedFleetHistory([...model.dbModelKeys], sequence);

    const precisions = resolveRowPrecisions(rows, sequence, requestedPrecisions);

    // Stage one/two of `useHistoricalBest`: per-(hwKey, date) frontiers, then each
    // hwKey's best-so-far staircase at the target. The rank accessor is
    // `getComparableTpPerMwForType(result, 'total')`, which for the fixed 'total'
    // basis is exactly `result.tpPerMw` — inlined here because that accessor
    // lives in a 'use client' d3 module.
    const groups = groupHistoryByHwKeyAndDate({
      rows,
      sequence,
      precisions,
      percentile,
      tokenType: 'total',
    });
    const progressions = bestSoFarProgression(groups, {
      targetValue: TARGET_INTERACTIVITY,
      mode: 'interactivity_to_throughput',
      costProvider: COST_PROVIDER,
      rank: (result: InterpolatedResult) => result.tpPerMw,
    }).filter((progression) => matchesGpuFilter(progression.hwKey, gpus));
    const chips = mergeProgressionsByChip(progressions);

    // Month 0 = the model's release date, so every chip's line starts where the
    // market did; models without one anchor at their earliest measured sweep.
    const releaseDate = getModelReleaseDate(model.displayName);
    let anchorDate: string | null = releaseDate;
    if (!anchorDate) {
      for (const chip of chips) {
        const first = chip.steps[0]?.date;
        if (first && (anchorDate === null || first < anchorDate)) anchorDate = first;
      }
    }
    const anchorMs = anchorDate ? Date.parse(`${anchorDate}T00:00:00Z`) : Number.NaN;

    // A cached input token sells for a tenth of a fresh one; only agentic traces
    // measure a cached fraction for the discount to apply to.
    const isAgentic = sequence === Sequence.AgenticTraces;
    const cacheReadRatio = isAgentic ? Math.min(1, cache / 100) : 1;

    // Fleet sizing per chip — the exact schedule assembly `FleetLifecycle.tsx`
    // performs: chip count and $/chip/hr are fixed by the opening rung, each rung
    // contributes a step at its measured date with the fleet's total token rate
    // split into billable-input and output streams by the measured mix.
    const fleets: SizedFleet[] = [];
    if (Number.isFinite(anchorMs)) {
      for (const chip of chips) {
        const specs = getGpuSpecs(chip.baseGpu);
        const steps: ThroughputStep[] = [];
        let costPerHour: number | null = null;
        let fleetGpus: number | null = null;
        let provisionedMw: number | null = null;
        let concurrentUsersNow: number | null = null;

        for (const step of chip.steps) {
          const totalTput = step.result.value;
          const stats = computeFleetStats({
            mw,
            powerKwPerGpu: specs.power,
            costPerGpuHour: specs[COST_PROVIDER],
            tputPerGpu: totalTput,
            outputTputPerGpu: outputTokPerChip(
              totalTput,
              step.result.inputTokenShare,
              step.result.outputTputValue,
            ),
            interactivity: TARGET_INTERACTIVITY,
          });
          if (!stats) continue;
          costPerHour ??= stats.costPerHour;
          provisionedMw ??= (stats.gpus * specs.power) / 1000;
          fleetGpus ??= stats.gpus;
          concurrentUsersNow = stats.concurrentUsers;
          steps.push({
            month: (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH,
            ...splitTokenStreams(
              stats.gpus * totalTput,
              step.result.inputTokenShare,
              step.result.cacheHitRate,
              cacheReadRatio,
            ),
          });
        }

        if (
          steps.length === 0 ||
          costPerHour === null ||
          provisionedMw === null ||
          fleetGpus === null ||
          concurrentUsersNow === null
        ) {
          continue;
        }
        fleets.push({
          chip,
          steps,
          costPerHour,
          provisionedMw,
          gpus: fleetGpus,
          concurrentUsersNow,
        });
      }
    }

    const availability = availabilityFromInterrupts(mtbi, recovery);

    // Competitive floor: the cheapest fleet's break-even at its latest config,
    // interrupts included — the price the default seeds sit on.
    const breakEvenOf = (fleet: SizedFleet): number | null => {
      const latest = fleet.steps.at(-1);
      if (!latest) return null;
      return breakEvenPricePerMTok(
        fleet.costPerHour,
        effectiveTokPerSec(
          latest.billableInputTokPerSec,
          latest.outputTokPerSec,
          OUTPUT_PRICE_MULTIPLE,
        ),
        availability,
      );
    };
    let breakEven: number | null = null;
    for (const fleet of fleets) {
      const value = breakEvenOf(fleet);
      if (value !== null && (breakEven === null || value < breakEven)) breakEven = value;
    }

    // Price seeding mirrors the dashboard: give one price and the other derives
    // through the fixed 4x multiple; give neither and both seed from break-even.
    const inputPrice =
      price ?? (oprice === undefined ? (breakEven ?? 0) : oprice / OUTPUT_PRICE_MULTIPLE);
    const outputPrice =
      oprice ??
      (price === undefined
        ? (breakEven ?? 0) * OUTPUT_PRICE_MULTIPLE
        : price * OUTPUT_PRICE_MULTIPLE);

    // Horizon default: a short tail past the last measured sweep so the final
    // step is readable — `max(1, ceil(measuredMonths + 2))`, like the page.
    let measuredMonths: number | null = null;
    if (Number.isFinite(anchorMs)) {
      let latest = -Infinity;
      for (const fleet of fleets) {
        const last = fleet.chip.steps.at(-1)?.date;
        if (!last) continue;
        latest = Math.max(latest, (Date.parse(`${last}T00:00:00Z`) - anchorMs) / MS_PER_MONTH);
      }
      if (Number.isFinite(latest)) measuredMonths = latest;
    }
    const horizonMonths =
      horizonParam ?? (measuredMonths === null ? 1 : Math.max(1, Math.ceil(measuredMonths + 2)));

    const assumptions: LifecycleAssumptions = {
      mtbiDays: mtbi,
      recoveryHours: recovery,
      inputPricePerMTok: inputPrice,
      outputPricePerMTok: outputPrice,
      rampMonths: ramp,
    };

    const series = fleets.flatMap((fleet) => {
      const lifecycle = computeLifecycle({
        steps: fleet.steps,
        costPerHour: fleet.costPerHour,
        provisionedMw: fleet.provisionedMw,
        horizonMonths,
        assumptions,
      });
      if (!lifecycle) return [];
      const baseConfig = getHardwareConfig(fleet.chip.baseGpu, model.displayName);
      return [
        {
          hwKey: fleet.chip.key,
          label: baseConfig ? getDisplayLabel(baseConfig) : fleet.chip.baseGpu,
          hwKeysUsed: fleet.chip.hwKeysUsed,
          disagg: fleet.chip.disagg,
          gpus: fleet.gpus,
          provisionedMw: fleet.provisionedMw,
          costPerHour: fleet.costPerHour,
          concurrentUsersNow: fleet.concurrentUsersNow,
          availability: lifecycle.availability,
          breakEvenPricePerMTok: breakEvenOf(fleet),
          improvementFactor: lifecycle.improvementFactor,
          improvementCount: lifecycle.improvementCount,
          paybackMonth: lifecycle.paybackMonth,
          lifetimeMargin: lifecycle.lifetimeMargin,
          revenuePerDay: lifecycle.revenuePerDay,
          costPerDay: lifecycle.costPerDay,
          marginPerDay: lifecycle.marginPerDay,
          startMonth: lifecycle.startMonth,
          endMonth: lifecycle.endMonth,
          rampEndMonth: lifecycle.rampEndMonth,
          points: lifecycle.points.map((point) => ({
            month: point.month,
            value: metricValue(point, metric),
            revenue: point.revenue,
            cost: point.cost,
            margin: point.margin,
            revenuePerMw: point.revenuePerMw,
            marginPerMw: point.marginPerMw,
            cumulative: point.cumulative,
            cumulativeRevenue: point.cumulativeRevenue,
            isStep: point.isStep,
            isRamp: point.isRamp,
          })),
        },
      ];
    });

    // Latest run date in the fetched rows — a stable, cache-friendly timestamp.
    const generatedAt = rows.reduce<string | null>(
      (latest, row) => (latest === null || (row.date && row.date > latest) ? row.date : latest),
      null,
    );

    const resolvedParams = {
      model: model.displayName,
      sequence,
      precisions,
      mw,
      price: inputPrice,
      oprice: outputPrice,
      ramp,
      cache,
      mtbi,
      recovery,
      horizon: horizonMonths,
      metric,
      percentile,
      gpus,
      format,
    };

    if (format === 'csv') {
      return csvResponse(
        series.flatMap((entry) =>
          entry.points.map((point) => ({
            hwKey: entry.hwKey,
            label: entry.label,
            month: point.month,
            value: point.value,
            revenue: point.revenue,
            cost: point.cost,
            margin: point.margin,
            revenuePerMw: point.revenuePerMw,
            marginPerMw: point.marginPerMw,
            cumulative: point.cumulative,
            cumulativeRevenue: point.cumulativeRevenue,
            isStep: point.isStep,
            isRamp: point.isRamp,
          })),
        ),
      );
    }

    return cachedJson({
      view: 'fleet',
      apiVersion: 'v1',
      generatedAt,
      params: resolvedParams,
      assumptions: {
        target: TARGET_INTERACTIVITY,
        costProvider: COST_PROVIDER,
        costType: 'total',
        mtbiDays: mtbi,
        recoveryHours: recovery,
        inputPricePerMTok: inputPrice,
        outputPricePerMTok: outputPrice,
        outputPriceMultiple: OUTPUT_PRICE_MULTIPLE,
        rampMonths: ramp,
        cachedInputPct: cache,
        cacheReadRatio,
        availability,
        breakEvenPricePerMTok: breakEven,
        anchorDate,
        horizonMonths,
      },
      series,
      count: series.length,
    });
  });
}
