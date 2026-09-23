import { GET as unofficial } from '@/app/api/unofficial-run/route';
import { GET as benchmarks } from '@/app/api/v1/benchmarks/route';
import {
  buildGpuGroups,
  resolveRowPrecisions,
  type GroupMeta,
  type OverlayGroupMeta,
} from '@/components/calculator/throughput-data';
import { resolveComparisonEntries } from '@/components/inference/utils/comparisonEntry';
import type { BenchmarkRow, EvalRow } from '@/lib/api';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { overlayRunIndex } from '@/lib/overlay-run-style';
import { NextRequest } from 'next/server';
import { ViewsApiParamError, ViewsUpstreamError } from './errors';
import {
  CALCULATOR_PERCENTILE_VALUES,
  matchesHardware,
  parseDateParam,
  parseEnumParam,
  parseFreeListParam,
  parsePrecisionsParam,
  parseRunIdListParam,
  parseRunIdParam,
  parseSequenceParam,
  parseTcoBasisParam,
  resolveModelParam,
} from './params';

export { CALCULATOR_PERCENTILE_VALUES, matchesHardware };

/** Call only fixed, first-party GET handlers. No caller-controlled host or fetch URL. */
export function sourceRequest(
  request: NextRequest,
  path: string,
  params: Record<string, string | undefined> = {},
) {
  const url = new URL(path, request.url);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) url.searchParams.set(key, value);
  return new NextRequest(url);
}

export function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new ViewsUpstreamError(response.status);
  // Direct route calls do not get fetch's transparent content decoding.
  // cachedJson emits compressed bytes, even when called without an HTTP hop.
  if (response.headers.get('Content-Encoding') === 'gzip' && response.body) {
    return new Response(
      response.body.pipeThrough(new DecompressionStream('gzip')),
    ).json() as Promise<T>;
  }
  return response.json() as Promise<T>;
}

export function selection(search: URLSearchParams, fallback = Sequence.AgenticTraces) {
  const { displayName: model } = resolveModelParam(search.get('model'));
  const sequence = parseSequenceParam(search.get('sequence'), fallback);
  const date = parseDateParam(search.get('date'), 'date');
  const runId = parseRunIdParam(search.get('runId'));
  const percentile = parseEnumParam(
    search.get('percentile'),
    'percentile',
    CALCULATOR_PERCENTILE_VALUES,
    Percentile.P90,
  );
  const tcoBasis = parseTcoBasisParam(search.get('tcoBasis'));
  const precisions = parsePrecisionsParam(search.get('precisions'));
  const gpus = parseFreeListParam(search.get('gpus'));
  return { model, sequence, date, runId, percentile, tcoBasis, precisions, gpus };
}
export type ViewSelection = Omit<ReturnType<typeof selection>, 'precisions'> & {
  precisions: string[];
};

export function comparisonSelections(search: URLSearchParams) {
  const startDate = parseDateParam(search.get('start'), 'start') ?? '';
  const endDate = parseDateParam(search.get('end'), 'end') ?? '';
  if (startDate && endDate && startDate > endDate)
    throw new ViewsApiParamError('end', 'end must not precede start');
  if (Boolean(startDate) !== Boolean(endDate))
    throw new ViewsApiParamError('start', 'Provide both start and end');
  const raw = search.get('dates')?.split(',').filter(Boolean) ?? [];
  const entries = resolveComparisonEntries(raw, { startDate, endDate });
  if (entries.length > 12)
    throw new ViewsApiParamError('dates', 'At most twelve comparison entries are supported');
  return entries.map((entry) => {
    const match = /^(?<date>\d{4}-\d{2}-\d{2})(?:~r(?<run>[1-9]\d*))?$/.exec(entry);
    if (!match) throw new ViewsApiParamError('dates', 'Use YYYY-MM-DD or YYYY-MM-DD~rRUN_ID');
    const date = parseDateParam(match.groups!.date, 'dates')!;
    const runId = parseRunIdParam(match.groups!.run ?? null, 'dates');
    return { entry, date, runId };
  });
}

