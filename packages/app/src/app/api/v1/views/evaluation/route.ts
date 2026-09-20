import { GET as unofficial } from '@/app/api/unofficial-run/route';
import {
  validateParams as validateViewParams,
  parseDateParam,
  parseFormatParam,
  parseFreeListParam,
  parsePrecisionsParam,
  resolveModelParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';
import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getAllEvalResults, type EvalRow } from '@semianalysisai/inferencex-db/queries/evaluations';

import {
  aggregateEvaluationChartRows,
  buildEvaluationChartRows,
} from '@/components/evaluation/chart-data';
import { resolveEvaluationDate } from '@/components/evaluation/date-resolution';
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
    const ids = unofficialrun?.split(',') ?? [];
    if (
      ids.length > 8 ||
      ids.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    )
      throw new ViewsApiParamError(
        'unofficialrun',
        'Expected up to eight positive safe numeric run IDs',
      );
    const overlayResponse =
      ids.length > 0
        ? await readResponse<{ evaluations: EvalRow[] }>(
            await unofficial(
              sourceRequest(request, '/api/unofficial-run', { runId: [...new Set(ids)].join(',') }),
            ),
          )
        : { evaluations: [] };
    const overlayRows = overlayResponse.evaluations;
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

    const chartRows = buildEvaluationChartRows(
      rows,
      benchmark,
      model.displayName,
      precisions,
      date || undefined,
    );

    // n = how many repeated runs (retries/reruns) each aggregated bar averages.
    const groupSizes = new Map<string, number>();
    for (const row of chartRows) {
      const key = `${row.configId}|${row.conc}`;
      groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
    }

    const hardwareWithData = new Set(chartRows.map((row) => String(row.hwKey)));
    const enabled = new Set(
      [...hardwareWithData].filter(
        (key) =>
          gpus.length === 0 ||
          gpus.includes(key.toLowerCase()) ||
          gpus.includes(key.split('_')[0].toLowerCase()),
      ),
    );
    const aggregated = aggregateEvaluationChartRows(chartRows, enabled);

    const outputRows = aggregated.map((row) => ({
      source: 'official',
      hwKey: String(row.hwKey),
      label: row.configLabel,
      score: row.score,
      stderr: row.scoreError,
      n: groupSizes.get(`${row.configId}|${row.conc}`) ?? 1,
      precision: row.precision,
      framework: row.framework,
      date: row.date,
    }));

    for (const runUrl of new Set(overlayRows.map((row) => row.run_url))) {
      const chart = buildEvaluationChartRows(
        overlayRows.filter((row) => row.run_url === runUrl),
        benchmark,
        model.displayName,
        precisions,
      );
      const overlayEnabled = new Set(
        chart
          .map((row) => String(row.hwKey))
          .filter(
            (key) =>
              gpus.length === 0 ||
              gpus.includes(key.toLowerCase()) ||
              gpus.includes(key.split('_')[0].toLowerCase()),
          ),
      );
      const sizes = new Map<string, number>();
      for (const row of chart) {
        const key = `${row.configId}|${row.conc}`;
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
      }
      outputRows.push(
        ...aggregateEvaluationChartRows(chart, overlayEnabled).map((row) => ({
          source: runUrl ?? 'unofficial',
          hwKey: String(row.hwKey),
          label: row.configLabel,
          score: row.score,
          stderr: row.scoreError,
          n: sizes.get(`${row.configId}|${row.conc}`) ?? 1,
          precision: row.precision,
          framework: row.framework,
          date: row.date,
        })),
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
