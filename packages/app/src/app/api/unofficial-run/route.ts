/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { NextRequest, NextResponse } from 'next/server';

import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  getRunDate,
  normalizeGithubRunInfo,
  type GithubWorkflowRun,
} from '@/lib/github-artifacts';

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

/** Extract all valid JSON files from a ZIP buffer; malformed JSON entries are skipped. */
function extractJsonFromZip(buffer: Buffer): Record<string, unknown>[] {
  return extractZipEntries(buffer, '.json', (_entryName, contents) => {
    const data = JSON.parse(contents) as Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(data) ? data : [data];
  });
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('runId');
  if (!runId || !/^\d+$/.test(runId)) {
    return NextResponse.json({ error: 'runId must be a numeric value' }, { status: 400 });
  }

  const githubToken = getGithubToken();
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  try {
    // Fetch workflow run metadata
    const runResp = await fetchGithubWorkflowRun(runId, githubToken);
    if (!runResp.ok) {
      return NextResponse.json(
        { error: `GitHub API: ${runResp.statusText}` },
        { status: runResp.status },
      );
    }
    const run = (await runResp.json()) as GithubWorkflowRun;

    // Fetch artifacts, find latest results_bmk
    const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

    const bmkArtifact = artifacts
      .filter((a) => a.name === 'results_bmk')
      .sort((a, b) => b.id - a.id)[0];

    if (!bmkArtifact) {
      return NextResponse.json({ error: 'No results_bmk artifact found' }, { status: 404 });
    }

    // Download and extract benchmark data
    const dlResp = await downloadGithubArtifact(bmkArtifact.archive_download_url, githubToken);
    if (!dlResp.ok) {
      return NextResponse.json(
        { error: `Artifact download failed: ${dlResp.statusText}` },
        { status: dlResp.status },
      );
    }

    const rawRows = extractJsonFromZip(Buffer.from(await dlResp.arrayBuffer()));
    const date = getRunDate(run);
    const benchmarks = normalizeArtifactRows(rawRows, date);

    return NextResponse.json({
      runInfo: {
        ...normalizeGithubRunInfo(run),
        isNonMainBranch: run.head_branch !== 'main',
      },
      benchmarks,
    });
  } catch (error) {
    console.error('Error processing unofficial run:', error);
    return NextResponse.json({ error: 'Failed to process unofficial run' }, { status: 500 });
  }
}
