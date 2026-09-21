import { getComparableTpPerMwForType } from '@/components/calculator/power-ranking';
import { resolveRowPrecisions } from '@/components/calculator/throughput-data';
import {
  validateParams as validateViewParams,
  matchesHardware,
  parseCostProviderParam,
  parseCostTypeParam,
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  parseTcoBasisParam,
  resolveModelParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { CALCULATOR_PERCENTILE_VALUES } from '@/lib/views-api/source';
import type { NextRequest } from 'next/server';

import { getModelReleaseDate, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { buildFleetSchedule } from '@/components/calculator/fleet';
import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  mergeProgressionsByChip,
} from '@/components/calculator/historical-best';
import {
  availabilityFromInterrupts,
  breakEvenPricePerMTok,
  computeLifecycle,
  effectiveTokPerSec,
  LIFECYCLE_DEFAULTS,
  LIFECYCLE_METRICS,
  metricValue,
  MS_PER_MONTH,
  type LifecycleAssumptions,
} from '@/components/calculator/lifecycle';

import type { InterpolatedResult } from '@/components/calculator/types';
import { cachedJson } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import {
  getCachedAgenticBenchmarkHistory,
  getCachedBenchmarkHistory,
} from '@/lib/benchmark-query-cache.server';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { loadFixture } from '@/lib/test-fixtures';
import { getDisplayLabel } from '@/lib/utils';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';

export const dynamic = 'force-dynamic';

/**
 * Fixed internals, matching the dashboard context the Fleet Lifecycle page runs
 * under (`FleetLifecycle.tsx` + `LIFECYCLE_DEFAULTS`): the fleet is sized at the
 * default 35 tok/s/user target on H100-rental pricing over total tokens, and the
 * two seeded prices keep the published 4x output:input ratio.
 */
const OUTPUT_PRICE_MULTIPLE = LIFECYCLE_DEFAULTS.outputPriceMultiple;

/**
 * Same history rows the dashboard's `useHistoricalBest` consumes, through the
 * cache slots `/api/v1/benchmarks/history` owns. Fixed sequences are trimmed to
 * the calculator allowlist after the cache; agentic history has no ISL/OSL to
 * key on and no sequence to trim by, so it comes back whole.
 */
async function fleetHistoryRows(modelKeys: string[], sequence: Sequence): Promise<BenchmarkRow[]> {
  if (FIXTURES_MODE) return loadFixture<BenchmarkRow[]>('benchmarks-history');
  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return getCachedAgenticBenchmarkHistory(modelKeys);
  return toCalculatorBenchmarkRows(
    await getCachedBenchmarkHistory(modelKeys, islOsl.isl, islOsl.osl),
    sequence,
  );
}

export function GET(request: NextRequest): Promise<Response> {
  return runViewsRoute('fleet', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['fleet']);
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
    const ramp = parseNumberParam(search.get('ramp'), 'ramp', LIFECYCLE_DEFAULTS.rampMonths, {
      min: 0,
    });
    const cache = parseNumberParam(
      search.get('cache'),
      'cache',
      LIFECYCLE_DEFAULTS.cachedInputPct,
      {
        min: 0,
        max: 100,
      },
    );
    const mtbi = parseNumberParam(search.get('mtbi'), 'mtbi', LIFECYCLE_DEFAULTS.mtbiDays, {
      min: 0,
    });
    const recovery = parseNumberParam(
      search.get('recovery'),
      'recovery',
      LIFECYCLE_DEFAULTS.recoveryHours,
      { min: 0 },
    );
    const horizonRaw = search.get('horizon');
    const horizonParam =
      horizonRaw === null || horizonRaw === ''
        ? undefined
        : parseNumberParam(horizonRaw, 'horizon', 0);
    if (horizonParam !== undefined && horizonParam <= 0) {
      throw new ViewsApiParamError('horizon', `Invalid horizon: ${horizonParam} (must be > 0)`);
    }
    const metric = parseEnumParam(search.get('metric'), 'metric', LIFECYCLE_METRICS, 'margin');
    const percentile = parseEnumParam(
      search.get('percentile'),
      'percentile',
      CALCULATOR_PERCENTILE_VALUES,
      Percentile.P90,
    );
    const gpus = parseFreeListParam(search.get('gpus'));
    const format = parseFormatParam(search.get('format'));
    const target = parseNumberParam(search.get('target'), 'target', 35, { min: 0.001 });
    const costProvider = parseCostProviderParam(search.get('costProvider'));
    const costType = parseCostTypeParam(search.get('costType'));
    const tcoBasis = parseTcoBasisParam(search.get('tcoBasis'));

    const rows = await fleetHistoryRows([...model.dbModelKeys], sequence);

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
      tokenType: costType,
      tcoBasis,
    });
    const progressions = bestSoFarProgression(groups, {
      targetValue: target,
      mode: 'interactivity_to_throughput',
      costProvider,
      rank: (result: InterpolatedResult) => getComparableTpPerMwForType(result, costType),
    }).filter((progression) => matchesHardware(progression.hwKey, gpus));
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

    const fleets = chips.flatMap((chip) => {
      const fleet = buildFleetSchedule(chip.steps, {
        mw,
        specs: getGpuSpecs(chip.baseGpu, tcoBasis),
        costProvider,
        costType,
        interactivity: target,
        anchorMs,
        cacheReadRatio,
      });
      return fleet ? [{ chip, ...fleet }] : [];
    });

    const availability = availabilityFromInterrupts(mtbi, recovery);

    // Competitive floor: the cheapest fleet's break-even at its latest config,
    // interrupts included — the price the default seeds sit on.
    const breakEvenOf = (fleet: (typeof fleets)[number]): number | null => {
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
        target,
        costProvider,
        costType,
        tcoBasis,
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
