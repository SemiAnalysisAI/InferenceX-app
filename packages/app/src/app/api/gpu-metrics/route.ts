/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { parseCsvData } from '@/components/gpu-power/types';

interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
}

/** Paginated GitHub API fetch (same pattern as unofficial-run route). */
async function githubFetchAll(url: string, token: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const resp = await fetch(`${url}${sep}per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!resp.ok) break;
    const data = await resp.json();
    const arr = Array.isArray(data) ? data : (data.artifacts ?? data.workflow_runs ?? []);
    if (arr.length === 0) break;
    items.push(...arr);
    if (arr.length < 100) break;
    page++;
  }
  return items;
}

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

async function fetchGpuMetrics(runId: string) {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) throw new Error('GitHub token not configured');

  const runResp = await fetch(
    `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
    {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    },
  );
  if (!runResp.ok) throw new Error(`Failed to fetch workflow run: ${runResp.status}`);
  const run = await runResp.json();

  const artifacts = (await githubFetchAll(
    `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
    githubToken,
  )) as GithubArtifact[];

  const gpuArtifacts = artifacts.filter((a) => a.name.startsWith('gpu_metrics'));
  if (gpuArtifacts.length === 0) throw new Error('No gpu_metrics artifacts found for this run');

  const parsedArtifacts: { name: string; data: ReturnType<typeof parseCsvData> }[] = [];
  for (const artifact of gpuArtifacts) {
    const dlResp = await fetch(artifact.archive_download_url, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!dlResp.ok) {
      console.warn(`Failed to download artifact ${artifact.name}: ${dlResp.statusText}`);
      continue;
    }

    const contentLength = dlResp.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_ARTIFACT_BYTES) {
      console.warn(`Artifact ${artifact.name} exceeds 50 MB, skipping`);
      continue;
    }

    const zip = new AdmZip(Buffer.from(await dlResp.arrayBuffer()));
    const rows = [];
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.endsWith('.csv')) continue;
      try {
        rows.push(...parseCsvData(zip.readAsText(entry)));
      } catch (e) {
        console.warn(`Failed to parse CSV ${entry.entryName} from ${artifact.name}:`, e);
      }
    }
    if (rows.length > 0) parsedArtifacts.push({ name: artifact.name, data: rows });
  }

  if (parsedArtifacts.length === 0) throw new Error('No GPU metrics data found in artifacts');

  return {
    runInfo: {
      id: run.id,
      name: run.name,
      branch: run.head_branch,
      sha: run.head_sha,
      createdAt: run.created_at,
      url: run.html_url,
      conclusion: run.conclusion,
      status: run.status,
    },
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
