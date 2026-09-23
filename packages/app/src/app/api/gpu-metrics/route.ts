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
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import type {
  GpuMetricRow,
  GpuPowerRunInfo,
  GpuMetricsArtifact,
  GpuPowerApiResponse,
} from '@/components/gpu-power/types';
import {
  cutPowerAuditBundle,
  isPowerAuditBundleEntry,
  parsePowerCsvData,
} from '@/components/gpu-power/power-audit-bundle';
import {
  bucketPowerFiles,
  parseTelemetryTimestampUtc,
  type GpuPowerSeries,
} from '@/components/gpu-power/power-series';
import {
  storedPowerSeries,
  StoredTelemetryIncompleteError,
} from '@/components/gpu-power/stored-power-series';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  normalizeGithubRunInfo,
  readZipEntries,
  type GithubArtifact,
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
/** Bundles carry a whole sweep (215 MB seen for nw8); only the power entries are decoded. */
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;
/** Bundle downloads are latency-bound; match the other artifact routes' budget. */
export const maxDuration = 300;
/** Parallel artifact downloads; GitHub's zip redirects are latency-bound, not CPU-bound. */
const DOWNLOAD_CONCURRENCY = 4;
const ARTIFACT_PREFIX = 'gpu_metrics_';
const BUNDLE_PREFIX = 'power_audit_';
/** RESULT_FILENAME characters: model, workload, precision, framework, parallelism, host, hash. */
const PREFIX_PATTERN = /^[A-Za-z0-9._-]{1,200}$/u;
const SOURCE_PATTERN = /^power_validation_[A-Za-z0-9._-]{1,200}\.json$/u;
const MAX_REQUEST_BYTES = 256 * 1024;

export type GpuMetricsSource = 'database' | 'github';

export interface GpuMetricsRouteResponse extends GpuPowerApiResponse {
  source: GpuMetricsSource;
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
        (filesPerArtifact.get(series.artifactName) ?? 1) > 1
          ? `${series.artifactName}/${series.fileName}`
          : series.artifactName,
      data,
      series,
    })),
  };
}

/** The GitHub path also carries the bundle series the timeline draws. */
interface GithubArtifactPayload {
  name: string;
  files: { name: string; data: GpuMetricRow[] }[];
}

interface GithubGpuMetricsResponse extends Omit<GpuMetricsRouteResponse, 'artifacts'> {
  artifacts: GithubArtifactPayload[];
  source: 'github';
  bundleSeries: GpuPowerSeries[];
}

interface TelemetryJob {
  kind: 'csv' | 'bundle';
  artifact: GithubArtifact;
}

type TelemetryResult =
  | { kind: 'csv'; parsed: GithubArtifactPayload }
  | { kind: 'bundle'; series: GpuPowerSeries[] };

/** Fetches one artifact zip, or `null` (with a warning) when it fails or exceeds `maxBytes`. */
async function downloadZip(
  artifact: GithubArtifact,
  githubToken: string,
  maxBytes: number,
): Promise<Buffer | null> {
  const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!dlResp.ok) {
    console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
    return null;
  }

  const contentLength = dlResp.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    console.warn(`Artifact ${artifact.name} exceeds ${maxBytes / (1024 * 1024)} MB, skipping`);
    return null;
  }
  return Buffer.from(await dlResp.arrayBuffer());
}

async function downloadArtifact(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GithubArtifactPayload | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_ARTIFACT_BYTES);
  if (!buffer) return null;
  const contexts = new Map<string, Record<string, unknown>>();
  const contextFiles = extractZipEntries(buffer, '.json', (name, contents) => {
    const base = name.slice(name.lastIndexOf('/') + 1);
    if (!base.includes('gpu_metrics') || !base.toLowerCase().endsWith('_context.json')) return [];
    const context: unknown = JSON.parse(contents);
    return context && typeof context === 'object' && !Array.isArray(context)
      ? [{ name, context: context as Record<string, unknown> }]
      : [];
  });
  // Ingest uses code-unit filename order, not archive order or the host locale.
  contextFiles.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const { name, context } of contextFiles) {
    const directory = name.slice(0, name.lastIndexOf('/') + 1);
    if (!contexts.has(directory)) contexts.set(directory, context);
  }
  const files = extractZipEntries(
    buffer,
    '.csv',
    (entryName, contents) => {
      const directory = entryName.slice(0, entryName.lastIndexOf('/') + 1);
      const data = parsePowerCsvData(contents, contexts.get(directory) ?? null);
      return data.length > 0 ? [{ name: entryName, data }] : [];
    },
    (entryName, error) => {
      console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
    },
  );
  return files.length > 0 ? { name: artifact.name, files } : null;
}

async function downloadBundle(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GpuPowerSeries[] | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_BUNDLE_BYTES);
  if (!buffer) return null;
  const series = cutPowerAuditBundle(
    artifact.name,
    readZipEntries(buffer, isPowerAuditBundleEntry),
  );
  return series.length > 0 ? series : null;
}

/**
 * One artifact download and parse. A corrupt or truncated archive is that
 * artifact's failure alone: it is logged and skipped so the other series of
 * the run still reach the chart (the client would otherwise retry the whole
 * multi-hundred-megabyte request).
 */
