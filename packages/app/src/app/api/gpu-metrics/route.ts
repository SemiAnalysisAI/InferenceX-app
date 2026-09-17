/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 *
 * Two response shapes share one download path:
 * - default: every `gpu_metrics_*` artifact's parsed rows (the `/gpu-metrics` page);
 * - `series=power`: compact per-GPU watt series bucketed to one second
 *   (`components/gpu-power/power-series.ts`) for the PowerX timeline, which
 *   joins them to chart points by artifact name.
 * `prefix=<RESULT_FILENAME prefix>` narrows either shape to the artifacts of
 * one model / workload / precision so a full nightly sweep is not downloaded
 * for one chart.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { parseCsvData } from '@/components/gpu-power/types';
import { bucketPowerSeries, type GpuPowerSeries } from '@/components/gpu-power/power-series';
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
const ARTIFACT_PREFIX = 'gpu_metrics_';
/** RESULT_FILENAME characters: model, workload, precision, framework, parallelism, host, hash. */
const PREFIX_PATTERN = /^[A-Za-z0-9._-]{1,200}$/u;

interface ParsedArtifact {
  name: string;
  data: ReturnType<typeof parseCsvData>;
}

async function downloadArtifact(
  artifact: GithubArtifact,
  githubToken: string,
): Promise<ParsedArtifact | null> {
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

  const rows = extractZipEntries(
    Buffer.from(await dlResp.arrayBuffer()),
    '.csv',
    (_entryName, contents) => parseCsvData(contents),
    (entryName, error) => {
      console.warn(`Failed to parse CSV ${entryName} from ${artifact.name}:`, error);
    },
  );
  return rows.length > 0 ? { name: artifact.name, data: rows } : null;
}

/** Downloads in listing order with a bounded number of requests in flight. */
async function downloadArtifacts(
  artifacts: GithubArtifact[],
  githubToken: string,
): Promise<ParsedArtifact[]> {
  const results: (ParsedArtifact | null)[] = Array.from({ length: artifacts.length }, () => null);
  let next = 0;
  const worker = async () => {
    while (next < artifacts.length) {
      const index = next++;
      results[index] = await downloadArtifact(artifacts[index], githubToken);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, artifacts.length) }, worker),
  );
  return results.filter((artifact): artifact is ParsedArtifact => artifact !== null);
}

async function fetchGpuMetrics(runId: string, prefix: string | null) {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  // `eval_gpu_metrics_*` artifacts are excluded by the bare `gpu_metrics` test.
  const wanted = prefix ? `${ARTIFACT_PREFIX}${prefix}` : 'gpu_metrics';
  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith(wanted));
  if (gpuArtifacts.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  const parsedArtifacts = await downloadArtifacts(gpuArtifacts, githubToken);
  if (parsedArtifacts.length === 0) throw new Error('No Chip metrics data found in artifacts');

  return {
    runInfo: normalizeGithubRunInfo(run),
    artifacts: parsedArtifacts,
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
    const data = await fetchGpuMetrics(runId, prefix);
    if (series === 'power') {
      const powerSeries = data.artifacts
        .map((artifact) => bucketPowerSeries(artifact.name, artifact.data))
        .filter((entry): entry is GpuPowerSeries => entry !== null);
      return NextResponse.json({ runInfo: data.runInfo, series: powerSeries });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
