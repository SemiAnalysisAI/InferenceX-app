import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getGpuMetricsPointRevision } from '@semianalysisai/inferencex-db/queries/gpu-metrics-revision';
import type { NextRequest } from 'next/server';
import {
  getGpuMetricsForPoint,
  type GpuMetricsPointPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { storedPowerSeries } from '@semianalysisai/inferencex-db/power-series/stored-power-series';

import type { GpuPowerSeries } from '@/components/gpu-power/power-series';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { cachedJson, cachedQuery } from '@/lib/cache/api-cache';
import {
  loadSwingStatsFromSeries,
  loadSwingTraceRows,
  NVL72_GPUS_PER_RACK,
  scaleLoadSwingStatsToRack,
  type LoadSwingStats,
} from '@/lib/power/load-swing-stats';
import { csvResponse } from '@/lib/views-api/csv';

import { CACHE_KEY_PREFIX } from '../route';

export const dynamic = 'force-dynamic';

export const LOAD_SWING_SCALES = ['gpu', 'nvl72'] as const;
export type LoadSwingScale = (typeof LOAD_SWING_SCALES)[number];
const FORMATS = ['json', 'csv'] as const;

export const LOAD_SWING_DEFINITIONS = {
  peak_min_delta_ramp: 'whole run, per-GPU mean of each one-second bucket',
  mean_p5_p95_volatility: 'validated serving window only',
  idle_floor: 'P5 of the samples before the serving window starts',
  ramp: 'largest change over a 5-second span divided by that span',
  gaps: 'buckets more than 1.5× the sample interval apart are counted and never bridged',
} as const;

export const LOAD_SWING_CAVEATS = [
  'One-second DCGM samples; sub-second swings are not captured.',
  'Single node or NVL72 rack, inference only.',
  'The NVL72 scale multiplies the per-GPU trace by 72 and assumes every GPU swings together, so it is an upper bound on rack-level swings.',
] as const;

export interface LoadSwingSeriesEntry {
  artifact: string;
  /** Validation window file for bundle sweeps; absent for single-node CSV artifacts. */
  source: string | null;
  gpuCount: number;
  /** Serving window as seconds from the first bucket, or null when none is recorded. */
  window: { startSeconds: number; endSeconds: number } | null;
  stats: LoadSwingStats;
}

export interface LoadSwingResponse {
  benchmarkResultId: number;
  apiVersion: 'v1';
  scale: LoadSwingScale;
  unit: LoadSwingStats['unit'];
  gpusPerRack: number;
  definitions: typeof LOAD_SWING_DEFINITIONS;
  caveats: readonly string[];
  series: LoadSwingSeriesEntry[];
}

const getCachedGpuMetricsForPoint = cachedQuery(
  (id: number, _revision: string): Promise<GpuMetricsPointPayload | null> =>
    getGpuMetricsForPoint(getDb(), id),
  CACHE_KEY_PREFIX,
  { blobOnly: true },
);

function unixSecondsToMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : null;
}

/**
 * The validated serving window of one cut series: the audit whose validation
 * source names the series, or the only audit on the artifact.
 */
export function windowForSeries(
  series: GpuPowerSeries,
  payload: GpuMetricsPointPayload,
): { startMs: number; endMs: number } | null {
  const audits = payload.series
    .filter((entry) => entry.artifactName === series.artifact)
    .flatMap((entry) => entry.powerAudits ?? []);
  const matching = series.source
    ? audits.filter(
        (audit) =>
          typeof audit.source === 'string' &&
          audit.source.slice(audit.source.lastIndexOf('/') + 1) === series.source,
      )
    : audits;
  const audit = matching.length === 1 ? matching[0] : (matching[0] ?? null);
  if (!audit) return null;
  const startMs = unixSecondsToMs(audit.window_start_unix);
  const endMs = unixSecondsToMs(audit.window_end_unix);
  return startMs !== null && endMs !== null && endMs > startMs ? { startMs, endMs } : null;
}

export function buildLoadSwingResponse(
  id: number,
  payload: GpuMetricsPointPayload,
  scale: LoadSwingScale,
): LoadSwingResponse | null {
  const series = storedPowerSeries(payload.series);
  const entries: LoadSwingSeriesEntry[] = [];
  for (const entry of series) {
    const window = windowForSeries(entry, payload);
    const stats = loadSwingStatsFromSeries(entry, window?.startMs ?? null, window?.endMs ?? null);
    if (!stats) continue;
    entries.push({
      artifact: entry.artifact,
      source: entry.source ?? null,
      gpuCount: entry.gpus.length,
      window: window
        ? {
            startSeconds: (window.startMs - entry.startMs) / 1000,
            endSeconds: (window.endMs - entry.startMs) / 1000,
          }
        : null,
      stats: scale === 'nvl72' ? scaleLoadSwingStatsToRack(stats) : stats,
    });
  }
  if (entries.length === 0) return null;
  return {
    benchmarkResultId: id,
    apiVersion: 'v1',
    scale,
    unit: entries[0].stats.unit,
    gpusPerRack: NVL72_GPUS_PER_RACK,
    definitions: LOAD_SWING_DEFINITIONS,
    caveats: LOAD_SWING_CAVEATS,
    series: entries,
  };
}

export function buildLoadSwingCsv(
  payload: GpuMetricsPointPayload,
  scale: LoadSwingScale,
): Record<string, number | string>[] {
  return storedPowerSeries(payload.series).flatMap((entry) => {
    const window = windowForSeries(entry, payload);
    return loadSwingTraceRows(entry, window?.startMs ?? null, window?.endMs ?? null, scale).map(
      (row) => ({ artifact: entry.artifact, source: entry.source ?? '', ...row }),
    );
  });
}

/**
 * GET /api/v1/gpu-metrics-point/stats?id=N[&format=json|csv][&scale=gpu|nvl72]
 *
 * Load-swing statistics of the PowerX power trace recorded while one benchmark
 * point ran, computed from the same stored one-second buckets the Over time
 * view draws and with the same `lib/power/load-swing-stats` function, so the
 * dashboard and the API cannot diverge. `format=csv` returns the per-second
 * trace (per-GPU mean) instead. 404 when the point has no linked telemetry.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const response = await handle(request);
  // The live revision check must run even when a point used to be missing.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function handle(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const id = Number(params.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return publicApiError(PUBLIC_API_ERRORS.idRequired, 400);
  }
  const format = params.get('format') ?? 'json';
  if (!FORMATS.includes(format as (typeof FORMATS)[number])) {
    return publicApiError('format must be json or csv', 400);
  }
  const scale = params.get('scale') ?? 'gpu';
  if (!LOAD_SWING_SCALES.includes(scale as LoadSwingScale)) {
    return publicApiError('scale must be gpu or nvl72', 400);
  }
  try {
    const revision = await getGpuMetricsPointRevision(getDb(), id);
    const payload = revision === null ? null : await getCachedGpuMetricsForPoint(id, revision);
    if (!payload) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    if (format === 'csv') {
      const rows = buildLoadSwingCsv(payload, scale as LoadSwingScale);
      if (rows.length === 0) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
      return csvResponse(rows);
    }
    const body = buildLoadSwingResponse(id, payload, scale as LoadSwingScale);
    if (!body) return publicApiError(PUBLIC_API_ERRORS.notFound, 404);
    return cachedJson(body);
  } catch (error) {
    console.error('Error computing gpu metrics point load-swing stats:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
