/**
 * PowerX explorer data for one GitHub Actions run.
 *
 * Reads the ingest-time telemetry digest first (migration 016: series,
 * samples, per-GPU statistics, point links). Runs that have not been ingested
 * yet, including runs still in progress, fall back to the live GitHub
 * artifacts exactly as before.
 *
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route. The
 * fallback fetches live GitHub Actions artifacts which change while a run is
 * in progress, and the database path is already a single indexed read.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getGpuMetricsForRun,
  type GpuMetricSeries,
  type GpuMetricsRunPayload,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

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
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

export type GpuMetricsSource = 'database' | 'github';

export interface GpuMetricsArtifactPayload {
  name: string;
  data: GpuMetricRow[];
  /** Present only for database-backed artifacts. */
  series?: Omit<GpuMetricSeries, 'data'>;
}

export interface GpuMetricsRouteResponse {
  runInfo: GpuPowerRunInfo;
  artifacts: GpuMetricsArtifactPayload[];
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

async function fetchGpuMetricsFromGithub(runId: string): Promise<GpuMetricsRouteResponse> {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith('gpu_metrics'));
  if (gpuArtifacts.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  const parsedArtifacts: GpuMetricsArtifactPayload[] = [];
  for (const artifact of gpuArtifacts) {
    const dlResp = await downloadGithubArtifact(artifact.archive_download_url, githubToken);
    if (!dlResp.ok) {
      console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
      continue;
    }

    const contentLength = dlResp.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_ARTIFACT_BYTES) {
      console.warn(`Artifact ${artifact.name} exceeds 50 MB, skipping`);
      continue;
    }

    const rows = extractZipEntries(
      Buffer.from(await dlResp.arrayBuffer()),
      '.csv',
      (_entryName, contents) => parseCsvData(contents),
      (entryName, error) => {
        console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
      },
    );
    if (rows.length > 0) parsedArtifacts.push({ name: artifact.name, data: rows });
  }

  if (parsedArtifacts.length === 0) throw new Error('No Chip metrics data found in artifacts');

  return {
    source: 'github',
    runInfo: normalizeGithubRunInfo(run) as GpuPowerRunInfo,
    artifacts: parsedArtifacts,
  };
}

async function fetchGpuMetricsFromDatabase(runId: string): Promise<GpuMetricsRouteResponse | null> {
  if (!process.env.DATABASE_READONLY_URL) return null;
  try {
    const payload = await getGpuMetricsForRun(getDb(), Number(runId));
    return payload ? databasePayloadToResponse(payload) : null;
  } catch (error) {
    // A schema that predates migration 016 or a transient DB error must not
    // hide the live GitHub artifacts.
    console.warn(`gpu-metrics: database lookup failed for run ${runId}, using GitHub:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');

  if (!runId || !/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }

  try {
    const data =
      (await fetchGpuMetricsFromDatabase(runId)) ?? (await fetchGpuMetricsFromGithub(runId));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
