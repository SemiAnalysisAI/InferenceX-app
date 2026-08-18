/**
 * Per-run overrides and special cases for the ingest pipeline.
 *
 * Entries are enforced at ingest time. Changes merged to main or master are also applied
 * automatically to production by CI, followed by database verification, cache invalidation,
 * and cache warmup. Use `bun run db:apply-overrides` only for local preview or manual recovery.
 *
 * CONCLUSION_OVERRIDES — force the conclusion for a run (e.g. 'success' when
 *   the benchmark ran fine but CI failed on a non-benchmark step).
 *
 * PURGED_RUNS — runs to skip on ingest and delete from the DB,
 *   e.g. typically due to experimental runs or features which generate lots of broken data.
 *
 * PURGED_RUN_ATTEMPTS — purge only specific attempts of a run, leaving the others intact.
 *   Use this when a single attempt produced bad data but a later attempt is expected to succeed
 *   (or has already succeeded), so we can't nuke the entire run.
 *
 * PURGED_BENCHMARK_POINTS, purge individual benchmark rows from an otherwise valid
 * run attempt and skip them on every future ingest. Each entry uses the row's durable
 * database natural key, which can be queried from the linked dashboard point.
 *
 * CHANGELOG_BACKFILLS — correct stored changelog metadata for one exact run attempt
 * and base/head ref pair.
 *
 * BENCHMARK_POINT_BACKFILLS — correct metrics and/or offload identity for one exact
 * benchmark point. These are applied both during ingest and against existing DB rows.
 *
 * Note: GitHub deletes old workflow runs over time so these overrides may not be applicable forever,
 *       but we should keep them around for historical reference. You can find these on github (if available) by filling
 *       in the run id into the following link: https://github.com/SemiAnalysisAI/InferenceX/actions/runs/{run_id_here}
 */

export const CONCLUSION_OVERRIDES: ReadonlyMap<number, string> = new Map([
  [22806827144, 'success'], // 2026-03-07 | dsr1 fp8 h200 SGLang 0.5.7→0.5.9 bump | Reason: database upload step failed
  [22792161490, 'success'], // 2026-03-07 | GLM-5 fp8 mi355x SGLang benchmark add | Reason: database upload step failed
]);

