/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress.
 */
import { type NextRequest, NextResponse } from 'next/server';

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
  runUrl: string | null = null,
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
      run_url: runUrl,
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

/**
 * Normalize aggregate eval rows into the EvalRow shape the frontend expects.
 *
 * When merging rows from multiple runs, pass `configIdOffset` so synthetic config
 * ids from this batch don't collide with ids already emitted by earlier batches.
 * Returns the rows and the maximum config id assigned, so the caller can advance
 * the offset for the next batch.
 */
export function normalizeEvalArtifactRows(
  rawRows: Record<string, unknown>[],
  date: string,
  timestamp: string,
  runUrl: string,
  configIdOffset = 0,
): { rows: EvalRow[]; maxConfigId: number } {
  const tracker = createSkipTracker();
  const configIds = new Map<string, number>();
  let nextLocalId = 1;
  const rows: EvalRow[] = [];

  for (const raw of rawRows) {
    const params = mapAggEvalRow(raw as Record<string, any>, tracker);
    if (!params) continue;

    const key = evalConfigKey(params.config);
    let localId = configIds.get(key);
    if (!localId) {
      localId = nextLocalId;
      configIds.set(key, localId);
      nextLocalId += 1;
    }

    rows.push({
      config_id: configIdOffset + localId,
      hardware: params.config.hardware,
      framework: params.config.framework,
      model: params.config.model,
      precision: params.config.precision,
      spec_method: params.config.specMethod,
      disagg: params.config.disagg,
      is_multinode: params.config.isMultinode,
      prefill_tp: params.config.prefillTp,
      prefill_ep: params.config.prefillEp,
      prefill_dp_attention: params.config.prefillDpAttn,
      prefill_num_workers: params.config.prefillNumWorkers,
      decode_tp: params.config.decodeTp,
      decode_ep: params.config.decodeEp,
      decode_dp_attention: params.config.decodeDpAttn,
      decode_num_workers: params.config.decodeNumWorkers,
      num_prefill_gpu: params.config.numPrefillGpu,
      num_decode_gpu: params.config.numDecodeGpu,
      task: params.task,
      date,
      conc: params.conc,
      metrics: params.metrics,
      timestamp,
      run_url: runUrl,
    });
  }

  return { rows, maxConfigId: configIdOffset + (nextLocalId - 1) };
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

/** Parse the runId query param into a list of unique numeric ids. */
function parseRunIds(raw: string | null): { ids: string[]; error: string | null } {
  if (!raw) return { ids: [], error: 'runId must be provided' };
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || !ids.every((id) => /^\d+$/.test(id))) {
    return { ids: [], error: 'runId must be a comma-separated list of numeric values' };
  }
  return { ids, error: null };
}

/** Fetch, download, and normalize data for a single run. Errors bubble as NextResponse. */
async function processSingleRun(
  runId: string,
  githubToken: string,
  evalConfigIdOffset: number,
): Promise<
  | { errorResponse: NextResponse }
  | {
      errorResponse: null;
      runInfo: ReturnType<typeof normalizeGithubRunInfo> & { isNonMainBranch: boolean };
      benchmarks: BenchmarkRow[];
      evaluations: EvalRow[];
      nextEvalConfigIdOffset: number;
    }
> {
  const runResp = await fetchGithubWorkflowRun(runId, githubToken);
  if (!runResp.ok) {
    return {
      errorResponse: NextResponse.json(
        { error: `GitHub API error for runId ${runId}: ${runResp.statusText}` },
        { status: runResp.status },
      ),
    };
  }
  const run = (await runResp.json()) as GithubWorkflowRun;

  const artifacts = await fetchGithubRunArtifacts(runId, githubToken);
  const bmkArtifact = artifacts
    .filter((a) => a.name === 'results_bmk')
    .toSorted((a, b) => b.id - a.id)[0];
  const evalArtifact = artifacts
    .filter((a) => a.name === 'eval_results_all')
    .toSorted((a, b) => b.id - a.id)[0];

  if (!bmkArtifact && !evalArtifact) {
    return {
      errorResponse: NextResponse.json(
        {
          error: `No results_bmk or eval_results_all artifact found for runId ${runId}`,
        },
        { status: 404 },
      ),
    };
  }

  const date = getRunDate(run);
  const runUrl = run.html_url ?? '';
  const timestamp = run.created_at ?? `${date}T00:00:00Z`;
  let benchmarks: BenchmarkRow[] = [];
  let evaluations: EvalRow[] = [];
  let nextEvalConfigIdOffset = evalConfigIdOffset;

  if (bmkArtifact) {
    const { rows, errorResponse } = await downloadArtifactRows(
      bmkArtifact.archive_download_url,
      githubToken,
    );
    if (errorResponse) return { errorResponse };
    benchmarks = normalizeArtifactRows(rows, date, runUrl || null);
  }

  if (evalArtifact) {
    const { rows, errorResponse } = await downloadArtifactRows(
      evalArtifact.archive_download_url,
      githubToken,
    );
    if (errorResponse) return { errorResponse };
    const normalized = normalizeEvalArtifactRows(rows, date, timestamp, runUrl, evalConfigIdOffset);
    evaluations = normalized.rows;
    nextEvalConfigIdOffset = normalized.maxConfigId;
  }

  return {
    errorResponse: null,
    runInfo: {
      ...normalizeGithubRunInfo(run),
      isNonMainBranch: run.head_branch !== 'main',
    },
    benchmarks,
    evaluations,
    nextEvalConfigIdOffset,
  };
}

export async function GET(request: NextRequest) {
  const { ids: runIds, error: runIdError } = parseRunIds(request.nextUrl.searchParams.get('runId'));
  if (runIdError) {
    return NextResponse.json({ error: runIdError }, { status: 400 });
  }

  const githubToken = getGithubToken();
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  try {
    const runInfos: (ReturnType<typeof normalizeGithubRunInfo> & {
      isNonMainBranch: boolean;
    })[] = [];
    const benchmarks: BenchmarkRow[] = [];
    const evaluations: EvalRow[] = [];
    let evalConfigIdOffset = 0;

    for (const runId of runIds) {
      const result = await processSingleRun(runId, githubToken, evalConfigIdOffset);
      if (result.errorResponse) return result.errorResponse;

      runInfos.push(result.runInfo);
      benchmarks.push(...result.benchmarks);
      evaluations.push(...result.evaluations);
      evalConfigIdOffset = result.nextEvalConfigIdOffset;
    }

    return NextResponse.json({
      runInfos,
      benchmarks,
      evaluations,
    });
  } catch (error) {
    console.error('Error processing unofficial run:', error);
    return NextResponse.json({ error: 'Failed to process unofficial run' }, { status: 500 });
  }
}
