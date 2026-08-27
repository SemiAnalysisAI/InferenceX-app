import type { NextRequest } from 'next/server';

import { GPU_VENDORS, rowToSequence, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getAllBenchmarksForHistory,
  type BenchmarkRow,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import {
  buildTrendLines,
  groupTrendRowsByDate,
  trendMetricDependencies,
} from '@/components/inference/hooks/interpolated-trend-core';
import {
  resolveMetricConfigKey,
  METRIC_REGISTRY,
  type MetricKey,
} from '@/components/inference/metric-registry';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import type { YAxisMetricKey } from '@/components/inference/types';
import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { benchmarkCurveDate } from '@/lib/benchmark-run-selection';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { hardwareLegendLabel } from '@/lib/views-api/legend';
import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { Sequence } from '@/lib/data-mappings';
import { frameworkFamily } from '@/lib/framework-family';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute } from '@/lib/views-api/errors';
import {
  parseDateParam,
  parseFormatParam,
  parseFreeListParam,
  parseListParam,
  parseMetricParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
} from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/historical
 *
 * Interpolated historical trend lines — the Historical Trends dashboard's
 * math, run server-side: for every benchmark snapshot date, the selected
 * metric is interpolated at a target interactivity per hardware config, then
 * assembled into date-sorted lines (shared `interpolated-trend-core`).
 *
 * Query params: model (required), sequence (default 8k/1k), metric (default
 * tokensPerDollarN), target (tok/s/user interactivity, default 35), precisions
 * (default: densest-precision auto-resolution), gpus, vendors, frameworks,
 * deployment, start, end (YYYY-MM-DD snapshot-date bounds), format (json|csv).
 *
 * Unlike the dashboard — which extends each line to wall-clock today — lines
 * here extend only to the latest snapshot date in the data, so responses stay
 * cache-stable. Synthetic extension points carry `synthetic: true`.
 */

const VENDOR_VALUES = ['AMD', 'NVIDIA'] as const;
const FRAMEWORK_FAMILY_VALUES = FRAMEWORK_FAMILIES.map((family) => family.key).toSorted();
const DEPLOYMENT_VALUES = ['agg', 'disagg', 'multi-node', 'single-node'] as const;
const DEFAULT_TARGET_INTERACTIVITY = 35;

// Same cache keys and argument shapes as /api/v1/benchmarks/history so both
// routes share one cached copy of the raw history rows.
const getCachedBenchmarkHistory = cachedQuery(
  (modelKeys: string[], isl: number, osl: number) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, isl, osl),
  'benchmark-history',
  { blobOnly: true },
);
const getCachedAgenticBenchmarkHistory = cachedQuery(
  (modelKeys: string[]) =>
    getAllBenchmarksForHistory(getDb(), modelKeys, null, null, 'agentic_traces'),
  'benchmark-history-agentic',
  { blobOnly: true },
);

function rowDeployment(row: BenchmarkRow): string {
  return row.disagg ? 'disagg' : row.is_multinode ? 'multi-node' : 'single-node';
}