export const PURGED_RUNS: ReadonlySet<number> = new Set([
  20286769842, // very long ago | Reason: broken run
  20789830797, // very long ago | Reason: broken run
  21427451958, // 2026-01-28 | Reason: for initial gsm8k evals baseline data collection, performance data ignored for this run
  22911224698, // 2026-03-10 | Reason: flaky run, re-ran in run //TODO: find run id and link it
  23445026367, // 2026-03-23 | Reason: change to MI355X cluster was unnecessary
  23444121669, // 2026-03-23 | Reason: change to MI355X cluster was unnecessary
  23551565730, // 2026-03-25 | Reason: accidental merge
  23551319227, // 2026-03-25 | Reason: accidental merge
  24152261349, // 2026-04-08 | Reason: accidental merge
  24440780992, // 2026-04-15 | Reason: runner name changed causing runner launcher to not be found
  24566910305, // 2026-04-17 | Reason: misconfigured diff on original pr causing sweep to fail
  24567247324, // 2026-04-17 | Reason: incorrect b300 recipes
  24567302524, // 2026-04-17 | Reason: incorrect b300 recipes
  24953342301, // 2026-04-25 | Reason: incorrect usage of run sweep and sweep failed, fixed in subsequent PR
  24954587925, // 2026-04-25 | Reason: incorrect usage of run sweep and sweep failed, fixed in subsequent PR
  24954912912, // 2026-04-25 | Reason: incorrect usage of run sweep and sweep failed, fixed in subsequent PR
  24959542295, // 2026-04-25 | Reason: MTP without chat template leads to supernatural AR
  24960716250, // 2026-04-25 | Reason: incorrect usage of run sweep and sweep failed, fixed in subsequent PR
  25603981395, // 2026-05-09 | Reason: not enough successful points on pareto
  28505258231, // 2026-07-01 | Reason: cross-layer indexer top-k sharing (--hf-overrides index_topk_freq=4); skips FLOPs
  28507173993, // 2026-07-01 | Reason: cross-layer indexer top-k sharing (--hf-overrides index_topk_freq=4); skips FLOPs
  29089300938, // 2026-07-10 | Reason: reverting due to rule to disallow any patching
  29425167775, // 2026-07-15 | Reason: reverting per rule that recipes PRs must merge before the InferenceX PR; also used the wrong draft model
  29427827757, // 2026-07-15 | Reason: sweep-reuse recovery of the run above (PR #2158) — reverted for the same reason
  29509107670, // 2026-07-16 | Reason: accidental ingest while testing (e2e Test dsv4 agentic, branch amd/agentx_dsv4_sgl_mtp_debug)
  29512851569, // 2026-07-16 | Reason: accidental ingest while testing (e2e Test dsv4 agentic, branch amd/agentx_dsv4_sgl_mtp_debug)
  29651589976, // 2026-07-18 | Reason: accidental ingest while testing (e2e Test dsv4 agentic, branch amd/agentx_dsv4_sgl_mtp_0717)
  29651793829, // 2026-07-18 | Reason: accidental ingest while testing (e2e Test dsv4 agentic, branch amd/agentx_dsv4_sgl_mtp_0717)
  29651909085, // 2026-07-18 | Reason: accidental ingest while testing (e2e Test dsv4 agentic, branch amd/agentx_dsv4_sgl_mtp_0717)
  29651998085, // 2026-07-18 | Reason: accidental ingest while testing (e2e Test dsv4-fp4-mi355x-sglang-agentic-mtp, branch amd/agentx_dsv4_sgl_mtp_0717)
  29654139122, // 2026-07-18 | Reason: accidental ingest while testing
  29660737166, // 2026-07-18 | Reason: accidental ingest while testing
  29702212452, // 2026-07-19 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch feat/glm52-mi325x-agentx-full-context)
  29741710665, // 2026-07-20 | Reason: No non-MTP AgentX — glm5.2-fp4-b300-sglang-agentic runs without speculative decoding, and GLM-5.2 agentic coding is published MTP-only per MODELS.md; the replacement arm glm5.2-fp4-b300-sglang-agentic-mtp landed in #2447 (source run of the PR #2281 DEP/conc-64 sweep)
  29811350508, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-pp-pareto)
  29819261957, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test dsv4-fp4-mi355x-sglang-disagg-agentic-hicache, branch amd/agentx-v1.0-th-hicon)
  29820102138, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-pp-pareto)
  29874235202, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29874236524, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29874237934, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29874239449, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29874240755, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29874242029, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29877960458, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29878256381, // 2026-07-21 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29881040402, // 2026-07-22 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29881640438, // 2026-07-22 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29882624421, // 2026-07-22 | Reason: accidental ingest while testing (e2e Test GLM-5.2 AgentX, branch explore/glm52-h200-agentx-tuning-round2)
  29912027293, // 2026-07-22 | Reason: accidental ingest while testing
  30346826643, // 2026-07-28 | Initial AMD submission for MiniMax M3 used incorrect AgentX harness; MTP/spec decode is AgentX-only. Will update after harness updates.
  30405836523, // 2026-07-28 | Reason: No non-DSpark — kimik3-fp4-b300-vllm-agentic AgentX points run without speculative decoding, and Kimi-K3 agentic coding is published DSpark-only (source run of the PR #2397 sweep-reuse ingest)
]);

