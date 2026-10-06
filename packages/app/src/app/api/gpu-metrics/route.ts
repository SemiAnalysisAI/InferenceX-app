/**
 * PowerX telemetry for one GitHub Actions run.
 *
 * Reads the ingest-time telemetry digest first (migration 016: series,
 * samples, per-GPU statistics, point links). Runs that have not been ingested
 * yet, including runs still in progress, fall back to the live GitHub
 * artifacts exactly as before.
 *
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route. The
 * fallback fetches live GitHub Actions artifacts which change while a run is
 * in progress, and stored telemetry must reflect a successful re-ingest immediately.
 *
 * Two telemetry collectors publish GPU power for a run:
 * - single-node runners (nvidia-smi / amd-smi) publish one `gpu_metrics_<RESULT_FILENAME>`
 *   CSV artifact per benchmark config;
 * - Slurm / Dynamo disaggregated runners (DCGM) publish one `power_audit_<RESULT_FILENAME>`
 *   bundle per concurrency sweep, holding the sweep's samples plus one
 *   `power_validation_*.json` window per config
 *   (`components/gpu-power/power-audit-bundle.ts`).
 *
 * Two response shapes:
 * - default: every `gpu_metrics_*` artifact's parsed rows (the `/gpu-metrics`
 *   page), from the stored digest when the run is ingested, else from GitHub;
 *   bundles are ignored on the GitHub path;
 * - `series=power`: compact per-GPU watt series bucketed to one second
 *   (`components/gpu-power/power-series.ts`) for the PowerX timeline, from
 *   CSV artifacts and from bundles cut per validation window. The timeline
 *   joins them to chart points by `source` (bundle) or artifact name (CSV).
 *   Persisted samples and validation windows use the same bucketing/cut
 *   transform as artifacts, so historical runs survive artifact expiry.
 * `prefix=<RESULT_FILENAME prefix>` narrows either shape to the artifacts of
 * one model / workload / precision so a full nightly sweep is not downloaded
 * for one chart. A bundle names a whole sweep, so it also matches when the
 * prefix extends past its name into the per-concurrency suffix.
 * Timeline POSTs sorted validation basenames in `{ sources: [...] }` to recover
 * missing siblings while keeping fully covered DB reads independent of GitHub.
 * `sourceCoverage` describes those requested identities, not full-run completeness.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getGpuMetricsForRun,
  type GpuMetricsRunPayload,
  type GpuMetricsRunSelection,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import type {
  GpuPowerRunInfo,
  GpuMetricsArtifact,
  GpuPowerApiResponse,
} from '@/components/gpu-power/types';
import {
  bucketPowerFiles,
  parseTelemetryTimestampUtc,
  type GpuPowerSeries,
} from '@/components/gpu-power/power-series';
import {
  storedPowerSeries,
  StoredTelemetryIncompleteError,
} from '@/components/gpu-power/stored-power-series';
import { ARTIFACT_PREFIX, isWantedBundle, isRequestedArtifact } from './artifact-selection';
import { fetchGpuMetricsFromGithub, type GithubArtifactPayload } from './github-telemetry';

/** Bundle downloads are latency-bound; match the other artifact routes' budget. */
export const maxDuration = 300;
/** RESULT_FILENAME characters: model, workload, precision, framework, parallelism, host, hash. */
const PREFIX_PATTERN = /^[A-Za-z0-9._-]{1,200}$/u;
const SOURCE_PATTERN = /^power_validation_[A-Za-z0-9._-]{1,200}\.json$/u;
const MAX_REQUEST_BYTES = 256 * 1024;

export type GpuMetricsSource = 'database' | 'github';

export type GpuMetricsArtifactPayload = GpuMetricsArtifact;

export interface GpuMetricsRouteResponse extends GpuPowerApiResponse {
  source: GpuMetricsSource;
  artifactNames?: string[];
}

