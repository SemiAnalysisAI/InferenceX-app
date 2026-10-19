import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getGpuMetricsForRun,
  type GpuMetricsRunPayload,
  type GpuMetricsRunSelection,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import type { GpuPowerRunInfo, GpuPowerApiResponse } from '@/components/gpu-power/types';
import { bucketPowerFiles, type GpuPowerSeries } from '@/components/gpu-power/power-series';
import {
  storedPowerSeries,
  StoredTelemetryIncompleteError,
} from '@/components/gpu-power/stored-power-series';
import { ARTIFACT_PREFIX } from './artifact-selection';
import { fetchGpuMetricsFromGithub } from './github-telemetry';

export const maxDuration = 300;
const PREFIX_PATTERN = /^[A-Za-z0-9._-]{1,200}$/u;
const SOURCE_PATTERN = /^power_validation_[A-Za-z0-9._-]{1,200}\.json$/u;
const MAX_REQUEST_BYTES = 256 * 1024;

export type GpuMetricsSource = 'database' | 'github';

export interface GpuMetricsRouteResponse extends GpuPowerApiResponse {
  source: GpuMetricsSource;
  artifactNames?: string[];
  coverage?: GpuMetricsRunPayload['coverage'];
}

export function databasePayloadToResponse(payload: GpuMetricsRunPayload): GpuMetricsRouteResponse {
  const run = payload.workflowRun;
  const filesPerArtifact = new Map<string, number>();
  for (const series of payload.series) {
    filesPerArtifact.set(series.artifactName, (filesPerArtifact.get(series.artifactName) ?? 0) + 1);
  }
  return {
    source: 'database',
    coverage: payload.coverage,
    ...(payload.artifactNames ? { artifactNames: payload.artifactNames } : {}),
    runInfo: {
      id: run.githubRunId,
      name: run.name,
      branch: run.headBranch ?? '',
      sha: run.headSha ?? '',
      createdAt: run.createdAt ?? `${run.date}T00:00:00Z`,
      url:
        run.htmlUrl ??
        `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.githubRunId}`,
      conclusion: run.conclusion ?? '',
      status: run.status ?? '',
    },
    artifacts: payload.series.map(({ data, ...series }) => ({
      name:
        (filesPerArtifact.get(series.artifactName) ?? 1) > 1 ||
        payload.artifactNames?.includes(`${series.artifactName}/${series.fileName}`)
          ? `${series.artifactName}/${series.fileName}`
          : series.artifactName,
      data,
      series,
    })),
  };
}

function seriesSource(series: GpuPowerSeries): string | null {
  return (
    series.source ??
    (series.artifact.startsWith(ARTIFACT_PREFIX)
      ? `power_validation_${series.artifact.slice(ARTIFACT_PREFIX.length)}.json`
      : null)
  );
}

function sourceCoverage(series: GpuPowerSeries[], sources: string[] | null) {
  const available = new Set(series.map(seriesSource));
  const missingSources = sources?.filter((source) => !available.has(source)) ?? [];
  return {
    status: sources === null ? 'unknown' : missingSources.length > 0 ? 'incomplete' : 'complete',
    missingSources,
  };
}

