import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getLatestBenchmarks,
  type BenchmarkRow,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { interpolateForGPU, maxInteractivityAtCost } from '@/components/calculator/interpolation';
import { computeFleetStats } from '@/components/calculator/fleet';
import { outputTokPerChip } from '@/components/calculator/lifecycle';
import {
  buildGpuGroups,
  resolveRowPrecisions,
  throughputForType,
  type GroupMeta,
} from '@/components/calculator/throughput-data';
import type {
  CalculatorMode,
  CostProvider,
  CostType,
  GPUDataPoint,
  InterpolatedResult,
} from '@/components/calculator/types';
import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { toCalculatorBenchmarkRows } from '@/lib/benchmark-api-view';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { loadFixture } from '@/lib/test-fixtures';
import { getDisplayLabel } from '@/lib/utils';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  parseDateParam,
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
} from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/** URL modes are hyphenated; the interpolation engine's are underscored. */
const MODE_VALUES = ['interactivity-to-throughput', 'throughput-to-interactivity'] as const;
type ModeParam = (typeof MODE_VALUES)[number];
const MODE_TO_INTERNAL: Record<ModeParam, CalculatorMode> = {
  'interactivity-to-throughput': 'interactivity_to_throughput',
  'throughput-to-interactivity': 'throughput_to_interactivity',
};

const COST_PROVIDER_VALUES = ['costh', 'costn', 'costr'] as const;
const COST_TYPE_VALUES = ['total', 'input', 'output'] as const;
const PERCENTILE_VALUES = [Percentile.P75, Percentile.P90] as const;

// Same trim the dashboard's calculator fetch applies (`view=calculator` on
// /api/v1/benchmarks), under a views-owned cache key. runId is pre-validated
// numeric, so distinct logical requests never alias one key.
const getCachedCalculatorRows = cachedQuery(
  async (dbModelKeys: string[], sequence: string, date?: string, runId?: string) =>
    toCalculatorBenchmarkRows(
      await getLatestBenchmarks(getDb(), dbModelKeys, date, undefined, runId),
      sequence,
    ),
  'views-calculator-benchmarks',
  { blobOnly: true },
);

/** Matches a group either by full hwKey or by its base chip segment. */
function matchesGpuFilter(hwKey: string, gpus: string[]): boolean {
  if (gpus.length === 0) return true;
  const base = hwKey.split('_')[0];
  return gpus.some((gpu) => gpu === hwKey.toLowerCase() || gpu === base.toLowerCase());
}

/**
 * The interactivity and total throughput actually served at this operating
 * point. On the target axis a clamped read sits at the frontier's nearest edge
 * point rather than at the requested target — `interpolateForGPU` resolves the
 * off-axis metrics against that clamped position (its `clampedTarget`), so the
 * fleet must be sized against the edge value, not the requested one.
 */
function operatingPoint(
  result: InterpolatedResult,
  target: number,
  mode: CalculatorMode,
): { interactivity: number; totalThroughput: number } {
  const edge = result.nearestPoints[0];
  if (mode === 'interactivity_to_throughput') {
    return {
      interactivity: result.clamped && edge ? edge.interactivity : target,
      totalThroughput: result.value,
    };
  }
  return {
    interactivity: result.value,
    totalThroughput: result.clamped && edge ? edge.throughput : target,
  };
}

interface HardwareResult {
  hwKey: string;
  resultKey: string;
  precision: string | null;
  label: string;
  value: number;
  inputThroughput: number;
  outputThroughput: number;
  cost: { total: number; input: number; output: number };
  tpPerMw: number;
  inputTpPerMw: number;
  outputTpPerMw: number;
  concurrency: number;
  cacheHitRate: number | null;
  inputTokenShare: number | null;
  clamped: boolean;
  clampedAbove: boolean;
  clampedBelow: boolean;
  nearest: {
    below: NearestPoint | null;
    above: NearestPoint | null;
  };
  fleet?: FleetStats | null;
}

