/** Live PowerX artifact acquisition; the route owns DB fallback and HTTP responses. */
import { isRecord } from '@semianalysisai/inferencex-db/lib/records';
import {
  isMultinodePowerSamplesPath,
  parseMultinodePowerSamples,
} from '@semianalysisai/inferencex-db/etl/multinode-power-samples';
import { isPowerAuditBundleEntry } from '@semianalysisai/inferencex-db/power-series/power-audit-cut';

import type { GpuMetricRow, GpuPowerRunInfo } from '@/components/gpu-power/types';
import { cutPowerAuditBundle, parsePowerCsvData } from '@/components/gpu-power/power-audit-bundle';
import type { GpuPowerSeries } from '@/components/gpu-power/power-series';
import {
  downloadGithubArtifact,
  extractZipEntries,
  listGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  normalizeGithubRunInfo,
  readZipEntries,
  type GithubArtifact,
  type GithubWorkflowRun,
} from '@/lib/github/github-artifacts';

import {
  ARTIFACT_PREFIX,
  BUNDLE_PREFIX,
  isWantedBundle,
  isRequestedArtifact,
} from './artifact-selection';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
/** Bundles carry a whole sweep (215 MB seen for nw8); only the power entries are decoded. */
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;
/** Parallel artifact downloads; GitHub's zip redirects are latency-bound, not CPU-bound. */
const DOWNLOAD_CONCURRENCY = 4;

/** The GitHub path also carries the bundle series the timeline draws. */
export interface GithubArtifactPayload {
  name: string;
  files: { name: string; data: GpuMetricRow[] }[];
}

interface GithubGpuMetricsResponse {
  runInfo: GpuPowerRunInfo;
  artifacts: GithubArtifactPayload[];
  source: 'github';
  bundleSeries: GpuPowerSeries[];
}

type TelemetryJob =
  | { kind: 'csv' | 'native'; artifact: GithubArtifact }
  | { kind: 'bundle'; artifact: GithubArtifact };

type TelemetryResult =
  | { kind: 'csv'; parsed: GithubArtifactPayload }
  | { kind: 'bundle'; series: GpuPowerSeries[] };

const GPU_TELEMETRY_ERROR_STATUS = {
  RUN_NOT_FOUND: 404,
  NO_TELEMETRY: 404,
  ARTIFACT_TOO_LARGE: 422,
  GITHUB_UNAVAILABLE: 503,
} as const;

export type GpuTelemetryErrorCode = keyof typeof GPU_TELEMETRY_ERROR_STATUS;

export function isGpuTelemetryErrorCode(value: unknown): value is GpuTelemetryErrorCode {
  return typeof value === 'string' && Object.hasOwn(GPU_TELEMETRY_ERROR_STATUS, value);
}

/**
 * A live telemetry read the route answers with its code's status: 404 when GitHub has no run or
 * no telemetry for it, 422 when every artifact is over the download cap, 503 (retry) when GitHub
 * failed.
 */
export class GpuTelemetryError extends Error {
  override name = 'GpuTelemetryError';
  readonly code: GpuTelemetryErrorCode;
  readonly status: number;

  constructor(code: GpuTelemetryErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = GPU_TELEMETRY_ERROR_STATUS[code];
  }
}

/** Why one artifact gave no data; an archive without series yields `null` instead. */
type DownloadFailure = 'expired' | 'too_large' | 'failed';

/** Fetches one artifact zip, or why it could not (with a warning). */
async function downloadZip(
  artifact: GithubArtifact,
  githubToken: string,
  maxBytes: number,
): Promise<Buffer | DownloadFailure> {
  if (artifact.expired) return 'expired';
  const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!dlResp.ok) {
    console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
    return dlResp.status === 410 ? 'expired' : 'failed';
  }

  const contentLength = dlResp.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    console.warn(`Artifact ${artifact.name} exceeds ${maxBytes / (1024 * 1024)} MB, skipping`);
    return 'too_large';
  }
  return Buffer.from(await dlResp.arrayBuffer());
}