export const PURGED_RUN_ATTEMPTS: ReadonlyMap<number, ReadonlySet<number>> = new Map([
  [25199291771, new Set([1, 2])], // 2026-05-01 | dsv4 GB200 dynamo-vllm MTP2 | Reason: only 2 of 6 conc points uploaded on both attempts. re-run pending
  [28911223583, new Set([3])], // 2026-07-09 | DeepSeek-V4 FP4 MI355X vLLM agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [28955639528, new Set([3])], // 2026-07-09 | DeepSeek-V4 FP4 B200/B300 SGLang agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29376853679, new Set([1])], // 2026-07-20 | DeepSeek-V4 FP4 MI355X Mori-SGLang disaggregated agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29385297092, new Set([4])], // 2026-07-16 | DeepSeek-V4 FP4 GB300 Dynamo-SGLang MTP agentic | Reason: Outdated AgentX harness
  [29413860950, new Set([3])], // 2026-07-16 | DeepSeek-V4 FP4 MI355X SGLang HiCache agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29445892486, new Set([2])], // 2026-07-16 | DeepSeek-V4 FP4 B200 vLLM agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29486959583, new Set([2])], // 2026-07-16 | DeepSeek-V4 FP4 B300 vLLM agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29506569772, new Set([2])], // 2026-07-16 | Kimi K2.5 FP4 B300 vLLM MTP agentic | Reason: AgentX is no longer supported for this model
  [29651235293, new Set([1])], // 2026-08-07 | GLM-5.2 NVFP4 B300 SGLang single-node agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29657732517, new Set([1])], // 2026-07-18 | GLM-5.2 FP8 MI325X SGLang 1M agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29682242847, new Set([1])], // 2026-08-07 | GLM-5.2 NVFP4 B300 SGLang agentic HiCache | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29706766201, new Set([5])], // 2026-07-21 | DeepSeek-V4 FP4 B300 vLLM LMCache agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29706772949, new Set([3])], // 2026-07-21 | DeepSeek-V4 FP4 B200 vLLM LMCache agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [29765418393, new Set([5])], // 2026-07-20 | MiniMax M2.7 FP4 B200 SGLang MTP agentic | Reason: AgentX is no longer supported for this model
  [29778042138, new Set([1])], // 2026-07-21 | DeepSeek-V4 FP4 B300 vLLM MTP agentic | Reason: Outdated AgentX harness; corrected by v1+ runs 31192604550 and 31415828111
  [29778042858, new Set([2])], // 2026-07-22 | DeepSeek-V4 FP4 B200 vLLM MTP agentic | Reason: Outdated AgentX harness; corrected by v1+ run 31192602558
  [30133534310, new Set([1])], // 2026-07-24 | GLM-5.2 FP8 H200 Dynamo-SGLang 1P2D agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [30133535261, new Set([1])], // 2026-07-24 | GLM-5.2 FP8 H200 Dynamo-SGLang 2P2D agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [30133570824, new Set([1])], // 2026-07-24 | GLM-5.2 FP8 H200 Dynamo-SGLang 2P4D agentic | Reason: Non MTP which we aren't focusing on for AgentX as well as outdated AgentX harness
  [30231719317, new Set([1])], // 2026-07-27 | DeepSeek-V4 FP4 GB300 Dynamo-vLLM MTP agentic | Reason: Outdated AgentX harness
  [30391410523, new Set([1])], // 2026-07-30 | Qwen3.5 FP4 GB300 Dynamo-SGLang MTP agentic | Reason: Outdated AgentX harness; corrected by v1+ run 31042542308
  [30425131777, new Set([3])], // 2026-07-30 | Kimi K3 FP4 B300 vLLM MTP agentic | Reason: Outdated AgentX harness
]);

export interface BenchmarkPointKey {
  configId: number;
  benchmarkType: string;
  isl: number | null;
  osl: number | null;
  conc: number;
  offloadMode: string;
  /** Producer recipe identity. Omit or set null only for legacy rows. */
  recipeFingerprint?: string | null;
}

export interface PurgedBenchmarkPoint extends BenchmarkPointKey {
  githubRunId: number;
  runAttempt: number;
}

/**
 * Individual benchmark rows to skip on ingest and delete from the DB.
 * Keep a dated reason comment beside every entry for auditability:
 * `{ githubRunId, runAttempt, configId, benchmarkType, isl, osl, conc, offloadMode,
 * recipeFingerprint }`. Omitted fingerprints target only legacy NULL rows.
 */
