import type { NextRequest } from 'next/server';

import { rowToSequence } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getBenchmarksForRun,
  getLatestBenchmarks,
  type BenchmarkRow,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { X_AXIS_MODES, type XAxisMode } from '@/components/inference/hooks/chart-data-core';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { cachedDerivedData, cachedJson, cachedQuery } from '@/lib/api-cache';
import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { PERCENTILE_OPTIONS, Percentile, Sequence } from '@/lib/data-mappings';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute } from '@/lib/views-api/errors';
import {
  parseBoolParam,
  parseDateParam,
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseListParam,
  parseMetricParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
} from '@/lib/views-api/params';
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

const VENDOR_VALUES = ['AMD', 'NVIDIA'] as const;
const FRAMEWORK_FAMILY_VALUES = FRAMEWORK_FAMILIES.map((family) => family.key).toSorted();
const DEPLOYMENT_VALUES = ['agg', 'disagg', 'multi-node', 'single-node'] as const;
const SPEC_VALUES = ['mtp', 'stp'] as const;
const XMETRIC_VALUES = ['median_ttft', 'p75_ttft', 'p90_ttft', 'p95_ttft', 'p99_ttft'] as const;

// Same cache keys and argument shapes as /api/v1/benchmarks so both routes
// share one cached copy of the raw rows.
const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[], date?: string, exact?: boolean, runId?: string) =>
    getLatestBenchmarks(getDb(), dbModelKeys, date, exact, runId),
  'benchmarks-agentic-run-metadata',
  { blobOnly: true },
);
const getCachedBenchmarksForRun = cachedQuery(
  (dbModelKeys: string[], runId: string) => getBenchmarksForRun(getDb(), dbModelKeys, runId),
  'benchmarks-run-agentic-run-metadata',
  { blobOnly: true },
);

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
  readonly runId?: string;
  readonly gpus: readonly string[];
  readonly vendors: readonly string[];
  readonly frameworks: readonly string[];
  readonly deployment: readonly string[];
  readonly spec: readonly string[];
  readonly optimal: boolean;
  readonly best: boolean;
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
  return getCachedBenchmarks([...params.dbModelKeys], params.date);
}

function buildView(rows: readonly BenchmarkRow[], params: InferenceViewParams): InferenceViewData {
  // Precision auto-resolution runs against the sequence-scoped rows, exactly
  // like the dashboard's densest-precision default.
  const seqRows = rows.filter((row) => rowToSequence(row) === params.sequence);
  const availablePrecisions = [...new Set(seqRows.map((row) => row.precision))].toSorted();
  const resolvedPrecisions = resolveEffectivePrecisions({
    selectedPrecisions: [...params.precisions],
    availablePrecisions,
    curveCounts: countCurvesByPrecision(seqRows),
    explicit: params.precisionsExplicit,
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
    },
    optimal: params.optimal,
    best: params.best,
  });

  return { resolvedPrecisions, result };
}

// Derived view cached on the canonical resolved params (lists arrive sorted
// and deduplicated from the parsers, so logically identical requests share
// one cache key). The raw-row fetch beneath is itself cached per model/date.
const getCachedInferenceView = cachedDerivedData(async (canonicalParams: string) => {
  const params = JSON.parse(canonicalParams) as InferenceViewParams;
  const rows = await fetchRows(params);
  return buildView(rows, params);
}, 'views-inference');

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
      requestedXMode === 'e2e-normalized-interactivity' ? 'interactivity' : requestedXMode;
    const xmetric = parseEnumParam(search.get('xmetric'), 'xmetric', XMETRIC_VALUES, 'p90_ttft');
    const percentile = parseEnumParam(
      search.get('percentile'),
      'percentile',
      PERCENTILE_OPTIONS,
      Percentile.P90,
    );
    const date = parseDateParam(search.get('date'), 'date');
    const runIdValue = search.get('runId');
    const runId =
      runIdValue === null || runIdValue === ''
        ? undefined
        : String(parseNumberParam(runIdValue, 'runId', 0, { integer: true, min: 1 }));
    const gpus = parseFreeListParam(search.get('gpus'));
    const vendors = parseListParam(search.get('vendors'), 'vendors', VENDOR_VALUES);
    const frameworks = parseListParam(
      search.get('frameworks'),
      'frameworks',
      FRAMEWORK_FAMILY_VALUES,
    );
    // Legacy `agg` expands to both aggregate modes, mirroring shared dashboard links.
    const deployment = [
      ...new Set(
        parseListParam(search.get('deployment'), 'deployment', DEPLOYMENT_VALUES).flatMap((mode) =>
          mode === 'agg' ? (['multi-node', 'single-node'] as const) : [mode],
        ),
      ),
    ].toSorted();
    const spec = parseListParam(search.get('spec'), 'spec', SPEC_VALUES);
    const optimal = parseBoolParam(search.get('optimal'), 'optimal', false);
    const best = parseBoolParam(search.get('best'), 'best', false);
    const format = parseFormatParam(search.get('format'));

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
    };

    const canonicalParams = JSON.stringify(params);
    const data = FIXTURES_MODE
      ? buildView(await fetchRows(params), params)
      : await getCachedInferenceView(canonicalParams);

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
    };

    if (format === 'csv') {
      return csvResponse(csvRows(data));
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
    });
  });
}