export async function benchmarkRows(
  request: NextRequest,
  params: Pick<ViewSelection, 'model' | 'date' | 'runId'>,
  options: { exactDate?: boolean } = {},
): Promise<BenchmarkRow[]> {
  return readResponse(
    await benchmarks(
      sourceRequest(request, '/api/v1/benchmarks', {
        model: params.model,
        date: params.date,
        exact: options.exactDate && !params.runId ? 'true' : undefined,
        runId: params.runId,
        exactRun: params.runId ? 'true' : undefined,
      }),
    ),
  );
}

// Extensions retain raw telemetry for modeled-power estimates and carry overlay
// runIndex metadata for cache-reuse series. The calculator route uses trimmed
// rows and source-tagged keys; both paths share buildGpuGroups for the math.
export async function calculatorGroups(
  request: NextRequest,
  params: ViewSelection,
  sourceOptions: {
    exactDate?: boolean;
    overlayRows?: BenchmarkRow[];
    includeOverlay?: boolean;
  } = {},
) {
  const rows = await benchmarkRows(request, params, sourceOptions);
  // Comparisons reuse the primary overlay rows for precision resolution only.
  const overlayRows = sourceOptions.overlayRows ?? (await unofficialRows(request));
  const precisions = resolveRowPrecisions(
    rows,
    params.sequence,
    params.precisions,
    overlayRows,
    params.model,
  );
  const options = { ...params, precisions };
  const official = buildGpuGroups<GroupMeta>(rows, {
    ...options,
    classify: (hwKey, row) =>
      matchesHardware(hwKey, params.gpus)
        ? {
            key: precisions.length > 1 ? `${hwKey}__${row.precision}` : hwKey,
            meta: { hwKey, precision: precisions.length > 1 ? row.precision : undefined },
          }
        : null,
  });
  const overlayIds = parseRunIdListParam(
    request.nextUrl.searchParams.get('unofficialrun'),
    'unofficialrun',
  );
  const runIndexById = Object.fromEntries(overlayIds.map((id, index) => [id, index]));
  const overlay = buildGpuGroups<OverlayGroupMeta>(
    sourceOptions.includeOverlay === false ? [] : overlayRows,
    {
      ...options,
      classify: (hwKey, row) =>
        matchesHardware(hwKey, params.gpus)
          ? {
              key: `run:${row.run_url}:${hwKey}:${row.precision}`,
              meta: {
                hwKey,
                precision: precisions.length > 1 ? row.precision : undefined,
                runIndex: overlayRunIndex(row.run_url, runIndexById),
              },
            }
          : null,
    },
  );
  return { rows, overlayRows, params: { ...params, precisions }, official, overlay };
}

export interface UnofficialRunPayload {
  readonly benchmarks: BenchmarkRow[];
  readonly evaluations: EvalRow[];
}

const EMPTY_UNOFFICIAL: UnofficialRunPayload = { benchmarks: [], evaluations: [] };

/**
 * Overlay rows for `unofficialrun=` (up to eight run ids) from the first-party
 * `/api/unofficial-run` handler. Returns both payload halves so the benchmark
 * views and the evaluation view share one validation and one upstream call.
 */
export async function unofficialRunPayload(
  request: NextRequest,
  param = 'unofficialrun',
): Promise<UnofficialRunPayload> {
  const ids = parseRunIdListParam(request.nextUrl.searchParams.get(param), param);
  if (ids.length === 0) return EMPTY_UNOFFICIAL;
  return readResponse<UnofficialRunPayload>(
    await unofficial(sourceRequest(request, '/api/unofficial-run', { runId: ids.join(',') })),
  );
}

/** Unofficial-run benchmark rows narrowed to the request's `model=`. */
export async function unofficialRows(request: NextRequest): Promise<BenchmarkRow[]> {
  const { benchmarks: overlayRows } = await unofficialRunPayload(request);
  if (overlayRows.length === 0) return [];
  const model = resolveModelParam(request.nextUrl.searchParams.get('model'));
  return overlayRows.filter((row) => (model.dbModelKeys as readonly string[]).includes(row.model));
}
