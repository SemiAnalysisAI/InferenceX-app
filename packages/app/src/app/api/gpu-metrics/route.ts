/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 *
 * Two telemetry collectors publish GPU power for a run:
 * - single-node runners (nvidia-smi / amd-smi) upload one `gpu_metrics_<RESULT_FILENAME>`
 *   CSV artifact per benchmark config;
 * - Slurm / Dynamo disaggregated runners (DCGM) upload one `power_audit_<RESULT_FILENAME>`
 *   bundle per concurrency sweep, holding the sweep's samples plus one
 *   `power_validation_*.json` window per config
 *   (`components/gpu-power/power-audit-bundle.ts`).
 *
 * Two response shapes share one download path:
 * - default: every `gpu_metrics_*` artifact's parsed rows (the `/gpu-metrics`
 *   page); bundles are ignored;
 * - `series=power`: compact per-GPU watt series bucketed to one second
 *   (`components/gpu-power/power-series.ts`) for the PowerX timeline, from
 *   CSV artifacts and from bundles cut per validation window. The timeline
 *   joins them to chart points by `source` (bundle) or artifact name (CSV).
 * `prefix=<RESULT_FILENAME prefix>` narrows either shape to the artifacts of
 * one model / workload / precision so a full nightly sweep is not downloaded
 * for one chart. A bundle names a whole sweep, so it also matches when the
 * prefix extends past its name into the per-concurrency suffix.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { parseCsvData } from '@/components/gpu-power/types';
import {
  cutPowerAuditBundle,
  isPowerAuditBundleEntry,
} from '@/components/gpu-power/power-audit-bundle';
import { bucketPowerSeries, type GpuPowerSeries } from '@/components/gpu-power/power-series';
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

interface ParsedArtifact {
  name: string;
  data: ReturnType<typeof parseCsvData>;
}

type TelemetryJob =
  | { kind: 'csv'; artifact: GithubArtifact }
  | { kind: 'bundle'; artifact: GithubArtifact };

type TelemetryResult =
  | { kind: 'csv'; parsed: ParsedArtifact }
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
): Promise<ParsedArtifact | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_ARTIFACT_BYTES);
  if (!buffer) return null;
  const rows = extractZipEntries(
    buffer,
    '.csv',
    (_entryName, contents) => parseCsvData(contents),
    (entryName, error) => {
      console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
    },
  );
  return rows.length > 0 ? { name: artifact.name, data: rows } : null;
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
    return await runJobUnguarded(job, githubToken);
  } catch (error) {
    console.warn(`Failed to read artifact ${job.artifact.name}:`, error);
    return null;
  }
}

async function runJobUnguarded(
  job: TelemetryJob,
  githubToken: string,
): Promise<TelemetryResult | null> {
  if (job.kind === 'csv') {
    const parsed = await downloadArtifact(job.artifact, githubToken);
    return parsed ? { kind: 'csv', parsed } : null;
  }
  const series = await downloadBundle(job.artifact, githubToken);
  return series ? { kind: 'bundle', series } : null;
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

async function fetchGpuMetrics(runId: string, prefix: string | null, includeBundles: boolean) {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  // `eval_gpu_metrics_*` artifacts are excluded by the bare `gpu_metrics` test.
  const wanted = prefix ? `${ARTIFACT_PREFIX}${prefix}` : 'gpu_metrics';
  const jobs: TelemetryJob[] = artifacts
    .filter((a) => a.name.startsWith(wanted))
    .map((artifact) => ({ kind: 'csv', artifact }));
  if (includeBundles) {
    for (const artifact of artifacts) {
      if (isWantedBundle(artifact.name, prefix)) jobs.push({ kind: 'bundle', artifact });
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

  const parsedArtifacts: ParsedArtifact[] = [];
  const bundleSeries: GpuPowerSeries[] = [];
  for (const result of results) {
    if (result.kind === 'csv') parsedArtifacts.push(result.parsed);
    else bundleSeries.push(...result.series);
  }
  return {
    runInfo: normalizeGithubRunInfo(run),
    artifacts: parsedArtifacts,
    bundleSeries,
  };
}

export async function GET(request: NextRequest) {
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

  try {
    const { runInfo, artifacts, bundleSeries } = await fetchGpuMetrics(
      runId,
      prefix,
      series === 'power',
    );
    if (series === 'power') {
      const powerSeries = artifacts
        .map((artifact) => bucketPowerSeries(artifact.name, artifact.data))
        .filter((entry): entry is GpuPowerSeries => entry !== null);
      return NextResponse.json({ runInfo, series: [...powerSeries, ...bundleSeries] });
    }
    return NextResponse.json({ runInfo, artifacts });
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
