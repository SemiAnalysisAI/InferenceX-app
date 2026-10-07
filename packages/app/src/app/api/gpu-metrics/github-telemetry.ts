/** Live PowerX artifact acquisition; the route owns DB fallback and HTTP responses. */
import { parseNvidiaTimestamp } from '@semianalysisai/inferencex-db/etl/gpu-metrics-csv';

import {
  parseCsvData,
  type GpuMetricRow,
  type GpuPowerRunInfo,
} from '@/components/gpu-power/types';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  normalizeGithubRunInfo,
  type GithubArtifact,
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
/** Parallel artifact downloads; GitHub's zip redirects are latency-bound, not CPU-bound. */
const DOWNLOAD_CONCURRENCY = 4;

interface GithubArtifactPayload {
  name: string;
  files: { name: string; data: GpuMetricRow[] }[];
}

/**
 * Normalize NVIDIA's unzoned wall-clock timestamps to ISO UTC, matching the ingest
 * parser: the adjacent collector context supplies the offset and missing or UTC
 * context means zero. Live and stored reads then agree, so a run does not shift by
 * the browser timezone before ingest. ISO and AMD timestamps pass through unchanged.
 */
export function parsePowerCsvData(
  text: string,
  context: Record<string, unknown> | null,
): GpuMetricRow[] {
  const zone = context?.timestamp_timezone;
  const offset =
    typeof zone === 'string'
      ? /^(?<sign>[+-])(?<h>\d{2}):?(?<m>\d{2})$/u.exec(zone.trim())?.groups
      : null;
  const offsetMinutes = offset
    ? (offset.sign === '-' ? -1 : 1) * (Number(offset.h) * 60 + Number(offset.m))
    : 0;
  return parseCsvData(text).map((row) => {
    const timestamp = parseNvidiaTimestamp(row.timestamp, offsetMinutes);
    return timestamp === null ? row : { ...row, timestamp: new Date(timestamp).toISOString() };
  });
}

async function downloadArtifact(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GithubArtifactPayload | null> {
  const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
  if (!dlResp.ok) {
    console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
    return null;
  }

  const contentLength = dlResp.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_ARTIFACT_BYTES) {
    console.warn(`Artifact ${artifact.name} exceeds 50 MB, skipping`);
    return null;
  }
  const buffer = Buffer.from(await dlResp.arrayBuffer());
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

/**
 * A corrupt or truncated archive is that artifact's failure alone: it is logged
 * and skipped so the other series of the run still reach the reader.
 */
async function readArtifact(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<GithubArtifactPayload | null> {
  try {
    return await downloadArtifact(artifact, githubToken);
  } catch (error) {
    console.warn(`Failed to read artifact ${artifact.name}:`, error);
    return null;
  }
}

/** Downloads in listing order with a bounded number of requests in flight. */
async function downloadTelemetry(
  artifacts: GithubArtifact[],
  githubToken: string,
): Promise<GithubArtifactPayload[]> {
  const results: (GithubArtifactPayload | null)[] = Array.from(
    { length: artifacts.length },
    () => null,
  );
  let next = 0;
  const worker = async () => {
    while (next < artifacts.length) {
      const index = next++;
      results[index] = await readArtifact(artifacts[index], githubToken);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, artifacts.length) }, worker),
  );
  return results.filter((result): result is GithubArtifactPayload => result !== null);
}

export async function fetchGpuMetricsFromGithub(
  runId: string,
): Promise<{ runInfo: GpuPowerRunInfo; artifacts: GithubArtifactPayload[] }> {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  // `eval_gpu_metrics_*` artifacts are excluded by the bare `gpu_metrics` test.
  const telemetry = artifacts.filter((a) => a.name.startsWith('gpu_metrics'));
  if (telemetry.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  const parsed = await downloadTelemetry(telemetry, githubToken);
  if (parsed.length === 0) throw new Error('No Chip metrics data found in artifacts');

  return {
    runInfo: normalizeGithubRunInfo(run) as GpuPowerRunInfo,
    artifacts: parsed,
  };
}
