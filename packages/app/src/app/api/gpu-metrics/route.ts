/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { NextRequest, NextResponse } from 'next/server';

import { parseCsvData } from '@/components/gpu-power/types';
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

async function fetchGpuMetrics(runId: string) {
  const githubToken = getGithubToken();
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith('gpu_metrics'));
  if (gpuArtifacts.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  const parsedArtifacts: { name: string; data: ReturnType<typeof parseCsvData> }[] = [];
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

  if (parsedArtifacts.length === 0) throw new Error('No GPU metrics data found in artifacts');

  return {
    runInfo: normalizeGithubRunInfo(run),
    artifacts: parsedArtifacts,
  };
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');

  if (!runId || !/^\d+$/.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric workflow run ID' }, { status: 400 });
  }

  try {
    const data = await fetchGpuMetrics(runId);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching GPU power data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 },
    );
  }
}