function powerSeriesResponse(
  source: GpuMetricsSource,
  runInfo: GpuPowerRunInfo,
  series: GpuPowerSeries[],
  sources: string[] | null,
) {
  return NextResponse.json(
    { source, runInfo, series, sourceCoverage: sourceCoverage(series, sources) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function fetchGpuMetricsFromDatabase(
  runId: number,
  selection: GpuMetricsRunSelection,
): Promise<GpuMetricsRouteResponse | null> {
  if (!process.env.DATABASE_READONLY_URL) return null;
  const payload = await getGpuMetricsForRun(getDb(), runId, selection);
  return payload ? databasePayloadToResponse(payload) : null;
}

export function GET(request: NextRequest) {
  return readGpuMetrics(request, null);
}

export function readGpuMetricsForView(request: NextRequest, artifact: string | null) {
  return readGpuMetrics(request, null, artifact);
}

export async function POST(request: NextRequest) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_REQUEST_BYTES) {
          await reader.cancel();
          return NextResponse.json({ error: 'Request body exceeds 256 KiB' }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const sources =
      body && typeof body === 'object' && !Array.isArray(body) && 'sources' in body
        ? body.sources
        : null;
    if (
      !Array.isArray(sources) ||
      sources.length === 0 ||
      sources.length > 1000 ||
      !sources.every(
        (source): source is string => typeof source === 'string' && SOURCE_PATTERN.test(source),
      )
    ) {
      return NextResponse.json(
        { error: 'sources must contain 1–1000 power_validation_<RESULT_FILENAME>.json basenames' },
        { status: 400 },
      );
    }
    if (request.nextUrl.searchParams.get('series') !== 'power') {
      return NextResponse.json({ error: 'POST requires series=power' }, { status: 400 });
    }
    const prefix = request.nextUrl.searchParams.get('prefix');
    if (
      prefix !== null &&
      sources.some((source) => !source.startsWith(`power_validation_${prefix}`))
    ) {
      return NextResponse.json({ error: 'Every source must match prefix' }, { status: 400 });
    }
    return readGpuMetrics(request, [...new Set(sources)].sort());
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  } finally {
    reader?.releaseLock();
  }
}

async function readGpuMetrics(
  request: NextRequest,
  sources: string[] | null,
  selectedArtifact?: string | null,
) {
  const params = request.nextUrl.searchParams;
  const runId = params.get('runId');
  const numericRunId = Number(runId);

  if (!runId || !/^\d+$/u.test(runId) || !Number.isSafeInteger(numericRunId) || numericRunId <= 0) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }
  const prefix = params.get('prefix');
  if (prefix !== null && !PREFIX_PATTERN.test(prefix)) {
    return NextResponse.json(
      { error: 'prefix must be a RESULT_FILENAME prefix (letters, digits, . _ -)' },
      { status: 400 },
    );
  }
  const series = params.get('series');
  if (series !== null && series !== 'power') {
    return NextResponse.json({ error: 'series must be "power" when present' }, { status: 400 });
  }

  let stored: GpuMetricsRouteResponse | null;
  try {
    stored = await fetchGpuMetricsFromDatabase(numericRunId, {
      prefix,
      sourceResults:
        sources?.map((source) => source.slice('power_validation_'.length, -'.json'.length)) ?? null,
      ...(selectedArtifact === undefined ? {} : { artifact: selectedArtifact }),
    });
  } catch (error) {
    console.error(`gpu-metrics: database lookup failed for run ${runId}:`, error);
    return NextResponse.json(
      {
        error: 'Stored telemetry is temporarily unavailable. Retry the request.',
        code: 'DATABASE_UNAVAILABLE',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    if (stored) {
      if (series !== 'power')
        return NextResponse.json(stored, { headers: { 'Cache-Control': 'no-store' } });
      const storedSeries = storedPowerSeries(
        stored.artifacts.flatMap((artifact) =>
          artifact.series ? [{ ...artifact.series, data: artifact.data }] : [],
        ),
      ).filter((entry) => sources === null || sources.includes(seriesSource(entry) ?? ''));
      return powerSeriesResponse('database', stored.runInfo, storedSeries, sources);
    }
    if (series === 'power') {
      const { runInfo, artifacts, bundleSeries } = await fetchGpuMetricsFromGithub(
        runId,
        prefix,
        true,
        sources,
      );
      const powerSeries = artifacts
        .map((artifact) => bucketPowerFiles(artifact.name, artifact.files))
        .filter((entry): entry is GpuPowerSeries => entry !== null);
      const seenSources = new Set<string>();
      const liveSeries: GpuPowerSeries[] = [];
      for (const entry of [...powerSeries, ...bundleSeries]) {
        const source = seriesSource(entry);
        if (sources !== null && !sources.includes(source ?? '')) continue;
        if (source !== null && seenSources.has(source)) continue;
        liveSeries.push(entry);
        if (source !== null) seenSources.add(source);
      }
      return powerSeriesResponse('github', runInfo, liveSeries, sources);
    }
    const live = await fetchGpuMetricsFromGithub(runId, prefix, false);
    return NextResponse.json(
      {
        source: live.source,
        runInfo: live.runInfo,
        artifacts: live.artifacts.flatMap(({ name, files }) =>
          files.map((file) => ({
            name: files.length > 1 ? `${name}/${file.name}` : name,
            data: file.data,
          })),
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    const missing = error instanceof StoredTelemetryIncompleteError ? error : null;
    return NextResponse.json(
      missing
        ? {
            error: missing.message,
            code: 'STORED_TELEMETRY_INCOMPLETE',
            artifact: missing.artifact,
          }
        : { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: missing ? 503 : 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