export function GET(request: NextRequest) {
  return runViewsRoute('historical', async () => {
    const search = request.nextUrl.searchParams;

    const { displayName, dbModelKeys } = resolveModelParam(search.get('model'));
    const sequence = parseSequenceParam(search.get('sequence'), Sequence.EightK_OneK);
    const metricConfigKey = parseMetricParam(search.get('metric'));
    const target = parseNumberParam(search.get('target'), 'target', DEFAULT_TARGET_INTERACTIVITY, {
      min: 1,
      max: 1000,
    });
    const precisions = parsePrecisionsParam(search.get('precisions'));
    // Case-fold like calculator/fleet, so the echoed `params.gpus` matches the
    // lowercase keys the filter actually uses.
    const gpus = parseFreeListParam(search.get('gpus')).map((value) => value.toLowerCase());
    const vendors = parseListParam(search.get('vendors'), 'vendors', VENDOR_VALUES);
    const frameworks = parseListParam(
      search.get('frameworks'),
      'frameworks',
      FRAMEWORK_FAMILY_VALUES,
    );
    const deployment = [
      ...new Set(
        parseListParam(search.get('deployment'), 'deployment', DEPLOYMENT_VALUES).flatMap((mode) =>
          mode === 'agg' ? (['multi-node', 'single-node'] as const) : [mode],
        ),
      ),
    ].toSorted();
    const start = parseDateParam(search.get('start'), 'start');
    const end = parseDateParam(search.get('end'), 'end');
    const format = parseFormatParam(search.get('format'));

    const isAgentic = sequence === Sequence.AgenticTraces;
    const islOsl = sequenceToIslOsl(sequence);
    const allRows: BenchmarkRow[] = FIXTURES_MODE
      ? loadFixture<BenchmarkRow[]>('benchmarks').filter((row) => rowToSequence(row) === sequence)
      : isAgentic
        ? await getCachedAgenticBenchmarkHistory([...dbModelKeys])
        : await getCachedBenchmarkHistory([...dbModelKeys], islOsl?.isl ?? 0, islOsl?.osl ?? 0);

    // Precision auto-resolution mirrors the dashboard's densest-precision default.
    const availablePrecisions = [...new Set(allRows.map((row) => row.precision))].toSorted();
    const resolvedPrecisions = resolveEffectivePrecisions({
      selectedPrecisions: [...precisions],
      availablePrecisions,
      curveCounts: countCurvesByPrecision(allRows),
      explicit: precisions.length > 0,
    });

    const trendMetricKey = resolveMetricConfigKey(metricConfigKey).slice(2) as YAxisMetricKey;
    const registryEntry = METRIC_REGISTRY[trendMetricKey as MetricKey];

    const gpuSet = new Set(gpus.map((value) => value.toLowerCase()));
    const vendorSet = new Set<string>(vendors);
    const familySet = new Set<string>(frameworks);
    const deploymentSet = new Set<string>(deployment);
    const hasRowFilter =
      gpuSet.size > 0 ||
      vendorSet.size > 0 ||
      familySet.size > 0 ||
      deploymentSet.size > 0 ||
      start !== undefined ||
      end !== undefined;

    const rowFilter = hasRowFilter
      ? (row: BenchmarkRow): boolean => {
          const date = benchmarkCurveDate(row);
          if (start !== undefined && date < start) return false;
          if (end !== undefined && date > end) return false;
          if (deploymentSet.size > 0 && !deploymentSet.has(rowDeployment(row))) return false;
          if (familySet.size > 0) {
            const family = frameworkFamily(row.framework);
            if (!family || !familySet.has(family)) return false;
          }
          if (gpuSet.size > 0 || vendorSet.size > 0) {
            const hwKey = getHardwareKey(rowToAggDataEntry(row));
            const gpu = hwKey.split('_')[0];
            if (
              gpuSet.size > 0 &&
              !gpuSet.has(hwKey.toLowerCase()) &&
              !gpuSet.has(gpu.toLowerCase())
            ) {
              return false;
            }
            if (vendorSet.size > 0) {
              const vendor = GPU_VENDORS[gpu];
              if (!vendor || !vendorSet.has(vendor)) return false;
            }
          }
          return true;
        }
      : undefined;

    const dateGroupedData = groupTrendRowsByDate(allRows, {
      selectedPrecisions: resolvedPrecisions,
      selectedYAxisMetric: metricConfigKey,
      requestedMetrics: trendMetricDependencies(trendMetricKey),
      ...(rowFilter ? { rowFilter } : {}),
    });

    // Deterministic extension bound: the latest snapshot date in the data
    // (never wall-clock today, which would break response caching).
    let latestDate: string | undefined;
    for (const date of dateGroupedData.keys()) {
      if (latestDate === undefined || date > latestDate) latestDate = date;
    }

    const { trendLines, hwKeysWithData } = buildTrendLines(dateGroupedData, {
      targetInteractivity: target,
      trendMetricKey,
      ...(latestDate === undefined ? {} : { extendToDate: latestDate }),
    });

    const series = [...trendLines.entries()]
      .map(([groupKey, points]) => {
        const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
        const precision = groupKey.includes('__') ? groupKey.split('__')[1] : null;
        return {
          key: groupKey,
          hwKey,
          precision,
          label: hardwareLegendLabel(hwKey),
          vendor: GPU_VENDORS[hwKey.split('_')[0]] ?? null,
          points: points.map((point) => ({
            date: point.date,
            value: point.value,
            ...(point.synthetic ? { synthetic: true } : {}),
          })),
        };
      })
      .toSorted((a, b) => a.key.localeCompare(b.key));

    const resolvedParams = {
      model: displayName,
      sequence: sequence as string,
      metric: metricConfigKey,
      target,
      precisions: resolvedPrecisions,
      gpus,
      vendors,
      frameworks,
      deployment,
      start: start ?? null,
      end: end ?? null,
      format,
    };

    if (format === 'csv') {
      return csvResponse(
        series.flatMap((entry) =>
          entry.points.map((point) => ({
            key: entry.key,
            hwKey: entry.hwKey,
            precision: entry.precision ?? '',
            label: entry.label,
            vendor: entry.vendor ?? '',
            date: point.date,
            value: point.value,
            synthetic: point.synthetic ?? false,
          })),
        ),
      );
    }

    return cachedJson({
      view: 'historical',
      apiVersion: 'v1',
      params: resolvedParams,
      metric: {
        key: trendMetricKey,
        configKey: metricConfigKey,
        label: registryEntry?.label ?? trendMetricKey,
        labelZh:
          registryEntry && 'labelZh' in registryEntry ? registryEntry.labelZh : trendMetricKey,
      },
      target,
      hwKeysWithData,
      series,
      count: series.reduce((total, entry) => total + entry.points.length, 0),
    });
  });
}
