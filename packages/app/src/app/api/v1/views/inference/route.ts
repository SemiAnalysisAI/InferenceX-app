import { GET as derived } from '@/app/api/v1/derived-agentic-metrics/route';
import { preferVrDefaultRun, VR_DEFAULT_RUN } from '@/components/inference/default-run-preference';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import type { DerivedAgenticMetricMap } from '@/hooks/api/use-derived-agentic-metrics';
import { fetchOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import type { TcoBasis } from '@/lib/constants';
import {
  getModelDefaultPrecisions,
  getOpenRouterModelId,
  isBestPerSkuDefaultOff,
  type Model,
  Percentile,
  PERCENTILE_OPTIONS,
  Sequence,
} from '@/lib/data-mappings';
import { ViewsApiParamError, runViewsRoute } from '@/lib/views-api/errors';
import {
  parseNumberMap,
  validateParams as validateViewParams,
  parseBoolParam,
  parseDateParam,
  parseDeploymentParam,
  parseEnumParam,
  parseFormatParam,
  parseFrameworkFamiliesParam,
  parseFreeListParam,
  parseListParam,
  parseSpecModesParam,
  parseMetricParam,
  parsePrecisionsParam,
  parseRunIdParam,
  parseSequenceParam,
  parseTcoBasisParam,
  parseVendorsParam,
  resolveModelParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import {
  comparisonSelections,
  readResponse,
  sourceRequest,
  unofficialRows,
} from '@/lib/views-api/source';
import type { NextRequest } from 'next/server';

import { rowToSequence } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { X_AXIS_MODES, type XAxisMode } from '@/components/inference/hooks/chart-data-core';
import { POWER_TIER_ORDER } from '@/components/inference/utils/quickFilters';
import { cachedJson } from '@/lib/api-cache';
import { getCachedBenchmarks, getCachedBenchmarksForRun } from '@/lib/benchmark-query-cache.server';

import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';

import {
  buildInferenceSeries,
  type InferenceSeriesResult,
  type SeriesXMode,
} from '@/lib/views-api/series';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/inference
 *
 * Chart-ready series for the main /inference scatter chart: the same dedupe →
 * transform → filter → remap → Pareto pipeline `useChartData` runs client-side,
 * executed server-side via `buildInferenceSeries` (lib/views-api/series.ts).
 *
 * Query params: model (required), sequence (default 8k/1k), precisions
 * (default: densest-precision auto-resolution), metric (default
 * tokensPerDollarN), xmode (default interactivity; the trace-derived
 * e2e-normalized-interactivity mode falls back to interactivity, as the
 * dashboard does for fixed-seq), xmetric (default p90_ttft), percentile
 * (default p90), date, runId (exact workflow-run snapshot), gpus, vendors,
 * frameworks, deployment, spec, optimal, best, format (json|csv).
 */

const XMETRIC_VALUES = ['median_ttft', 'p75_ttft', 'p90_ttft', 'p95_ttft', 'p99_ttft'] as const;

interface InferenceViewParams {
  readonly model: string;
  readonly dbModelKeys: readonly string[];
  readonly sequence: Sequence;
  readonly precisions: readonly string[];
  readonly precisionsExplicit: boolean;
  readonly metric: string;
  readonly xmode: SeriesXMode;
  readonly xmetric: string;
  readonly percentile: string;
  readonly date?: string;
  readonly exact?: boolean;
  readonly runId?: string;
  readonly gpus: readonly string[];
  readonly vendors: readonly string[];
  readonly frameworks: readonly string[];
  readonly deployment: readonly string[];
  readonly spec: readonly string[];
  readonly optimal: boolean;
  readonly best: boolean;
  readonly tcoBasis: TcoBasis;
  readonly power: readonly ('certified' | 'legacy')[];
  readonly allPoints: boolean;
  readonly userCosts: Record<string, number>;
  readonly userPowers: Record<string, number>;
  readonly pricing?: TokenRevenuePricing;
}

interface InferenceViewData {
  readonly resolvedPrecisions: readonly string[];
  readonly result: InferenceSeriesResult;
}

function fetchRows(params: InferenceViewParams): Promise<BenchmarkRow[]> {
  if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));
  if (params.runId) {
    return getCachedBenchmarksForRun([...params.dbModelKeys], params.runId);
  }
  return getCachedBenchmarks([...params.dbModelKeys], params.date, params.exact);
}