export const PURGED_BENCHMARK_POINTS: readonly PurgedBenchmarkPoint[] = [];

interface AuditedBackfill {
  /** Stable, descriptive identifier used in logs and review history. */
  id: string;
  /** Why artifact data is being corrected instead of re-running the benchmark. */
  reason: string;
}

export interface ChangelogBackfill extends AuditedBackfill {
  githubRunId: number;
  runAttempt: number;
  baseRef: string;
  headRef: string;
  set: {
    configKeys?: readonly string[];
    description?: string;
    prLink?: string | null;
    appendOnly?: boolean;
  };
}

/**
 * Audited corrections to changelog rows already produced by workflow artifacts.
 * Selectors use the table's complete durable identity. `set` is a partial patch.
 */
export const CHANGELOG_BACKFILLS: readonly ChangelogBackfill[] = [];

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface BenchmarkPointBackfill extends BenchmarkPointKey, AuditedBackfill {
  githubRunId: number;
  runAttempt: number;
  set: {
    /** Updates both the first-class column and metrics.offload_mode. */
    offloadMode?: 'on' | 'off';
    /** Shallow JSONB merge; existing unrelated metrics are preserved. */
    metricsMerge?: Readonly<Record<string, JsonValue>>;
    /** Top-level metric keys to remove before metricsMerge is applied. */
    metricsRemove?: readonly string[];
  };
}

/**
 * Audited corrections to individual benchmark points. The selector is the row's
 * complete pre-backfill natural identity; `set` contains only the desired changes.
 *
 * Example:
 * {
 *   id: 'run-123-attempt-1-conc-64-enable-offload',
 *   reason: 'The artifact omitted offload metadata for this point.',
 *   githubRunId: 123,
 *   runAttempt: 1,
 *   configId: 456,
 *   benchmarkType: 'agentic_traces',
 *   isl: null,
 *   osl: null,
 *   conc: 64,
 *   offloadMode: 'off',
 *   recipeFingerprint: null,
 *   set: {
 *     offloadMode: 'on',
 *     metricsMerge: { kv_offloading: 'dram', kv_offload_backend: 'lmcache' },
 *   },
 * }
 */
