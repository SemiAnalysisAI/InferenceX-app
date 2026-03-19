/**
 * Per-run overrides and special cases for the ingest pipeline.
 *
 * Both are applied at ingest time. Run `pnpm db:apply-overrides` to patch existing DB rows.
 *
 * CONCLUSION_OVERRIDES — force the conclusion for a run (e.g. 'success' when
 *   the benchmark ran fine but CI failed on a non-benchmark step).
 *
 * PURGED_RUNS — runs to skip on ingest and delete from the DB,
 *   e.g. typically due to experimental runs or features which generate lots of broken data.
 *
 * Note: GitHub deletes old workflow runs over time, so links to older runs
 * may return 404.
 */

export const CONCLUSION_OVERRIDES: ReadonlyMap<number, string> = new Map([
  [22806827144, 'success'], // 2026-03-07 — dsr1 fp8 h200 SGLang 0.5.7→0.5.9 bump, upload step failed — https://github.com/SemiAnalysisAI/InferenceX/actions/runs/22806827144
  [22792161490, 'success'], // 2026-03-07 — GLM-5 fp8 mi355x SGLang benchmark add, upload step failed — https://github.com/SemiAnalysisAI/InferenceX/actions/runs/22792161490
]);

export const PURGED_RUNS: ReadonlySet<number> = new Set([
  20286769842, // very long ago — broken run — https://github.com/SemiAnalysisAI/InferenceX/actions/runs/20286769842
  20789830797, // very long ago — broken run — https://github.com/SemiAnalysisAI/InferenceX/actions/runs/20789830797
  21427451958, // 2026-01-28 — for initial gsm8k evals baseline data collection, performance data ignored for this run — https://github.com/SemiAnalysisAI/InferenceX/actions/runs/21427451958
]);