function buildView(
  rows: readonly BenchmarkRow[],
  params: InferenceViewParams,
  derivedMetrics?: DerivedAgenticMetricMap,
): InferenceViewData {
  // Precision auto-resolution runs against the sequence-scoped rows, exactly
  // like the dashboard's densest-precision default.
  const seqRows = rows.filter((row) => rowToSequence(row) === params.sequence);
  const availablePrecisions = [...new Set(seqRows.map((row) => row.precision))].toSorted();
  const resolvedPrecisions = resolveEffectivePrecisions({
    selectedPrecisions: [...params.precisions],
    availablePrecisions,
    curveCounts: countCurvesByPrecision(seqRows),
    explicit: params.precisionsExplicit,
    modelDefaultPrecisions: getModelDefaultPrecisions(params.model, params.sequence),
  });

  const result = buildInferenceSeries(rows, {
    sequence: params.sequence,
    percentile: params.percentile,
    precisions: resolvedPrecisions,
    metricConfigKey: parseMetricParam(params.metric),
    xmode: params.xmode,
    xmetric: params.xmetric,
    gpus: params.gpus,
    quickFilters: {
      vendors: [...params.vendors],
      frameworks: [...params.frameworks],
      deployment: [...params.deployment] as ('single-node' | 'multi-node' | 'disagg')[],
      spec: [...params.spec] as ('mtp' | 'stp')[],
      // Measured-power tier pills are a dashboard-only affordance; the API
      // returns every row regardless of power certification, like the default view.
      power: [...params.power],
    },
    optimal: params.optimal,
    best: params.best,
    tcoBasis: params.tcoBasis,
    allPoints: params.allPoints,
    userCosts: params.userCosts,
    userPowers: params.userPowers,
    pricing: params.pricing,
    derivedMetrics,
  });

  return { resolvedPrecisions, result };
}

function csvRows(data: InferenceViewData) {
  return data.result.series.flatMap((entry) =>
    entry.points.map((point) => ({
      hwKey: entry.hwKey,
      gpu: entry.gpu,
      framework: entry.framework,
      specMethod: entry.specMethod,
      label: entry.label,
      vendor: entry.vendor ?? '',
      deployment: entry.deployment,
      kvOffload: entry.kvOffload,
      x: point.x,
      y: point.y,
      concurrency: point.concurrency,
      tp: point.tp,
      date: point.date,
      runId: point.runId ?? '',
      frontier: point.frontier,
      bestPerSku: point.bestPerSku,
      ...Object.fromEntries(
        Object.entries(point.metrics).map(([key, value]) => [`metric_${key}`, value]),
      ),
    })),
  );
}

