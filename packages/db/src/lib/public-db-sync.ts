/**
 * Pure planning helpers for `sync-public-db.ts`, which copies benchmark runs
 * from the public InferenceX database into a downstream deployment's database.
 * Rows are matched on natural keys because serial ids differ between the two
 * databases.
 */

/** Columns of the `configs_natural_key` unique constraint, in constraint order. */
export const CONFIG_NATURAL_KEY = [
  'hardware',
  'framework',
  'model',
  'precision',
  'spec_method',
  'disagg',
  'is_multinode',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
] as const;

/**
 * Stable string key for a tuple of column values. `null` and `undefined`
 * collapse to the same key, matching the `NULLS NOT DISTINCT` constraints.
 */
export function naturalKey(values: readonly unknown[]): string {
  return JSON.stringify(values.map((value) => value ?? null));
}

export function configKey(row: Record<string, unknown>): string {
  return naturalKey(CONFIG_NATURAL_KEY.map((column) => row[column]));
}

/** Per-run child-row counts used to find runs that are absent or incomplete. */
export interface RunSummary {
  github_run_id: string;
  run_attempt: number;
  benchmark_results: number;
  server_logs: number;
  server_log_files: number;
  trace_replays: number;
  /** Non-null payload columns, not rows, across linked trace replays. */
  trace_payloads: number;
  eval_results: number;
  eval_samples: number;
  run_stats: number;
  changelog_entries: number;
  run_datasets: number;
}

export const RUN_SUMMARY_COUNTS = [
  'benchmark_results',
  'server_logs',
  'server_log_files',
  'trace_replays',
  'trace_payloads',
  'eval_results',
  'eval_samples',
  'run_stats',
  'changelog_entries',
  'run_datasets',
] as const satisfies readonly (keyof RunSummary)[];

export function runKey(run: Pick<RunSummary, 'github_run_id' | 'run_attempt'>): string {
  return `${run.github_run_id}#${run.run_attempt}`;
}

export interface RunSyncPlan {
  summary: RunSummary;
  /** True when the target database has no row for this (github_run_id, run_attempt). */
  missing: boolean;
  /** Child tables where the source has more rows than the target. */
  shortTables: (typeof RUN_SUMMARY_COUNTS)[number][];
}

/**
 * Select source runs the target lacks entirely or holds fewer child rows for.
 * Target-only runs (downstream submissions) never appear in the plan.
 */
export function planRunSync(
  source: readonly RunSummary[],
  target: readonly RunSummary[],
): RunSyncPlan[] {
  const targetByKey = new Map(target.map((run) => [runKey(run), run]));
  const plans: RunSyncPlan[] = [];
  for (const summary of source) {
    const existing = targetByKey.get(runKey(summary));
    if (!existing) {
      plans.push({ summary, missing: true, shortTables: [...RUN_SUMMARY_COUNTS] });
      continue;
    }
    const shortTables = RUN_SUMMARY_COUNTS.filter((table) => summary[table] > existing[table]);
    if (shortTables.length > 0) plans.push({ summary, missing: false, shortTables });
  }
  return plans;
}

/** A `--run-id` entry: a GitHub Actions run id, optionally pinned to one attempt. */
export interface RunSelector {
  githubRunId: string;
  runAttempt: number | null;
}

const RUN_SELECTOR = /^(?<id>\d+)(?:#(?<attempt>[1-9]\d*))?$/u;

/** Parse a comma-separated `<run id>[#<attempt>]` list. Throws on a malformed entry. */
export function parseRunSelectors(value: string): RunSelector[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error('--run-id needs at least one run id');
  return entries.map((entry) => {
    const groups = RUN_SELECTOR.exec(entry)?.groups;
    if (!groups)
      throw new Error(`Invalid --run-id entry "${entry}"; expected <run id>[#<attempt>]`);
    return {
      githubRunId: groups.id!,
      runAttempt: groups.attempt ? Number(groups.attempt) : null,
    };
  });
}

function selects(selector: RunSelector, run: Pick<RunSummary, 'github_run_id' | 'run_attempt'>) {
  return (
    run.github_run_id === selector.githubRunId &&
    (selector.runAttempt === null || run.run_attempt === selector.runAttempt)
  );
}

export interface RunSelection {
  /** Every source run a selector matches, whether or not it needs syncing. */
  runs: RunSummary[];
  plans: RunSyncPlan[];
  /** Selectors that match no source run. */
  unknown: RunSelector[];
  /** Source runs that were selected but the target already holds in full. */
  inSync: string[];
}

/** Restrict a sync plan to the selected runs; every attempt matches when none is given. */
export function selectRuns(
  source: readonly RunSummary[],
  plans: readonly RunSyncPlan[],
  selectors: readonly RunSelector[],
): RunSelection {
  const selected = source.filter((run) => selectors.some((selector) => selects(selector, run)));
  const planned = plans.filter((plan) =>
    selectors.some((selector) => selects(selector, plan.summary)),
  );
  const plannedKeys = new Set(planned.map((plan) => runKey(plan.summary)));
  return {
    runs: selected,
    plans: planned,
    unknown: selectors.filter((selector) => !source.some((run) => selects(selector, run))),
    inSync: selected.map(runKey).filter((key) => !plannedKeys.has(key)),
  };
}

/** Child tables whose surplus in the target means public removed rows after the copy. */
export const DRIFT_COUNTS = [
  'benchmark_results',
  'eval_results',
] as const satisfies readonly (keyof RunSummary)[];

export interface RunDrift {
  key: string;
  /** `table: target>source` for each drifted table. */
  tables: string[];
}

/**
 * Runs present in both databases where the target holds more benchmark or eval
 * rows than the source. The insert-only sync never removes rows, so public
 * purges and corrections surface here for manual reconciliation.
 */
export function findDriftedRuns(
  source: readonly RunSummary[],
  target: readonly RunSummary[],
): RunDrift[] {
  const sourceByKey = new Map(source.map((run) => [runKey(run), run]));
  const drift: RunDrift[] = [];
  for (const run of target) {
    const key = runKey(run);
    const publicRun = sourceByKey.get(key);
    if (!publicRun) continue;
    const tables = DRIFT_COUNTS.filter((table) => run[table] > publicRun[table]).map(
      (table) => `${table}: ${run[table]}>${publicRun[table]}`,
    );
    if (tables.length > 0) drift.push({ key, tables });
  }
  return drift;
}