export const BENCHMARK_POINT_BACKFILLS: readonly BenchmarkPointBackfill[] = [
  // The source recipes in run 31633154542 attach MooncakeStoreConnector to
  // every disaggregated worker and allocate a 180 GB Mooncake segment per
  // node. The master matrix omitted the corresponding offload annotation.
  ...(
    [
      [2106, 256, null],
      [2334, 1152, null],
      [2336, 1024, null],
    ] as const
  ).map(([configId, conc, recipeFingerprint]) => ({
    id: `run-31633154542-config-${configId}-conc-${conc}-mooncake-offload`,
    reason:
      'The runtime recipe enabled MooncakeStoreConnector, but the artifact reported this AgentX point as non-offloaded.',
    githubRunId: 31633154542,
    runAttempt: 2,
    configId,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc,
    offloadMode: 'off',
    recipeFingerprint,
    set: {
      offloadMode: 'on' as const,
      metricsRemove: ['allocated_cpu_dram_gb'],
      metricsMerge: {
        kv_offloading: 'dram',
        kv_offload_backend: 'mooncake',
        kv_offload_backend_version: '0.3.11.post1',
      },
    },
  })),

  // Every TensorRT-LLM recipe in run 31927376673 configures a 128 GiB native
  // host KV cache on both prefill and decode workers. The master matrix only
  // declared NIXL transfer, so all six artifacts lost the offload identity.
  ...(
    [
      [2360, 7, '5c282408e21b662cf5afbef0d26a63ad2fb19bb66ca3b431763a1c40628f3036'],
      [2361, 96, 'da36b834945785abfa06c44f742684db7a96af49542d9012019063d552dc7393'],
      [2362, 704, '60e4361ec00fd8a94a700b7ae9dbb4d8b6cf4095b1553f098af45551669fcf1f'],
      [2363, 52, 'd7fccb3572037431f39757640d090ab1204bb27ac57ff0f9f9a635e9cefb5867'],
      [2364, 565, 'a6017a5c8a675fb4f1f74e49bb0091f172e6ea357a1bb1b2d6577eb661c9f1c5'],
      [2365, 44, 'ac8406a4d46f3711732aa352c801bbd1eb7c3545b2982c5d2c56520fa8288342'],
    ] as const
  ).map(([configId, conc, recipeFingerprint]) => ({
    id: `run-31927376673-config-${configId}-conc-${conc}-native-offload`,
    reason:
      'The TensorRT-LLM runtime recipe configured a native host KV cache, but the artifact reported this AgentX point as non-offloaded.',
    githubRunId: 31927376673,
    runAttempt: 1,
    configId,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc,
    offloadMode: 'off',
    recipeFingerprint,
    set: {
      offloadMode: 'on' as const,
      metricsRemove: ['allocated_cpu_dram_gb'],
      metricsMerge: {
        kv_offloading: 'dram',
        kv_offload_backend: 'native',
        kv_offload_backend_version: '1.3.0rc24',
      },
    },
  })),

  // The four disaggregated recipes in run 31965016666 attach
  // MooncakeStoreConnector to NIXL through MultiConnector and allocate a
  // 140 GB Mooncake segment per node. The three aggregate points in the same
  // run do not attach the connector and are intentionally excluded.
  ...(
    [
      [1012, 128, 'b01cb33e392b60b01e2f498ea7300118c6046e074556199a3fe9a7208cf7929e'],
      [1012, 256, '856babb1e00e524c7eddca689e1345d1a97a41f6743c5d5c109347444581aeef'],
      [2374, 576, 'd7afa7f01be968e02911263a9792bb1200ca27de702b5e79d7907e6d46adfc44'],
      [2375, 512, '47a4969f521268bccc1a3efd97a5ceaf231ff33ab13fa6fe3f9cadf48573f2b1'],
    ] as const
  ).map(([configId, conc, recipeFingerprint]) => ({
    id: `run-31965016666-config-${configId}-conc-${conc}-mooncake-offload`,
    reason:
      'The runtime recipe enabled MooncakeStoreConnector, but the artifact reported this AgentX point as non-offloaded.',
    githubRunId: 31965016666,
    runAttempt: 2,
    configId,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc,
    offloadMode: 'off',
    recipeFingerprint,
    set: {
      offloadMode: 'on' as const,
      metricsRemove: ['allocated_cpu_dram_gb'],
      metricsMerge: {
        kv_offloading: 'dram',
        kv_offload_backend: 'mooncake',
        kv_offload_backend_version: '0.3.11.post1',
      },
    },
  })),
];

function pointIdentity(
  point: BenchmarkPointKey & { githubRunId: number; runAttempt: number },
): string {
  return JSON.stringify([
    point.githubRunId,
    point.runAttempt,
    point.configId,
    point.benchmarkType,
    point.isl,
    point.osl,
    point.conc,
    point.offloadMode,
    point.recipeFingerprint ?? null,
  ]);
}