export function GET(request: NextRequest) {
  return runViewsRoute('inference', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['inference']);
    const search = request.nextUrl.searchParams;

    const { displayName, dbModelKeys } = resolveModelParam(search.get('model'));
    const sequence = parseSequenceParam(search.get('sequence'), Sequence.EightK_OneK);
    const precisions = parsePrecisionsParam(search.get('precisions'));
    const metric = parseMetricParam(search.get('metric'));
    const requestedXMode = parseEnumParam<XAxisMode>(
      search.get('xmode'),
      'xmode',
      X_AXIS_MODES,
      'interactivity',
    );
    // The trace-derived mode has no server-side data source; resolve it to the
    // interactivity chart (the dashboard applies the same fallback on fixed-seq).
    const xmode: SeriesXMode =
      requestedXMode === 'e2e-normalized-interactivity' && sequence !== Sequence.AgenticTraces
        ? 'interactivity'
        : requestedXMode;
    const xmetric = parseEnumParam(search.get('xmetric'), 'xmetric', XMETRIC_VALUES, 'p90_ttft');
    const percentile = parseEnumParam(
      search.get('percentile'),
      'percentile',
      PERCENTILE_OPTIONS,
      Percentile.P90,
    );
    const date = parseDateParam(search.get('date'), 'date');
    const runId = parseRunIdParam(search.get('runId'));
    const gpus = parseFreeListParam(search.get('gpus'));
    const vendors = parseVendorsParam(search.get('vendors'));
    const frameworks = parseFrameworkFamiliesParam(search.get('frameworks'));
    const deployment = parseDeploymentParam(search.get('deployment'));
    const spec = parseSpecModesParam(search.get('spec'));
    const optimal = parseBoolParam(search.get('optimal'), 'optimal', true);
    const best = parseBoolParam(
      search.get('best'),
      'best',
      !isBestPerSkuDefaultOff(displayName as Model, sequence),
    );
    const format = parseFormatParam(search.get('format'));
    const tcoBasis = parseTcoBasisParam(search.get('tcoBasis'));
    const power = parseListParam(search.get('power'), 'power', POWER_TIER_ORDER);
    const allPoints = parseBoolParam(search.get('allPoints'), 'allPoints', false);
    const userCosts = parseNumberMap(search.get('userCosts'), 'userCosts');
    const userPowers = parseNumberMap(search.get('userPowers'), 'userPowers');
    const priceSource = parseEnumParam(
      search.get('priceSource'),
      'priceSource',
      ['normalized', 'openrouter'],
      'normalized',
    );
    const pricingId = getOpenRouterModelId(displayName as Model);
    if (priceSource === 'openrouter' && !pricingId)
      throw new ViewsApiParamError('priceSource', 'No OpenRouter model configured');
    const pricing =
      priceSource === 'openrouter'
        ? await fetchOpenRouterPricing(pricingId!, AbortSignal.timeout(15000))
        : NORMALIZED_TOKEN_REVENUE_PRICING;

    const params: InferenceViewParams = {
      model: displayName,
      dbModelKeys,
      sequence,
      precisions,
      precisionsExplicit: precisions.length > 0,
      metric,
      xmode,
      xmetric,
      percentile,
      ...(date ? { date } : {}),
      ...(runId ? { runId } : {}),
      gpus,
      vendors,
      frameworks,
      deployment,
      spec,
      optimal,
      best,
      tcoBasis,
      power,
      allPoints,
      userCosts,
      userPowers,
      pricing,
    };

    async function project(rows: BenchmarkRow[], scope: InferenceViewParams) {
      let metrics: DerivedAgenticMetricMap | undefined;
      if (sequence === Sequence.AgenticTraces && xmode === 'e2e-normalized-interactivity') {
        metrics = {};
        const ids = [
          ...new Set(rows.map((row) => row.id).filter((id) => Number.isSafeInteger(id) && id > 0)),
        ];
        for (let i = 0; i < ids.length; i += 200)
          Object.assign(
            metrics,
            await readResponse<DerivedAgenticMetricMap>(
              await derived(
                sourceRequest(request, '/api/v1/derived-agentic-metrics', {
                  ids: ids.slice(i, i + 200).join(','),
                }),
              ),
            ),
          );
      }
      return buildView(rows, scope, metrics);
    }
    const dates = comparisonSelections(search);
    const scopes = dates.map(({ entry, date: comparisonDate, runId: comparisonRunId }) => ({
      entry,
      params: { ...params, date: comparisonDate, runId: comparisonRunId, exact: true },
    }));
    let rows = await fetchRows(params);
    if (
      !date &&
      !runId &&
      dates.length === 0 &&
      !search.has('unofficialrun') &&
      displayName === VR_DEFAULT_RUN.model &&
      sequence === VR_DEFAULT_RUN.sequence &&
      VR_DEFAULT_RUN.enabled &&
      !FIXTURES_MODE
    )
      rows = preferVrDefaultRun(
        rows,
        await getCachedBenchmarks([...dbModelKeys], VR_DEFAULT_RUN.date, true),
      );
    const data = await project(rows, params);
    const comparisons = await Promise.all(
      scopes.map(async (scope) => {
        const comparison = await project(await fetchRows(scope.params), scope.params);
        return { entry: scope.entry, ...comparison.result };
      }),
    );
    const overlayRows = await unofficialRows(request);
    const overlays = await Promise.all(
      [...new Set(overlayRows.map((row) => row.run_url))].map(async (url) => {
        const overlay = await project(
          overlayRows.filter((row) => row.run_url === url),
          params,
        );
        return { runUrl: url, ...overlay.result };
      }),
    );

    const resolvedParams = {
      model: displayName,
      sequence: sequence as string,
      precisions: data.resolvedPrecisions,
      metric,
      xmode,
      xmetric,
      percentile,
      date: date ?? null,
      runId: runId ?? null,
      gpus,
      vendors,
      frameworks,
      deployment,
      spec,
      optimal,
      best,
      format,
      tcoBasis,
      power,
      allPoints,
      userCosts,
      userPowers,
      priceSource,
      dates,
      unofficialrun: search.get('unofficialrun') ?? null,
    };

    if (format === 'csv') {
      return csvResponse([
        ...csvRows(data).map((row) => ({ source: 'official', ...row })),
        ...comparisons.flatMap((item) =>
          csvRows({ ...data, result: item }).map((row) => ({ source: item.entry, ...row })),
        ),
        ...overlays.flatMap((item) =>
          csvRows({ ...data, result: item }).map((row) => ({ source: item.runUrl, ...row })),
        ),
      ]);
    }

    return cachedJson({
      view: 'inference',
      apiVersion: 'v1',
      params: resolvedParams,
      metric: data.result.metric,
      xAxis: data.result.xAxis,
      frontier: data.result.frontier,
      hardware: data.result.hardware,
      series: data.result.series,
      count: data.result.count,
      comparisons,
      overlays,
      pricing,
    });
  });
}