/** Shape the stored digest like the GitHub payload so the explorer is source-agnostic. */
export function databasePayloadToResponse(payload: GpuMetricsRunPayload): GpuMetricsRouteResponse {
  const run = payload.workflowRun;
  const filesPerArtifact = new Map<string, number>();
  for (const series of payload.series) {
    filesPerArtifact.set(series.artifactName, (filesPerArtifact.get(series.artifactName) ?? 0) + 1);
  }
  return {
    source: 'database',
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
      // Multinode uploads carry one CSV per node; keep them distinguishable.
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

/** Validation basenames identify individual windows, including siblings in one bundle. */
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

/**
 * Narrows a stored run to the artifacts a `prefix` names, mirroring the GitHub
 * listing filter so both sources answer the same request the same way.
 */
function filterArtifactsByPrefix(
  artifacts: GpuMetricsArtifactPayload[],
  prefix: string | null,
): GpuMetricsArtifactPayload[] {
  if (prefix === null) return artifacts;
  const wanted = `${ARTIFACT_PREFIX}${prefix}`;
  return artifacts.filter((artifact) => {
    const name = artifact.series?.artifactName ?? artifact.name;
    return name.startsWith(wanted) || isWantedBundle(name, prefix);
  });
}

/** A live artifact repairs a stored gap only when its retained file/sample inventory matches. */
function assertStoredArtifactsRecovered(
  stored: GpuMetricsRouteResponse | null,
  artifacts: GithubArtifactPayload[],
  incomplete: StoredTelemetryIncompleteError[],
): void {
  for (const missing of incomplete) {
    const incompleteArtifact = missing.artifact;
    const live = artifacts.find((artifact) => artifact.name === incompleteArtifact);
    const inventory = stored?.artifacts.find(
      (artifact) => artifact.series?.artifactName === incompleteArtifact,
    )?.series?.sidecars.seriesInventory;
    // A matching name alone cannot prove that missing hosts/samples recovered.
    // Bundle cuts do not retain the raw inventory, so known-incomplete bundles
    // require re-ingest; ordinary un-ingested bundle fallback stays available.
    if (!live || !Array.isArray(inventory) || inventory.length === 0) throw missing;
    const counts = new Map(
      live.files.map((file) => [
        file.name,
        new Set(
          file.data.flatMap((row) => {
            const time = parseTelemetryTimestampUtc(row.timestamp);
            return time === null || !Number.isInteger(row.index) ? [] : [`${row.index}:${time}`];
          }),
        ).size,
      ]),
    );
    if (
      !inventory.every(
        (expected) =>
          expected !== null &&
          typeof expected === 'object' &&
          typeof expected.fileName === 'string' &&
          typeof expected.sampleCount === 'number' &&
          counts.get(expected.fileName) === expected.sampleCount,
      )
    )
      throw missing;
  }
}

async function fetchGpuMetricsFromDatabase(
  runId: string,
  selection: GpuMetricsRunSelection,
): Promise<GpuMetricsRouteResponse | null> {
  if (!process.env.DATABASE_READONLY_URL) return null;
  const payload = await getGpuMetricsForRun(getDb(), Number(runId), selection);
  return payload ? databasePayloadToResponse(payload) : null;
}

export function GET(request: NextRequest) {
  return readGpuMetrics(request, null);
}

/** Selecting a host must not discard the explorer's sibling artifact choices. */
export function readGpuMetricsForView(request: NextRequest, artifact: string | null) {
  return readGpuMetrics(request, null, artifact);
}

/** Read-only Timeline transport; the body avoids URL limits for a run's point identities. */
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

  if (!runId || !/^\d+$/u.test(runId)) {
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
    stored = await fetchGpuMetricsFromDatabase(runId, {
      prefix,
      sourceResults:
        sources?.map((source) => source.slice('power_validation_'.length, -'.json'.length)) ?? null,
      ...(selectedArtifact === undefined ? {} : { artifact: selectedArtifact }),
    });
  } catch (error) {
    // Missing data may use live artifacts; a failed read cannot establish absence.
    console.error(`gpu-metrics: database lookup failed for run ${runId}:`, error);
    return NextResponse.json(
      {
        error: 'Stored telemetry is temporarily unavailable. Retry the request.',
        code: 'DATABASE_UNAVAILABLE',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const incomplete: StoredTelemetryIncompleteError[] = [];
  const databaseSeries: GpuPowerSeries[] = [];
  let githubFallbackStarted = false;
  try {
    if (stored) {
      const artifacts = filterArtifactsByPrefix(stored.artifacts, prefix).filter((artifact) =>
        isRequestedArtifact(artifact.series?.artifactName ?? artifact.name, sources),
      );
      if (series === 'power') {
        const groups = Map.groupBy(
          artifacts.flatMap((artifact) =>
            artifact.series ? [{ ...artifact.series, data: artifact.data }] : [],
          ),
          (entry) => entry.artifactName,
        );
        for (const entries of groups.values()) {
          try {
            databaseSeries.push(
              ...storedPowerSeries(entries).filter(
                (entry) => sources === null || sources.includes(seriesSource(entry) ?? ''),
              ),
            );
          } catch (error) {
            if (!(error instanceof StoredTelemetryIncompleteError)) throw error;
            incomplete.push(error);
            console.warn(
              'gpu-metrics: incomplete stored telemetry, trying artifacts:',
              error.message,
            );
          }
        }
        if (
          incomplete.length === 0 &&
          databaseSeries.length > 0 &&
          sourceCoverage(databaseSeries, sources).missingSources.length === 0
        ) {
          return powerSeriesResponse('database', stored.runInfo, databaseSeries, sources);
        }
      } else if (artifacts.length > 0 || stored.artifactNames) {
        return NextResponse.json(
          { ...stored, artifacts },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }
    if (series === 'power') {
      githubFallbackStarted = true;
      const { runInfo, artifacts, bundleSeries } = await fetchGpuMetricsFromGithub(
        runId,
        prefix,
        true,
        sources === null ? null : sourceCoverage(databaseSeries, sources).missingSources,
      );
      const powerSeries = artifacts
        .map((artifact) => bucketPowerFiles(artifact.name, artifact.files))
        .filter((entry): entry is GpuPowerSeries => entry !== null);
      // A fallback response can combine durable history with live recovery.
      // Keep healthy stored windows even when their GitHub copies expired,
      // and never replace or duplicate them with a live copy. source='github'
      // records that this response required fallback, not that every row is live.
      const seenSources = new Set(databaseSeries.map(seriesSource));
      const combined = [...databaseSeries];
      for (const entry of [...powerSeries, ...bundleSeries]) {
        const source = seriesSource(entry);
        if (sources !== null && !sources.includes(source ?? '')) continue;
        if (source !== null && seenSources.has(source)) continue;
        combined.push(entry);
        if (source !== null) seenSources.add(source);
      }
      assertStoredArtifactsRecovered(stored, artifacts, incomplete);
      return powerSeriesResponse('github', runInfo, combined, sources);
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
    const missing = error instanceof StoredTelemetryIncompleteError ? error : incomplete[0];
    if (githubFallbackStarted && !missing && stored && databaseSeries.length > 0) {
      return powerSeriesResponse('database', stored.runInfo, databaseSeries, sources);
    }
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