interface NearestPoint {
  interactivity: number;
  throughput: number;
  concurrency: number;
}

interface FleetStats {
  chips: number;
  totalTokPerSec: number;
  concurrentUsers: number;
  costPerHour: number;
  costPerMonth: number;
}

const toNearest = (point: GPUDataPoint | undefined): NearestPoint | null =>
  point
    ? {
        interactivity: point.interactivity,
        throughput: point.throughput,
        concurrency: point.concurrency,
      }
    : null;

/**
 * `nearestPoints` is ordered by the *input* axis: one edge point when clamped,
 * otherwise the bracketing pair. Split it into below/above on that axis.
 */
function nearestOf(result: InterpolatedResult): HardwareResult['nearest'] {
  const [first, second] = result.nearestPoints;
  if (result.nearestPoints.length === 1) {
    return result.clampedAbove
      ? { below: toNearest(first), above: null }
      : result.clampedBelow
        ? { below: null, above: toNearest(first) }
        : { below: toNearest(first), above: toNearest(first) };
  }
  return { below: toNearest(first), above: toNearest(second) };
}

export function GET(request: NextRequest): Promise<Response> {
  return runViewsRoute('calculator', async () => {
    const search = request.nextUrl.searchParams;

    const model = resolveModelParam(search.get('model'));
    const sequence = parseSequenceParam(search.get('sequence'), Sequence.EightK_OneK);
    const requestedPrecisions = parsePrecisionsParam(search.get('precisions'));
    const target = parseNumberParam(search.get('target'), 'target', 35, { min: 0 });
    if (target <= 0) {
      throw new ViewsApiParamError('target', `Invalid target: ${target} (must be > 0)`);
    }
    const modeParam = parseEnumParam(
      search.get('mode'),
      'mode',
      MODE_VALUES,
      'interactivity-to-throughput',
    );
    const mode = MODE_TO_INTERNAL[modeParam];
    const costProvider: CostProvider = parseEnumParam(
      search.get('costProvider'),
      'costProvider',
      COST_PROVIDER_VALUES,
      'costh',
    );
    const costType: CostType = parseEnumParam(
      search.get('costType'),
      'costType',
      COST_TYPE_VALUES,
      'total',
    );
    const percentile = parseEnumParam(
      search.get('percentile'),
      'percentile',
      PERCENTILE_VALUES,
      Percentile.P90,
    );
    const mwRaw = search.get('mw');
    const mw = mwRaw === null || mwRaw === '' ? undefined : parseNumberParam(mwRaw, 'mw', 0);
    if (mw !== undefined && mw <= 0) {
      throw new ViewsApiParamError('mw', `Invalid mw: ${mw} (must be > 0)`);
    }
    const costcapRaw = search.get('costcap');
    const costcap =
      costcapRaw === null || costcapRaw === ''
        ? undefined
        : parseNumberParam(costcapRaw, 'costcap', 0);
    if (costcap !== undefined && costcap <= 0) {
      throw new ViewsApiParamError('costcap', `Invalid costcap: ${costcap} (must be > 0)`);
    }
    const date = parseDateParam(search.get('date'), 'date');
    const runIdRaw = search.get('runId');
    if (runIdRaw !== null && runIdRaw !== '' && !/^\d+$/u.test(runIdRaw)) {
      throw new ViewsApiParamError('runId', `Invalid runId: ${runIdRaw} (numeric run id required)`);
    }
    const runId = runIdRaw && /^\d+$/u.test(runIdRaw) ? runIdRaw : undefined;
    const gpus = parseFreeListParam(search.get('gpus'));
    const format = parseFormatParam(search.get('format'));

    const rows = FIXTURES_MODE
      ? toCalculatorBenchmarkRows(loadFixture<BenchmarkRow[]>('benchmarks'), sequence)
      : await getCachedCalculatorRows([...model.dbModelKeys], sequence, date, runId);

    const precisions = resolveRowPrecisions(rows, sequence, requestedPrecisions);
    const multiPrecision = precisions.length > 1;

    // Same group identity as the dashboard's official path in
    // `useThroughputData`: one bar per hwKey, split per precision only when the
    // effective selection spans more than one.
    const { grouped, groupMeta, hwConfigMap } = buildGpuGroups<GroupMeta>(rows, {
      sequence,
      precisions,
      percentile,
      tokenType: costType,
      classify: (hwKey, row) =>
        multiPrecision
          ? { key: `${hwKey}__${row.precision}`, meta: { hwKey, precision: row.precision } }
          : { key: hwKey, meta: { hwKey } },
    });

    const labelOf = (hwKey: string): string => {
      const config = hwConfigMap[hwKey] ?? getHardwareConfig(hwKey, model.displayName);
      return config ? getDisplayLabel(config) : hwKey;
    };

    const hardware: HardwareResult[] = [];
    for (const [groupKey, points] of Object.entries(grouped)) {
      const meta = groupMeta[groupKey];
      if (!matchesGpuFilter(meta.hwKey, gpus)) continue;
      const result = interpolateForGPU(points, target, mode, costProvider);
      if (!result || result.value <= 0) continue;

      const point = operatingPoint(result, target, mode);
      // Same sizing call the dashboard makes (CostTargetPanel/FleetLifecycle):
      // chips from the power budget, streams from the measured mix.
      const fleet =
        mw === undefined
          ? undefined
          : computeFleetStatsForResult(
              result,
              point.interactivity,
              point.totalThroughput,
              meta.hwKey,
              mw,
              { costProvider, costType },
            );

      hardware.push({
        hwKey: meta.hwKey,
        resultKey: groupKey,
        precision: meta.precision ?? (multiPrecision ? null : (points[0]?.precision ?? null)),
        label: labelOf(meta.hwKey),
        value: result.value,
        inputThroughput: result.inputTputValue,
        outputThroughput: result.outputTputValue,
        cost: { total: result.cost, input: result.costInput, output: result.costOutput },
        tpPerMw: result.tpPerMw,
        inputTpPerMw: result.inputTpPerMw,
        outputTpPerMw: result.outputTpPerMw,
        concurrency: result.concurrency,
        cacheHitRate: result.cacheHitRate ?? null,
        inputTokenShare: result.inputTokenShare ?? null,
        clamped: Boolean(result.clamped),
        clampedAbove: Boolean(result.clampedAbove),
        clampedBelow: Boolean(result.clampedBelow),
        nearest: nearestOf(result),
        ...(mw === undefined ? {} : { fleet }),
      });
    }
    hardware.sort((a, b) => b.value - a.value);

    // Cost-cap table (mirrors CostTargetPanel): the highest interactivity each
    // config can serve without exceeding the cap, and its operating point there.
    let costCapResults: CostCapRow[] | undefined;
    if (costcap !== undefined) {
      costCapResults = [];
      for (const [groupKey, points] of Object.entries(grouped)) {
        const meta = groupMeta[groupKey];
        if (!matchesGpuFilter(meta.hwKey, gpus)) continue;
        const maxIv = maxInteractivityAtCost(points, costcap, costProvider, costType);
        if (maxIv === null) {
          costCapResults.push({
            hwKey: meta.hwKey,
            resultKey: groupKey,
            label: labelOf(meta.hwKey),
            maxInteractivity: null,
            throughput: null,
            concurrentUsers: null,
          });
          continue;
        }
        const atIv = interpolateForGPU(points, maxIv, 'interactivity_to_throughput', costProvider);
        if (!atIv) continue;
        let concurrentUsers: number | null = null;
        if (mw !== undefined) {
          // Cost-cap rows interpolate forward at maxIv, so the total throughput
          // is the interpolation's own value — same as CostTargetPanel.
          const stats = computeFleetStatsForResult(atIv, maxIv, atIv.value, meta.hwKey, mw, {
            costProvider,
            costType,
          });
          concurrentUsers = stats?.concurrentUsers ?? null;
        }
        costCapResults.push({
          hwKey: meta.hwKey,
          resultKey: groupKey,
          label: labelOf(meta.hwKey),
          maxInteractivity: maxIv,
          throughput: throughputForType(atIv, costType),
          concurrentUsers,
        });
      }
      costCapResults.sort(
        (a, b) => (b.maxInteractivity ?? -Infinity) - (a.maxInteractivity ?? -Infinity),
      );
    }

    // Latest run date in the fetched rows — a stable, cache-friendly timestamp.
    const generatedAt = rows.reduce<string | null>(
      (latest, row) => (latest === null || row.date > latest ? row.date : latest),
      null,
    );

    const resolvedParams = {
      model: model.displayName,
      sequence,
      precisions,
      target,
      mode: modeParam,
      costProvider,
      costType,
      percentile,
      ...(mw === undefined ? {} : { mw }),
      ...(costcap === undefined ? {} : { costcap }),
      ...(date ? { date } : {}),
      ...(runId ? { runId } : {}),
      gpus,
      format,
    };

    if (format === 'csv') {
      return csvResponse(
        hardware.map((entry) => ({
          hwKey: entry.hwKey,
          resultKey: entry.resultKey,
          precision: entry.precision ?? '',
          label: entry.label,
          value: entry.value,
          inputThroughput: entry.inputThroughput,
          outputThroughput: entry.outputThroughput,
          costTotal: entry.cost.total,
          costInput: entry.cost.input,
          costOutput: entry.cost.output,
          tpPerMw: entry.tpPerMw,
          concurrency: entry.concurrency,
          clamped: entry.clamped,
          clampedAbove: entry.clampedAbove,
          clampedBelow: entry.clampedBelow,
          ...(mw === undefined
            ? {}
            : {
                fleetChips: entry.fleet?.chips ?? '',
                fleetTotalTokPerSec: entry.fleet?.totalTokPerSec ?? '',
                fleetConcurrentUsers: entry.fleet?.concurrentUsers ?? '',
                fleetCostPerHour: entry.fleet?.costPerHour ?? '',
                fleetCostPerMonth: entry.fleet?.costPerMonth ?? '',
              }),
        })),
      );
    }

    return cachedJson({
      view: 'calculator',
      apiVersion: 'v1',
      generatedAt,
      params: resolvedParams,
      hardware,
      ...(costCapResults ? { costCap: costCapResults } : {}),
      count: hardware.length,
    });
  });
}

