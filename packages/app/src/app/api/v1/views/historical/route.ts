import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import { fetchOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import {
  getModelDefaultPrecisions,
  getOpenRouterModelId,
  type Model,
  Sequence,
} from '@/lib/data-mappings';
import {
  validateParams as validateViewParams,
  matchesHardware,
  parseDateParam,
  parseDeploymentParam,
  parseEnumParam,
  parseFormatParam,
  parseFrameworkFamiliesParam,
  parseFreeListParam,
  parseMetricParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  parseTcoBasisParam,
  parseVendorsParam,
  resolveModelParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

import { rowToSequence, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import {
  buildTrendLines,
  groupTrendRowsByDate,
  trendMetricDependencies,
} from '@/components/inference/hooks/interpolated-trend-core';
import {
  METRIC_REGISTRY,
  resolveMetricConfigKey,
  type MetricKey,
} from '@/components/inference/metric-registry';
import type { YAxisMetricKey } from '@/components/inference/types';
import { pointDeploymentMode, pointVendor } from '@/components/inference/utils/quickFilters';
import { cachedJson } from '@/lib/api-cache';
import {
  getCachedAgenticBenchmarkHistory,
  getCachedBenchmarkHistory,
} from '@/lib/benchmark-query-cache.server';
import { benchmarkCurveDate } from '@/lib/benchmark-run-selection';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';

import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { frameworkFamily } from '@/lib/framework-family';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { hardwareLegendLabel } from '@/lib/views-api/legend';

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
 * Like the dashboard, lines extend to the current UTC date unless extendToDate
 * is provided. Synthetic extension points carry `synthetic: true` and do not
 * represent additional measurements.
 */

const DEFAULT_TARGET_INTERACTIVITY = 35;

export function GET(request: NextRequest) {
  return runViewsRoute('historical', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['historical']);
    const search = request.nextUrl.searchParams;

    const { displayName, dbModelKeys } = resolveModelParam(search.get('model'));
    const sequence = parseSequenceParam(search.get('sequence'), Sequence.EightK_OneK);
    const metricConfigKey = parseMetricParam(search.get('metric'));
    const target = parseNumberParam(search.get('target'), 'target', DEFAULT_TARGET_INTERACTIVITY, {
      min: 1,
      max: 1000,
    });
    const precisions = parsePrecisionsParam(search.get('precisions'));
    const gpus = parseFreeListParam(search.get('gpus'));
    const vendors = parseVendorsParam(search.get('vendors'));
    const frameworks = parseFrameworkFamiliesParam(search.get('frameworks'));
    const deployment = parseDeploymentParam(search.get('deployment'));
    const start = parseDateParam(search.get('start'), 'start');
    const end = parseDateParam(search.get('end'), 'end');
    const format = parseFormatParam(search.get('format'));
    if (start && end && start > end)
      throw new ViewsApiParamError('end', 'end must not precede start');
    const extendToDate =
      parseDateParam(search.get('extendToDate'), 'extendToDate') ??
      new Date().toISOString().slice(0, 10);
    const tcoBasis = parseTcoBasisParam(search.get('tcoBasis'));
    const priceSource = parseEnumParam(
      search.get('priceSource'),
      'priceSource',
      ['normalized', 'openrouter'],
      'normalized',
    );
    const pricingId = getOpenRouterModelId(displayName as Model);
    if (priceSource === 'openrouter' && !pricingId)
      throw new ViewsApiParamError('priceSource', 'No OpenRouter price configured');
    const pricing =
      priceSource === 'openrouter'
        ? await fetchOpenRouterPricing(pricingId!, AbortSignal.timeout(15000))
        : NORMALIZED_TOKEN_REVENUE_PRICING;

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
      modelDefaultPrecisions: getModelDefaultPrecisions(displayName, sequence),
    });

    const trendMetricKey = resolveMetricConfigKey(metricConfigKey).slice(2) as YAxisMetricKey;
    const registryEntry = METRIC_REGISTRY[trendMetricKey as MetricKey];

    const vendorSet = new Set<string>(vendors);
    const familySet = new Set<string>(frameworks);
    const deploymentSet = new Set<string>(deployment);
    const hasRowFilter =
      gpus.length > 0 ||
      vendorSet.size > 0 ||
      familySet.size > 0 ||
      deploymentSet.size > 0 ||
      start !== undefined ||
      end !== undefined;

    // Same vendor/family/topology classification as the dashboard quick filters
    // (`matchesQuickFilters`), applied to raw rows before trend grouping.
    const rowFilter = hasRowFilter
      ? (row: BenchmarkRow): boolean => {
          const date = benchmarkCurveDate(row);
          if (start !== undefined && date < start) return false;
          if (end !== undefined && date > end) return false;
          if (deploymentSet.size > 0 && !deploymentSet.has(pointDeploymentMode(row))) return false;
          if (familySet.size > 0) {
            const family = frameworkFamily(row.framework);
            if (!family || !familySet.has(family)) return false;
          }
          if (gpus.length > 0 || vendorSet.size > 0) {
            const hwKey = getHardwareKey(rowToAggDataEntry(row));
            if (!matchesHardware(hwKey, gpus)) return false;
            if (vendorSet.size > 0) {
              const vendor = pointVendor(hwKey);
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
      tcoBasis,
      tokenRevenuePricing: pricing,
      ...(rowFilter ? { rowFilter } : {}),
    });

    const { trendLines, hwKeysWithData } = buildTrendLines(dateGroupedData, {
      targetInteractivity: target,
      trendMetricKey,
      extendToDate,
      tokenRevenuePricing: pricing,
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
          vendor: pointVendor(hwKey) ?? null,
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
      tcoBasis,
      priceSource,
      extendToDate,
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
