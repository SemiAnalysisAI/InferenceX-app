import { type NextRequest, NextResponse } from 'next/server';

import { artifactRunId } from '@semianalysisai/inferencex-db/etl/tpu-normalization';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { mapAggEvalRow, type EvalParams } from '@semianalysisai/inferencex-db/etl/eval-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';

import {
  localArtifactPreviewEnabled,
  readLocalArtifactPreview,
} from '@/lib/github/local-artifact-preview';
import type { BenchmarkRow, EvalRow } from '@/lib/api/api';
import {
  downloadGithubArtifact,
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getGithubToken,
  getRunDate,
  normalizeGithubRunInfo,
  type GithubArtifact,
  type GithubWorkflowRun,
} from '@/lib/github/github-artifacts';

const PER_CONFIG_DOWNLOAD_BATCH_SIZE = 8;

export function normalizeArtifactRows(
  rawRows: Record<string, unknown>[],
  date: string,
  runUrl: string | null = null,
): BenchmarkRow[] {
  const tracker = createSkipTracker();
  const results: BenchmarkRow[] = [];
  for (const raw of rawRows) {
    const params = mapBenchmarkRow(
      raw as Record<string, any>,
      tracker,
      undefined,
      artifactRunId(runUrl),
    );
    if (!params) continue;
    const { config } = params;
    results.push({
      id: 0,
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
      benchmark_type: params.benchmarkType,
      offload_mode: params.offloadMode,
      isl: params.isl,
      osl: params.osl,
      conc: params.conc,
      image: params.image,
      recipe_fingerprint: params.recipeFingerprint,
      metrics: params.metrics,
      workers: params.workers,
      power_invalid_reasons: params.powerInvalidReasons,
      power_audit: params.powerAudit,
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
    const params = mapAggEvalRow(raw as Record<string, any>, tracker, artifactRunId(runUrl));
    if (!params) continue;

    const key = evalConfigKey(params.config);
    let localId = configIds.get(key);
    if (!localId) {
      localId = nextLocalId;
      configIds.set(key, localId);
      nextLocalId += 1;
    }

    rows.push({
      id: -1,
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
  if (ids.length === 0 || !ids.every((id) => /^\d+$/u.test(id))) {
    return { ids: [], error: 'runId must be a comma-separated list of numeric values' };
  }
  return { ids, error: null };
}

async function processSingleRun(
  runId: string,
  githubToken: string,
  evalConfigIdOffset: number,
  localPreview = false,
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
  const preview = localPreview ? await readLocalArtifactPreview(runId) : null;
  if (preview) {
    const { run } = preview;
    const date = getRunDate(run);
    const normalized = normalizeEvalArtifactRows(
      preview.evaluations,
      date,
      run.created_at,
      run.html_url,
      evalConfigIdOffset,
    );
    return {
      errorResponse: null,
      runInfo: { ...normalizeGithubRunInfo(run), isNonMainBranch: true },
      benchmarks: normalizeArtifactRows(preview.benchmarks, date, run.html_url),
      evaluations: normalized.rows,
      nextEvalConfigIdOffset: normalized.maxConfigId,
    };
  }
  if (!githubToken)
    return {
      errorResponse: NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 }),
    };
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

  const perConfigBmkArtifacts: GithubArtifact[] = bmkArtifact
    ? []
    : [
        ...artifacts
          .filter((a) => a.name.startsWith('bmk_'))
          .reduce((byName, a) => {
            const prev = byName.get(a.name);
            if (!prev || a.id > prev.id) byName.set(a.name, a);
            return byName;
          }, new Map<string, GithubArtifact>())
          .values(),
      ];

  if (!bmkArtifact && perConfigBmkArtifacts.length === 0 && !evalArtifact) {
    return {
      errorResponse: NextResponse.json(
        {
          error: `No results_bmk, per-config bmk_*, or eval_results_all artifact found for runId ${runId}`,
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
  } else if (perConfigBmkArtifacts.length > 0) {
    const rawRows: Record<string, unknown>[] = [];
    for (let i = 0; i < perConfigBmkArtifacts.length; i += PER_CONFIG_DOWNLOAD_BATCH_SIZE) {
      const batch = perConfigBmkArtifacts.slice(i, i + PER_CONFIG_DOWNLOAD_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((a) => downloadArtifactRows(a.archive_download_url, githubToken)),
      );
      for (const result of results) {
        if (result.errorResponse) return { errorResponse: result.errorResponse };
        rawRows.push(...result.rows);
      }
    }
    benchmarks = normalizeArtifactRows(rawRows, date, runUrl || null);
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
  const localPreview = localArtifactPreviewEnabled(request.nextUrl.hostname);
  if (!githubToken && !localPreview) {
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
      const result = await processSingleRun(
        runId,
        githubToken ?? '',
        evalConfigIdOffset,
        localPreview,
      );
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