function validatePositiveInteger(value: number, label: string, id: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${id}: ${label} must be a positive integer`);
  }
}

/** Validate the backfill ledger before an ingest or database write starts. */
export function validateRunBackfills(
  changelogs: readonly ChangelogBackfill[] = CHANGELOG_BACKFILLS,
  points: readonly BenchmarkPointBackfill[] = BENCHMARK_POINT_BACKFILLS,
): void {
  const ids = new Set<string>();
  const changelogIdentities = new Set<string>();
  const pointSourceIdentities = new Map<string, string>();
  const pointDesiredIdentities = new Map<string, string>();

  for (const backfill of [...changelogs, ...points]) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(backfill.id)) {
      throw new Error(`${backfill.id || '<empty>'}: id must be lowercase kebab-case`);
    }
    if (ids.has(backfill.id)) throw new Error(`duplicate backfill id: ${backfill.id}`);
    ids.add(backfill.id);
    if (backfill.reason.trim().length === 0) {
      throw new Error(`${backfill.id}: reason must not be empty`);
    }
    validatePositiveInteger(backfill.githubRunId, 'githubRunId', backfill.id);
    validatePositiveInteger(backfill.runAttempt, 'runAttempt', backfill.id);
    if (PURGED_RUNS.has(backfill.githubRunId)) {
      throw new Error(`${backfill.id}: run is already in PURGED_RUNS`);
    }
    if (PURGED_RUN_ATTEMPTS.get(backfill.githubRunId)?.has(backfill.runAttempt)) {
      throw new Error(`${backfill.id}: run attempt is already in PURGED_RUN_ATTEMPTS`);
    }
  }

  for (const backfill of changelogs) {
    if (backfill.baseRef.length === 0 || backfill.headRef.length === 0) {
      throw new Error(`${backfill.id}: baseRef and headRef must not be empty`);
    }
    if (
      backfill.set.configKeys === undefined &&
      backfill.set.description === undefined &&
      backfill.set.prLink === undefined &&
      backfill.set.appendOnly === undefined
    ) {
      throw new Error(`${backfill.id}: set must change at least one field`);
    }
    if (backfill.set.configKeys?.some((key) => key.length === 0)) {
      throw new Error(`${backfill.id}: configKeys must not contain empty values`);
    }
    const identity = JSON.stringify([
      backfill.githubRunId,
      backfill.runAttempt,
      backfill.baseRef,
      backfill.headRef,
    ]);
    if (changelogIdentities.has(identity)) {
      throw new Error(`${backfill.id}: duplicate changelog selector ${identity}`);
    }
    changelogIdentities.add(identity);
  }

  for (const backfill of points) {
    validatePositiveInteger(backfill.configId, 'configId', backfill.id);
    validatePositiveInteger(backfill.conc, 'conc', backfill.id);
    if (backfill.benchmarkType.length === 0 || backfill.offloadMode.length === 0) {
      throw new Error(`${backfill.id}: benchmarkType and offloadMode must not be empty`);
    }
    if (backfill.isl !== null) validatePositiveInteger(backfill.isl, 'isl', backfill.id);
    if (backfill.osl !== null) validatePositiveInteger(backfill.osl, 'osl', backfill.id);
    if (backfill.recipeFingerprint === '') {
      throw new Error(`${backfill.id}: recipeFingerprint must be null or non-empty`);
    }
    const mergeKeys = Object.keys(backfill.set.metricsMerge ?? {});
    const removeKeys = backfill.set.metricsRemove ?? [];
    if (
      backfill.set.offloadMode === undefined &&
      mergeKeys.length === 0 &&
      removeKeys.length === 0
    ) {
      throw new Error(`${backfill.id}: set must change at least one field`);
    }
    if (mergeKeys.includes('offload_mode') || removeKeys.includes('offload_mode')) {
      throw new Error(`${backfill.id}: use set.offloadMode to change metrics.offload_mode`);
    }
    if (new Set(removeKeys).size !== removeKeys.length || removeKeys.some((key) => key === '')) {
      throw new Error(`${backfill.id}: metricsRemove keys must be unique and non-empty`);
    }
    const overlap = mergeKeys.find((key) => removeKeys.includes(key));
    if (overlap) throw new Error(`${backfill.id}: metric ${overlap} is both merged and removed`);

    const sourceIdentity = pointIdentity(backfill);
    if (pointSourceIdentities.has(sourceIdentity)) {
      throw new Error(`${backfill.id}: duplicate benchmark point selector ${sourceIdentity}`);
    }
    pointSourceIdentities.set(sourceIdentity, backfill.id);

    const desiredIdentity = pointIdentity({
      ...backfill,
      offloadMode: backfill.set.offloadMode ?? backfill.offloadMode,
    });
    if (pointDesiredIdentities.has(desiredIdentity)) {
      throw new Error(`${backfill.id}: desired point identity collides with another backfill`);
    }
    pointDesiredIdentities.set(desiredIdentity, backfill.id);

    if (
      PURGED_BENCHMARK_POINTS.some((purged) => {
        const purgedIdentity = pointIdentity(purged);
        return purgedIdentity === sourceIdentity || purgedIdentity === desiredIdentity;
      })
    ) {
      throw new Error(`${backfill.id}: source or desired point is already being purged`);
    }
  }

  for (const [identity, desiredBy] of pointDesiredIdentities) {
    const selectedBy = pointSourceIdentities.get(identity);
    if (selectedBy !== undefined && selectedBy !== desiredBy) {
      throw new Error(
        `${desiredBy}: desired point identity collides with selector from ${selectedBy}`,
      );
    }
  }
}

interface BackfillablePoint extends BenchmarkPointKey {
  metrics: Record<string, unknown>;
}

export interface AppliedBenchmarkPointBackfill<T extends BackfillablePoint> {
  point: T;
  backfillId: string | null;
  sourceIdentity: string;
  desiredIdentity: string;
}

interface BackfillableChangelogEntry {
  configKeys: string[];
  description: string;
  prLink: string | null;
  appendOnly: boolean;
}

interface BackfillableChangelog<T extends BackfillableChangelogEntry> {
  baseRef: string;
  headRef: string;
  entries: T[];
}

/** Apply changelog corrections before artifact metadata is written to PostgreSQL. */
export function applyChangelogBackfills<T extends BackfillableChangelogEntry>(
  githubRunId: number,
  runAttempt: number | null | undefined,
  changelogs: readonly BackfillableChangelog<T>[],
): { changelogs: BackfillableChangelog<T>[]; backfillIds: string[] } {
  const relevant = CHANGELOG_BACKFILLS.filter(
    (backfill) =>
      backfill.githubRunId === githubRunId &&
      (runAttempt === null || runAttempt === undefined || backfill.runAttempt === runAttempt),
  );
  const corrected = changelogs.map((changelog) => ({
    ...changelog,
    entries: [...changelog.entries],
  }));
  const backfillIds: string[] = [];

  for (const changelog of corrected) {
    const matches = relevant.filter(
      (backfill) =>
        backfill.baseRef === changelog.baseRef && backfill.headRef === changelog.headRef,
    );
    if (matches.length > 1) {
      throw new Error(
        `changelog matches multiple backfills: ${matches.map((backfill) => backfill.id).join(', ')}`,
      );
    }
    const [backfill] = matches;
    if (!backfill || changelog.entries.length === 0) continue;

    const { appendOnly } = backfill.set;
    if (appendOnly !== undefined) {
      changelog.entries = changelog.entries.map((entry) => ({
        ...entry,
        appendOnly,
      }));
    }
    // ingestChangelogEntries upserts every entry onto the same (run, base, head)
    // identity, so the final artifact entry is the row that persists.
    const entryIndex = changelog.entries.length - 1;
    const entry = changelog.entries[entryIndex];
    changelog.entries[entryIndex] = {
      ...entry,
      ...(backfill.set.configKeys === undefined
        ? {}
        : { configKeys: [...backfill.set.configKeys] }),
      ...(backfill.set.description === undefined ? {} : { description: backfill.set.description }),
      ...(backfill.set.prLink === undefined ? {} : { prLink: backfill.set.prLink }),
    };
    backfillIds.push(backfill.id);
  }

  return { changelogs: corrected, backfillIds };
}

function matchesBenchmarkPoint(point: BenchmarkPointKey, selector: BenchmarkPointKey): boolean {
  return (
    point.configId === selector.configId &&
    point.benchmarkType === selector.benchmarkType &&
    point.isl === selector.isl &&
    point.osl === selector.osl &&
    point.conc === selector.conc &&
    point.offloadMode === selector.offloadMode &&
    (point.recipeFingerprint ?? null) === (selector.recipeFingerprint ?? null)
  );
}

/** Apply one point patch to an ingest row before it reaches PostgreSQL. */
export function applyBenchmarkPointBackfill<T extends BackfillablePoint>(
  githubRunId: number,
  runAttempt: number | null | undefined,
  point: T,
): AppliedBenchmarkPointBackfill<T> {
  const sourceIdentity = JSON.stringify([
    point.configId,
    point.benchmarkType,
    point.isl,
    point.osl,
    point.conc,
    point.offloadMode,
    point.recipeFingerprint ?? null,
  ]);
  const matches = BENCHMARK_POINT_BACKFILLS.filter(
    (backfill) =>
      backfill.githubRunId === githubRunId &&
      (runAttempt === null || runAttempt === undefined || backfill.runAttempt === runAttempt) &&
      matchesBenchmarkPoint(point, backfill),
  );
  if (matches.length > 1) {
    throw new Error(
      `benchmark point matches multiple backfills: ${matches.map((b) => b.id).join(', ')}`,
    );
  }
  const [backfill] = matches;
  if (!backfill) {
    return { point, backfillId: null, sourceIdentity, desiredIdentity: sourceIdentity };
  }

  const metrics = { ...point.metrics };
  for (const key of backfill.set.metricsRemove ?? []) delete metrics[key];
  Object.assign(metrics, backfill.set.metricsMerge);
  const offloadMode = backfill.set.offloadMode ?? point.offloadMode;
  if (backfill.set.offloadMode !== undefined) metrics.offload_mode = offloadMode;
  const patched = { ...point, offloadMode, metrics };
  const desiredIdentity = JSON.stringify([
    patched.configId,
    patched.benchmarkType,
    patched.isl,
    patched.osl,
    patched.conc,
    patched.offloadMode,
    patched.recipeFingerprint ?? null,
  ]);
  return {
    point: patched,
    backfillId: backfill.id,
    sourceIdentity,
    desiredIdentity,
  };
}

/** Fail if two distinct artifact points collapse onto one identity after correction. */
export function recordBackfilledPointIdentity(
  seen: Map<string, string>,
  sourceIdentity: string,
  desiredIdentity: string,
): void {
  const existingSource = seen.get(desiredIdentity);
  if (existingSource !== undefined && existingSource !== sourceIdentity) {
    throw new Error(
      `benchmark point backfill collision: ${existingSource} and ${sourceIdentity} both become ${desiredIdentity}`,
    );
  }
  seen.set(desiredIdentity, sourceIdentity);
}

/**
 * True when this exact benchmark result is suppressed. When an ingest source
 * cannot determine the attempt, match the point across every attempt of its run.
 */
export function isBenchmarkPointPurged(
  githubRunId: number,
  runAttempt: number | null | undefined,
  point: BenchmarkPointKey,
): boolean {
  return PURGED_BENCHMARK_POINTS.some(
    (candidate) =>
      candidate.githubRunId === githubRunId &&
      (runAttempt === null || runAttempt === undefined || candidate.runAttempt === runAttempt) &&
      candidate.configId === point.configId &&
      candidate.benchmarkType === point.benchmarkType &&
      candidate.isl === point.isl &&
      candidate.osl === point.osl &&
      candidate.conc === point.conc &&
      candidate.offloadMode === point.offloadMode &&
      (candidate.recipeFingerprint ?? null) === (point.recipeFingerprint ?? null),
  );
}

/**
 * True when the (run, attempt) pair should be skipped on ingest. Pass `runAttempt`
 * to honor PURGED_RUN_ATTEMPTS; omit it to check whole-run purges only.
 */
export function isRunAttemptPurged(githubRunId: number, runAttempt?: number): boolean {
  if (PURGED_RUNS.has(githubRunId)) return true;
  if (runAttempt === undefined) return false;
  return PURGED_RUN_ATTEMPTS.get(githubRunId)?.has(runAttempt) ?? false;
}
