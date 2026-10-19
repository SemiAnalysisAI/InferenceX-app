import { isRecord } from '@semianalysisai/inferencex-db/lib/records';
import {
  isMultinodePowerSamplesPath,
  parseMultinodePowerSamples,
} from '@semianalysisai/inferencex-db/etl/multinode-power-samples';

import type { GpuMetricRow, GpuPowerRunInfo } from '@/components/gpu-power/types';
import {
  cutPowerAuditBundle,
  isPowerAuditBundleEntry,
  parsePowerCsvData,
} from '@/components/gpu-power/power-audit-bundle';
import type { GpuPowerSeries } from '@/components/gpu-power/power-series';
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
} from '@/lib/github/github-artifacts';

import {
  ARTIFACT_PREFIX,
  BUNDLE_PREFIX,
  isWantedBundle,
  isRequestedArtifact,
} from './artifact-selection';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 4;

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
    return isRecord(context) ? [{ name, context }] : [];
  });
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
): Promise<GithubArtifactPayload | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_BUNDLE_BYTES);
  if (!buffer) return null;
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
): Promise<GpuPowerSeries[] | null> {
  const buffer = await downloadZip(artifact, githubToken, MAX_BUNDLE_BYTES);
  if (!buffer) return null;
  const series = cutPowerAuditBundle(
    artifact.name,
    readZipEntries(buffer, isPowerAuditBundleEntry),
  );
  return series.length > 0 ? series : null;
}

async function runJob(job: TelemetryJob, githubToken: string): Promise<TelemetryResult | null> {
  try {
    if (job.kind === 'csv' || job.kind === 'native') {
      const parsed = await (job.kind === 'native' ? downloadNativeSamples : downloadArtifact)(
        job.artifact,
        githubToken,
      );
      return parsed ? { kind: 'csv', parsed } : null;
    }
    const series = await downloadBundle(job.artifact, githubToken);
    return series ? { kind: 'bundle', series } : null;
  } catch (error) {
    console.warn(`Failed to read artifact ${job.artifact.name}:`, error);
    return null;
  }
}

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

export async function fetchGpuMetricsFromGithub(
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
    throw new Error('No telemetry artifacts (gpu_metrics or power_audit) found for this run');
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