interface CostCapRow {
  hwKey: string;
  resultKey: string;
  label: string;
  maxInteractivity: number | null;
  throughput: number | null;
  concurrentUsers: number | null;
}

function computeFleetStatsForResult(
  result: InterpolatedResult,
  interactivity: number,
  totalThroughput: number,
  hwKey: string,
  mw: number,
  options: { costProvider: CostProvider; costType: CostType },
): FleetStats | null {
  // Specs come from the base chip like the dashboard's fleet sizing does.
  const specs = getGpuSpecs(hwKey);
  const tputPerGpu =
    options.costType === 'input'
      ? result.inputTputValue
      : options.costType === 'output'
        ? result.outputTputValue
        : totalThroughput;
  const stats = computeFleetStats({
    mw,
    powerKwPerGpu: specs.power,
    costPerGpuHour: specs[options.costProvider],
    tputPerGpu,
    outputTputPerGpu: outputTokPerChip(
      totalThroughput,
      result.inputTokenShare,
      result.outputTputValue,
    ),
    interactivity,
  });
  if (!stats) return null;
  return {
    chips: stats.gpus,
    totalTokPerSec: stats.fleetTokPerSec,
    concurrentUsers: stats.concurrentUsers,
    costPerHour: stats.costPerHour,
    costPerMonth: stats.costPerMonth,
  };
}
