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
}

export interface PurgedBenchmarkPoint extends BenchmarkPointKey {
  githubRunId: number;
  runAttempt: number;
}

/**
 * Individual benchmark rows to skip on ingest and delete from the DB.
 * Keep a dated reason comment beside every entry for auditability:
 * `{ githubRunId, runAttempt, configId, benchmarkType, isl, osl, conc, offloadMode }`.
 */
export const PURGED_BENCHMARK_POINTS: readonly PurgedBenchmarkPoint[] = [];

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
      candidate.offloadMode === point.offloadMode,
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
