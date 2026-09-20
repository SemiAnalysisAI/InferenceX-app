import {
  validateParams as validateViewParams,
  matchesHardware,
  parseDateParam,
  parseFormatParam,
  parseFreeListParam,
  parsePrecisionsParam,
  resolveModelParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { unofficialRunPayload } from '@/lib/views-api/source';
import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllEvalResults, type EvalRow } from '@semianalysisai/inferencex-db/queries/evaluations';

import {
  aggregateEvaluationChartRows,
  buildEvaluationChartRows,
} from '@/components/evaluation/chart-data';
import { resolveEvaluationDate } from '@/components/evaluation/date-resolution';
import type { EvaluationChartData } from '@/components/evaluation/types';
import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/evaluation
 *
 * Aggregated evaluation chart rows for a model, benchmark, and run date — the
 * same latest-per-config, retry-averaged bars the `/evaluation` dashboard
 * renders, computed by the shared `buildEvaluationChartRows` +
 * `aggregateEvaluationChartRows` (components/evaluation/chart-data).
 *
 * Query params:
 * - model      — required; display name (case-insensitive) or compare slug.
 * - benchmark  — eval task key; default: first available benchmark for the
 *                model (alphabetical). Unknown values are a 400 listing the
 *                model's available benchmarks.
 * - date       — `YYYY-MM-DD`; resolved to the nearest available eval date
 *                like the dashboard (`resolveEvaluationDate`). Default:
 *                latest available date.
 * - precisions — comma list (`fp4,fp8,...`); default: every precision present
 *                in the model's eval rows.
 * - format     — `json` (default) or `csv` (one flat row per config).
 */

// Same cache key as /api/v1/evaluations: both routes read the identical raw
// eval_results rows, so they intentionally share one cached payload.
const getCachedEvalRows = cachedQuery(() => getAllEvalResults(getDb()), 'evaluations');

interface EvaluationBar {
  source: string;
  hwKey: string;
  label: string;
  score: EvaluationChartData['score'];
  stderr: EvaluationChartData['scoreError'];
  n: number;
  precision: EvaluationChartData['precision'];
  framework: EvaluationChartData['framework'];
  date: EvaluationChartData['date'];
}

/**
 * One source's bars: the dashboard's latest-per-config → retry-averaged
 * pipeline over `sourceRows`, narrowed to the `gpus` filter, with `n` = how
 * many repeated runs (retries/reruns) each aggregated bar averages. Official
 * rows pass the resolved snapshot date; an unofficial run is a single snapshot.
 */
function aggregatedBars(
  source: string,
  sourceRows: EvalRow[],
  selection: {
    benchmark: string | undefined;
    model: string;
    precisions: string[];
    gpus: string[];
  },
  date?: string,
): EvaluationBar[] {
  const chartRows = buildEvaluationChartRows(
    sourceRows,
    selection.benchmark,
    selection.model,
    selection.precisions,
    date,
  );
  const groupSizes = new Map<string, number>();
  for (const row of chartRows) {
    const key = `${row.configId}|${row.conc}`;
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  const enabled = new Set(
    chartRows.map((row) => String(row.hwKey)).filter((key) => matchesHardware(key, selection.gpus)),
  );
  return aggregateEvaluationChartRows(chartRows, enabled).map((row) => ({
    source,
    hwKey: String(row.hwKey),
    label: row.configLabel,
    score: row.score,
    stderr: row.scoreError,
    n: groupSizes.get(`${row.configId}|${row.conc}`) ?? 1,
    precision: row.precision,
    framework: row.framework,
    date: row.date,
  }));
}

export function GET(request: NextRequest) {
  return runViewsRoute('evaluation', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['evaluation']);
    const search = request.nextUrl.searchParams;
    const model = resolveModelParam(search.get('model'));
    const requestedDate = parseDateParam(search.get('date'), 'date');
    const requestedPrecisions = parsePrecisionsParam(search.get('precisions'));
    const format = parseFormatParam(search.get('format'));
    const gpus = parseFreeListParam(search.get('gpus'));

    const rows = FIXTURES_MODE ? loadFixture<EvalRow[]>('evaluations') : await getCachedEvalRows();

    const unofficialrun = search.get('unofficialrun');
    const { evaluations: overlayRows } = await unofficialRunPayload(request);
    const modelRows = [...rows, ...overlayRows].filter((row) =>
      model.dbModelKeys.includes(row.model),
    );
    const benchmarks = [...new Set(modelRows.map((row) => row.task))].toSorted();

    const requestedBenchmark = search.get('benchmark');
    if (requestedBenchmark && !benchmarks.includes(requestedBenchmark)) {
      throw new ViewsApiParamError(
        'benchmark',
        `Unknown benchmark for ${model.displayName}: ${requestedBenchmark}`,
        benchmarks,
      );
    }
    const benchmark = requestedBenchmark ?? benchmarks[0];

    const availableDates = [
      ...new Set(
        rows
          .filter((row) => model.dbModelKeys.includes(row.model))
          .map((row) => row.date)
          .filter(Boolean),
      ),
    ].toSorted();
    const date = resolveEvaluationDate(requestedDate ?? '', availableDates);

    const precisions =
      requestedPrecisions.length > 0
        ? requestedPrecisions
        : [...new Set(modelRows.map((row) => row.precision))].toSorted();

    const selection = { benchmark, model: model.displayName, precisions, gpus };
    const outputRows = aggregatedBars('official', rows, selection, date || undefined);
    for (const runUrl of new Set(overlayRows.map((row) => row.run_url))) {
      outputRows.push(
        ...aggregatedBars(
          runUrl ?? 'unofficial',
          overlayRows.filter((row) => row.run_url === runUrl),
          selection,
        ),
      );
    }
    const params = {
      model: model.displayName,
      benchmark: benchmark ?? null,
      date: date || null,
      precisions,
      gpus,
      unofficialrun,
      format,
    };

    if (format === 'csv') {
      return csvResponse(
        outputRows.map((row) => ({ ...row, label: row.label.replaceAll('\n', ' ') })),
      );
    }

    return cachedJson({
      view: 'evaluation',
      apiVersion: 'v1',
      params,
      benchmarks,
      rows: outputRows,
    });
  });
}
