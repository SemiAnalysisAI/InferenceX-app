import { GET as unofficial } from '@/app/api/unofficial-run/route';
import { GET as benchmarks } from '@/app/api/v1/benchmarks/route';
import {
  buildGpuGroups,
  resolveRowPrecisions,
  type GroupMeta,
  type OverlayGroupMeta,
} from '@/components/calculator/throughput-data';
import { resolveComparisonEntries } from '@/components/inference/utils/comparisonEntry';
import type { BenchmarkRow } from '@/lib/api';
import { DEFAULT_TCO_BASIS } from '@/lib/constants';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { NextRequest } from 'next/server';
import { ViewsApiParamError, ViewsUpstreamError } from './errors';
import {
  parseDateParam,
  parseEnumParam,
  parseFreeListParam,
  parseNumberParam,
  parsePrecisionsParam,
  parseSequenceParam,
  resolveModelParam,
} from './params';

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
  const runId = search.has('runId')
    ? String(parseNumberParam(search.get('runId'), 'runId', 0, { min: 1, integer: true }))
    : undefined;
  const percentile = parseEnumParam(
    search.get('percentile'),
    'percentile',
    [Percentile.P75, Percentile.P90],
    Percentile.P90,
  );
  const tcoBasis = parseEnumParam(
    search.get('tcoBasis'),
    'tcoBasis',
    ['internal', 'external'],
    DEFAULT_TCO_BASIS,
  );
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
    const runId = match.groups!.run
      ? String(parseNumberParam(match.groups!.run, 'dates', 0, { min: 1, integer: true }))
      : undefined;
    return { entry, date, runId };
  });
}

export async function benchmarkRows(
  request: NextRequest,
  params: Pick<ViewSelection, 'model' | 'date' | 'runId'>,
): Promise<BenchmarkRow[]> {
  return readResponse(
    await benchmarks(
      sourceRequest(request, '/api/v1/benchmarks', {
        model: params.model,
        date: params.date,
        runId: params.runId,
        exactRun: params.runId ? 'true' : undefined,
      }),
    ),
  );
}

export function matchesHardware(hw: string, gpus: readonly string[]) {
  return (
    gpus.length === 0 ||
    gpus.some((g) => hw.toLowerCase() === g || hw.toLowerCase().split('_')[0] === g)
  );
}

export async function calculatorGroups(request: NextRequest, params: ViewSelection) {
  const rows = await benchmarkRows(request, params);
  const precisions = resolveRowPrecisions(rows, params.sequence, params.precisions);
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
  const overlayRows = await unofficialRows(request);
  const overlayIds = (request.nextUrl.searchParams.get('unofficialrun') ?? '').split(',');
  const overlay = buildGpuGroups<OverlayGroupMeta>(overlayRows, {
    ...options,
    classify: (hwKey, row) =>
      matchesHardware(hwKey, params.gpus)
        ? {
            key: `run:${row.run_url}:${hwKey}:${row.precision}`,
            meta: {
              hwKey,
              precision: precisions.length > 1 ? row.precision : undefined,
              runIndex: Math.max(
                0,
                overlayIds.findIndex((id) => row.run_url?.endsWith(`/runs/${id}`)),
              ),
            },
          }
        : null,
  });
  return { rows, params: { ...params, precisions }, official, overlay };
}

export async function unofficialRows(request: NextRequest): Promise<BenchmarkRow[]> {
  const raw = request.nextUrl.searchParams.get('unofficialrun');
  if (!raw) return [];
  const ids = raw.split(',');
  if (
    ids.length > 8 ||
    ids.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
  )
    throw new ViewsApiParamError(
      'unofficialrun',
      'Expected up to eight positive safe numeric run IDs',
    );
  const data = await readResponse<{ benchmarks: BenchmarkRow[] }>(
    await unofficial(
      sourceRequest(request, '/api/unofficial-run', { runId: [...new Set(ids)].join(',') }),
    ),
  );
  const model = resolveModelParam(request.nextUrl.searchParams.get('model'));
  return data.benchmarks.filter((row) =>
    (model.dbModelKeys as readonly string[]).includes(row.model),
  );
}