async function runJob(job: TelemetryJob, githubToken: string): Promise<TelemetryResult | null> {
  try {
    if (job.kind === 'csv') {
      const parsed = await downloadArtifact(job.artifact, githubToken);
      return parsed ? { kind: 'csv', parsed } : null;
    }
    const series = await downloadBundle(job.artifact, githubToken);
    return series ? { kind: 'bundle', series } : null;
  } catch (error) {
    console.warn(`Failed to read artifact ${job.artifact.name}:`, error);
    return null;
  }
}

/** Downloads in listing order with a bounded number of requests in flight. */
async function downloadTelemetry(
  jobs: TelemetryJob[],
  githubToken: string,
): Promise<TelemetryResult[]> {
  const results: (TelemetryResult | null)[] = Array.from({ length: jobs.length }, () => null);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await runJob(jobs[index], githubToken);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, jobs.length) }, worker));
  return results.filter((result): result is TelemetryResult => result !== null);
}

/**
 * A bundle names a whole sweep, while the client's prefix (the longest common
 * prefix of its points' validation names) may run into the `_sa-bench_…_conc<c>`
 * suffix; either side being a prefix of the other selects the bundle.
 */
function isWantedBundle(name: string, prefix: string | null): boolean {
  if (!name.startsWith(BUNDLE_PREFIX)) return false;
  if (prefix === null) return true;
  const wanted = `${BUNDLE_PREFIX}${prefix}`;
  return name.startsWith(wanted) || wanted.startsWith(name);
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

function isRequestedArtifact(name: string, sources: string[] | null): boolean {
  return (
    sources === null ||
    sources.some((source) => {
      const result = source.slice('power_validation_'.length, -'.json'.length);
      return name === `${ARTIFACT_PREFIX}${result}` || isWantedBundle(name, result);
    })
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
  artifacts: GpuMetricsArtifact[],
  prefix: string | null,
): GpuMetricsArtifact[] {
  if (prefix === null) return artifacts;
  const wanted = `${ARTIFACT_PREFIX}${prefix}`;
  return artifacts.filter((artifact) => {
    const name = artifact.series?.artifactName ?? artifact.name;
    return name.startsWith(wanted) || isWantedBundle(name, prefix);
  });
}

async function fetchGpuMetricsFromGithub(
  runId: string,
  prefix: string | null,
  includeBundles: boolean,
  sources: string[] | null = null,
): Promise<GithubGpuMetricsResponse> {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  // `eval_gpu_metrics_*` artifacts are excluded by the bare `gpu_metrics` test.
  const wanted = prefix ? `${ARTIFACT_PREFIX}${prefix}` : 'gpu_metrics';
  const jobs: TelemetryJob[] = artifacts
    .filter((a) => a.name.startsWith(wanted) && isRequestedArtifact(a.name, sources))
    .map((artifact) => ({ kind: 'csv', artifact }));
  if (includeBundles) {
    for (const artifact of artifacts) {
      if (isWantedBundle(artifact.name, prefix) && isRequestedArtifact(artifact.name, sources))
        jobs.push({ kind: 'bundle', artifact });
    }
  }
  if (jobs.length === 0) {
    throw new Error(
      includeBundles
        ? 'No telemetry artifacts (gpu_metrics or power_audit) found for this run'
        : 'No gpu_metrics artifacts found for this run',
    );
  }

  const results = await downloadTelemetry(jobs, githubToken);
  if (results.length === 0) throw new Error('No Chip metrics data found in artifacts');

  const parsedArtifacts: GithubArtifactPayload[] = [];
  const bundleSeries: GpuPowerSeries[] = [];
  for (const result of results) {
    if (result.kind === 'csv') parsedArtifacts.push(result.parsed);
    else bundleSeries.push(...result.series);
  }
  return {
    source: 'github',
    runInfo: normalizeGithubRunInfo(run) as GpuPowerRunInfo,
    artifacts: parsedArtifacts,
    bundleSeries,
  };
}

async function fetchGpuMetricsFromDatabase(runId: string): Promise<GpuMetricsRouteResponse | null> {
  if (!process.env.DATABASE_READONLY_URL) return null;
  const payload = await getGpuMetricsForRun(getDb(), Number(runId));
  return payload ? databasePayloadToResponse(payload) : null;
}

export function GET(request: NextRequest) {
  return readGpuMetrics(request, null);
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

async function readGpuMetrics(request: NextRequest, sources: string[] | null) {
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
    stored = await fetchGpuMetricsFromDatabase(runId);
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
      } else if (artifacts.length > 0) {
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
      const databaseSources = new Set(databaseSeries.map(seriesSource));
      const combined = [
        ...databaseSeries,
        ...[...powerSeries, ...bundleSeries].filter(
          (entry) =>
            !databaseSources.has(seriesSource(entry)) &&
            (sources === null || sources.includes(seriesSource(entry) ?? '')),
        ),
      ];
      for (const missing of incomplete) {
        const live = artifacts.find((artifact) => artifact.name === missing.artifact);
        const inventory = stored?.artifacts.find(
          (artifact) => artifact.series?.artifactName === missing.artifact,
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
                return time === null || !Number.isInteger(row.index) || !Number.isFinite(row.power)
                  ? []
                  : [`${row.index}:${time}`];
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
