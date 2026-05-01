/**
 * Per-run overrides and special cases for the ingest pipeline.
 *
 * All are applied at ingest time. Run `pnpm db:apply-overrides` to patch existing DB rows.
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
]);

export const PURGED_RUN_ATTEMPTS: ReadonlyMap<number, ReadonlySet<number>> = new Map([
  [25199291771, new Set([1])], // 2026-05-01 | dsv4 GB200 dynamo-vllm MTP2 | Reason: only 2 of 6 conc=1 points uploaded. re-run pending
]);

/**
 * True when the (run, attempt) pair should be skipped on ingest. Pass `runAttempt`
 * to honor PURGED_RUN_ATTEMPTS; omit it to check whole-run purges only.
 */
export function isRunAttemptPurged(githubRunId: number, runAttempt?: number): boolean {
  if (PURGED_RUNS.has(githubRunId)) return true;
  if (runAttempt === undefined) return false;
  return PURGED_RUN_ATTEMPTS.get(githubRunId)?.has(runAttempt) ?? false;
}