async function downloadArtifact(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GithubArtifactPayload | DownloadFailure | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_ARTIFACT_BYTES);
  if (typeof buffer === 'string') return buffer;
  const contexts = new Map<string, Record<string, unknown>>();
  const contextFiles = extractZipEntries(buffer, '.json', (name, contents) => {
    const base = name.slice(name.lastIndexOf('/') + 1);
    if (!base.includes('gpu_metrics') || !base.toLowerCase().endsWith('_context.json')) return [];
    const context: unknown = JSON.parse(contents);
    return isRecord(context) ? [{ name, context }] : [];
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

async function downloadNativeSamples(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GithubArtifactPayload | DownloadFailure | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_BUNDLE_BYTES);
  if (typeof buffer === 'string') return buffer;
  const files = extractZipEntries(buffer, '.csv', (name, contents) => {
    if (!isMultinodePowerSamplesPath(name)) return [];
    return (parseMultinodePowerSamples(contents) ?? []).map((host) => ({
      name: `${name}#${host.hostname}`,
      data: host.samples.map((sample) => ({
        timestamp: new Date(sample.timestampMs).toISOString(),
        index: sample.gpuIndex,
        power: sample.powerW!,
        ...(sample.temperatureC === null ? {} : { temperature: sample.temperatureC }),
      })),
    }));
  });
  return files.length > 0 ? { name: artifact.name, files } : null;
}

async function downloadBundle(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GpuPowerSeries[] | DownloadFailure | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_BUNDLE_BYTES);
  if (typeof buffer === 'string') return buffer;
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
async function runJob(
  job: TelemetryJob,
  githubToken: string,
): Promise<TelemetryResult | DownloadFailure | null> {
  try {
    if (job.kind === 'csv' || job.kind === 'native') {
      const parsed = await (job.kind === 'native' ? downloadNativeSamples : downloadArtifact)(
        job.artifact,
        githubToken,
      );
      return parsed && typeof parsed === 'object' ? { kind: 'csv', parsed } : parsed;
    }
    const series = await downloadBundle(job.artifact, githubToken);
    return Array.isArray(series) ? { kind: 'bundle', series } : series;
  } catch (error) {
    console.warn(`Failed to read artifact ${job.artifact.name}:`, error);
    return 'failed';
  }
}

/** Downloads in listing order with a bounded number of requests in flight. */
async function downloadTelemetry(
  jobs: TelemetryJob[],
  githubToken: string,
): Promise<(TelemetryResult | DownloadFailure | null)[]> {
  const outcomes: (TelemetryResult | DownloadFailure | null)[] = Array.from(
    { length: jobs.length },
    () => null,
  );
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      outcomes[index] = await runJob(jobs[index], githubToken);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, jobs.length) }, worker));
  return outcomes;
}

/**
 * Why no artifact gave data. Only expired archives and archives without series mean the run has
 * no telemetry; a failed download may succeed on retry.
 */
function missingTelemetryError(
  outcomes: readonly (TelemetryResult | DownloadFailure | null)[],
): GpuTelemetryError {
  if (outcomes.includes('failed')) {
    return new GpuTelemetryError(
      'GITHUB_UNAVAILABLE',
      'Telemetry artifacts could not be downloaded from GitHub; retry later',
    );
  }
  if (outcomes.includes('too_large')) {
    return new GpuTelemetryError(
      'ARTIFACT_TOO_LARGE',
      'Telemetry artifacts exceed the live download size limit',
    );
  }
  return new GpuTelemetryError('NO_TELEMETRY', 'No Chip metrics data found in artifacts');
}

export async function fetchGpuMetricsFromGithub(
  runId: string,
  prefix: string | null,
  includeBundles: boolean,
  sources: string[] | null = null,
): Promise<GithubGpuMetricsResponse> {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (runResp.status === 404) {
    throw new GpuTelemetryError('RUN_NOT_FOUND', `Workflow run ${runId} was not found`);
  }
  if (!runResp.ok) {
    throw new GpuTelemetryError(
      'GITHUB_UNAVAILABLE',
      `Failed to fetch workflow run from GitHub (${runResp.status}); retry later`,
    );
  }
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await listGithubRunArtifacts(runId, githubToken);
  if (!artifacts) {
    throw new GpuTelemetryError(
      'GITHUB_UNAVAILABLE',
      'The artifact list could not be read from GitHub; retry later',
    );
  }

  // `eval_gpu_metrics_*` artifacts are excluded by the bare `gpu_metrics` test.
  const wanted = prefix ? `${ARTIFACT_PREFIX}${prefix}` : 'gpu_metrics';
  const jobs: TelemetryJob[] = artifacts
    .filter((a) => a.name.startsWith(wanted) && isRequestedArtifact(a.name, sources))
    .map((artifact) => ({ kind: 'csv', artifact }));
  const csvNames = new Set(jobs.map(({ artifact }) => artifact.name));
  for (const artifact of artifacts) {
    if (!isWantedBundle(artifact.name, prefix) || !isRequestedArtifact(artifact.name, sources))
      continue;
    if (csvNames.has(`${ARTIFACT_PREFIX}${artifact.name.slice(BUNDLE_PREFIX.length)}`)) continue;
    jobs.push({ kind: includeBundles ? 'bundle' : 'native', artifact });
  }
  if (jobs.length === 0) {
    throw new GpuTelemetryError(
      'NO_TELEMETRY',
      'No telemetry artifacts (gpu_metrics or power_audit) found for this run',
    );
  }

  const outcomes = await downloadTelemetry(jobs, githubToken);
  const results = outcomes.filter(
    (outcome): outcome is TelemetryResult => outcome !== null && typeof outcome === 'object',
  );
  if (results.length === 0) throw missingTelemetryError(outcomes);

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
