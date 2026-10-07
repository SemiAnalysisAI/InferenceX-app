/**
 * PowerX telemetry for one GitHub Actions run, answered from one source per run:
 * a run with stored telemetry (migration 016) is read from the database only; a
 * run without it (not yet ingested, still in progress, or unofficial) is read
 * from its live GitHub artifacts only.
 *
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route. Live
 * GitHub Actions artifacts change while a run is in progress, and stored
 * telemetry must reflect a successful re-ingest immediately.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getGpuMetricsForRun,
  type GpuMetricsRunPayload,
  type GpuMetricsRunSelection,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import type { GpuPowerApiResponse } from '@/components/gpu-power/types';
import { fetchGpuMetricsFromGithub } from './github-telemetry';

/** Artifact downloads are latency-bound; match the other artifact routes' budget. */
export const maxDuration = 300;

export interface GpuMetricsRouteResponse extends GpuPowerApiResponse {
  source: 'database' | 'github';
  artifactNames?: string[];
}

/** Shape the stored digest like the GitHub payload so readers are source-agnostic. */
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

async function fetchGpuMetricsFromDatabase(
  runId: string,
  selection: GpuMetricsRunSelection,
): Promise<GpuMetricsRouteResponse | null> {
  if (!process.env.DATABASE_READONLY_URL) return null;
  const payload = await getGpuMetricsForRun(getDb(), Number(runId), selection);
  return payload ? databasePayloadToResponse(payload) : null;
}

export function GET(request: NextRequest) {
  return readGpuMetrics(request, {});
}

/** Selecting a host must not discard the view's sibling artifact choices. */
export function readGpuMetricsForView(request: NextRequest, artifact: string | null) {
  return readGpuMetrics(request, { artifact });
}

async function readGpuMetrics(request: NextRequest, selection: GpuMetricsRunSelection) {
  const runId = request.nextUrl.searchParams.get('runId');

  if (!runId || !/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }

  let stored: GpuMetricsRouteResponse | null;
  try {
    stored = await fetchGpuMetricsFromDatabase(runId, selection);
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
  if (stored) return NextResponse.json(stored, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const live = await fetchGpuMetricsFromGithub(runId);
    return NextResponse.json(
      {
        source: 'github',
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
