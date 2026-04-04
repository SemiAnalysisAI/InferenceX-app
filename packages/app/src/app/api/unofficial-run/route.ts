/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { NextRequest, NextResponse } from 'next/server';

import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { mapAggEvalRow, type EvalParams } from '@semianalysisai/inferencex-db/etl/eval-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

import type { BenchmarkRow, EvalRow } from '@/lib/api';
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
export function normalizeArtifactRows(
  rawRows: Record<string, unknown>[],
  date: string,
): BenchmarkRow[] {
  const tracker = createSkipTracker();
  const results: BenchmarkRow[] = [];
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
      run_url: null,
    });
  }
  return results;
}

function evalConfigKey(config: EvalParams['config']): string {
  return [
    config.hardware,
    config.framework,
    config.model,
    config.precision,
    config.specMethod,
    config.disagg ? '1' : '0',
    config.prefillTp,
    config.prefillEp,
    config.prefillDpAttn ? '1' : '0',
    config.prefillNumWorkers,
    config.decodeTp,
    config.decodeEp,
    config.decodeDpAttn ? '1' : '0',
    config.decodeNumWorkers,
    config.numPrefillGpu,
    config.numDecodeGpu,
  ].join('|');
}

/** Normalize aggregate eval rows into the EvalRow shape the frontend expects. */
export function normalizeEvalArtifactRows(
  rawRows: Record<string, unknown>[],
  date: string,
  timestamp: string,
  runUrl: string,
): EvalRow[] {
  const tracker = createSkipTracker();
  const configIds = new Map<string, number>();
  let nextConfigId = 1;
  const results: EvalRow[] = [];

  for (const raw of rawRows) {
    const params = mapAggEvalRow(raw as Record<string, any>, tracker);
    if (!params) continue;

    const key = evalConfigKey(params.config);
    let configId = configIds.get(key);
    if (!configId) {
      configId = nextConfigId;
      configIds.set(key, configId);
      nextConfigId += 1;
    }

    results.push({
      config_id: configId,
      hardware: params.config.hardware,
      framework: params.config.framework,
      model: params.config.model,
      precision: params.config.precision,
      spec_method: params.config.specMethod,
      decode_tp: params.config.decodeTp,
      decode_ep: params.config.decodeEp,
      decode_dp_attention: params.config.decodeDpAttn,
      task: params.task,
      date,
      conc: params.conc,
      metrics: params.metrics,
      timestamp,
      run_url: runUrl,
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

async function downloadArtifactRows(archiveUrl: string, githubToken: string) {
  const response = await downloadGithubArtifact(archiveUrl, githubToken);
  if (!response.ok) {
    return {
      rows: [] as Record<string, unknown>[],
      errorResponse: NextResponse.json(
        { error: `Artifact download failed: ${response.statusText}` },
        { status: response.status },
      ),
    };
  }

  const rows = extractJsonFromZip(Buffer.from(await response.arrayBuffer()));
  return { rows, errorResponse: null };
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

    // Fetch artifacts, find latest benchmark/eval aggregates
    const artifacts = await fetchGithubRunArtifacts(runId, githubToken);

    const bmkArtifact = artifacts
      .filter((a) => a.name === 'results_bmk')
      .sort((a, b) => b.id - a.id)[0];

    const evalArtifact = artifacts
      .filter((a) => a.name === 'eval_results_all')
      .sort((a, b) => b.id - a.id)[0];

    if (!bmkArtifact && !evalArtifact) {
      return NextResponse.json(
        { error: 'No results_bmk or eval_results_all artifact found' },
        { status: 404 },
      );
    }

    const date = getRunDate(run);
    const runUrl = run.html_url ?? '';
    const timestamp = run.created_at ?? `${date}T00:00:00Z`;
    let benchmarks: BenchmarkRow[] = [];
    let evaluations: EvalRow[] = [];

    if (bmkArtifact) {
      const { rows, errorResponse } = await downloadArtifactRows(
        bmkArtifact.archive_download_url,
        githubToken,
      );
      if (errorResponse) return errorResponse;
      benchmarks = normalizeArtifactRows(rows, date);
    }

    if (evalArtifact) {
      const { rows, errorResponse } = await downloadArtifactRows(
        evalArtifact.archive_download_url,
        githubToken,
      );
      if (errorResponse) return errorResponse;
      evaluations = normalizeEvalArtifactRows(rows, date, timestamp, runUrl);
    }

    return NextResponse.json({
      runInfo: {
        ...normalizeGithubRunInfo(run),
        isNonMainBranch: run.head_branch !== 'main',
      },
      benchmarks,
      evaluations,
    });
  } catch (error) {
    console.error('Error processing unofficial run:', error);
    return NextResponse.json({ error: 'Failed to process unofficial run' }, { status: 500 });
  }
}
