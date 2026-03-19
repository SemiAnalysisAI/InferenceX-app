/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import AdmZip from 'adm-zip';
import { NextRequest, NextResponse } from 'next/server';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
}

/** Paginated GitHub API fetch. */
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

/** Normalize raw artifact rows into the BenchmarkRow shape the frontend expects. */
export function normalizeArtifactRows(rawRows: Record<string, unknown>[], date: string) {
  const tracker = createSkipTracker();
  const results = [];
  for (const raw of rawRows) {
    const params = mapBenchmarkRow(raw as Record<string, any>, tracker);
    if (!params) continue;
    const { config } = params;
    results.push({
      hardware: config.hardware,
      framework: config.framework,
      model: config.model,
      precision: config.precision,
      spec_method: config.specMethod,
      disagg: config.disagg,
      is_multinode: config.isMultinode,
      prefill_tp: config.prefillTp,
      prefill_ep: config.prefillEp,
      prefill_dp_attention: config.prefillDpAttn,
      prefill_num_workers: config.prefillNumWorkers,
      decode_tp: config.decodeTp,
      decode_ep: config.decodeEp,
      decode_dp_attention: config.decodeDpAttn,
      decode_num_workers: config.decodeNumWorkers,
      num_prefill_gpu: config.numPrefillGpu,
      num_decode_gpu: config.numDecodeGpu,
      isl: params.isl,
      osl: params.osl,
      conc: params.conc,
      image: params.image,
      metrics: params.metrics,
      date,
    });
  }
  return results;
}

/** Extract and parse all JSON files from a ZIP buffer. */
function extractJsonFromZip(buffer: Buffer): Record<string, unknown>[] {
  const zip = new AdmZip(buffer);
  const results: Record<string, unknown>[] = [];
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.json')) continue;
    try {
      const data = JSON.parse(zip.readAsText(entry));
      if (Array.isArray(data)) results.push(...data);
      else results.push(data);
    } catch {}
  }
  return results;
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');
  if (!runId || !/^\d+$/.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric value' }, { status: 400 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  try {
    // Fetch workflow run metadata
    const runResp = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );
    if (!runResp.ok) {
      return NextResponse.json(
        { error: `GitHub API: ${runResp.statusText}` },
        { status: runResp.status },
      );
    }
    const run = await runResp.json();

    // Fetch artifacts, find latest results_bmk
    const artifacts = (await githubFetchAll(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
      githubToken,
    )) as GithubArtifact[];

    const bmkArtifact = artifacts
      .filter((a) => a.name === 'results_bmk')
      .sort((a, b) => b.id - a.id)[0];

    if (!bmkArtifact) {
      return NextResponse.json({ error: 'No results_bmk artifact found' }, { status: 404 });
    }

    // Download and extract benchmark data
    const dlResp = await fetch(bmkArtifact.archive_download_url, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!dlResp.ok) {
      return NextResponse.json(
        { error: `Artifact download failed: ${dlResp.statusText}` },
        { status: dlResp.status },
      );
    }

    const rawRows = extractJsonFromZip(Buffer.from(await dlResp.arrayBuffer()));
    const date = run.created_at
      ? run.created_at.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const benchmarks = normalizeArtifactRows(rawRows, date);

    return NextResponse.json({
      runInfo: {
        id: run.id,
        name: run.name,
        branch: run.head_branch,
        sha: run.head_sha,
        createdAt: run.created_at,
        url: run.html_url,
        conclusion: run.conclusion,
        status: run.status,
        isNonMainBranch: run.head_branch !== 'main',
      },
      benchmarks,
    });
  } catch (error) {
    console.error('Error processing unofficial run:', error);
    return NextResponse.json({ error: 'Failed to process unofficial run' }, { status: 500 });
  }
}
