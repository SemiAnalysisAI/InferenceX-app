/**
 * Synthetic, adversarial dataset shared by both parity paths.
 *
 * The SAME rows are (a) INSERTed into a real PGlite Postgres that has run the actual
 * migrations, and (b) written to an in-memory dump directory in the exact shape
 * `json-provider` expects, so both code paths see identical inputs. Any divergence in
 * output is then a real SQL-vs-JS mirror bug, not a data-setup artifact.
 *
 * Coverage the rows are designed to exercise (see json-provider's query list):
 *  - multiple configs (2 models, disagg + non-disagg, multinode with `workers`)
 *  - multiple runs per day incl. same-date reruns → run_started_at DESC NULLS LAST
 *    and workflow_run_id DESC tiebreaks (the exact drift point migration 007 re-synced)
 *  - a NULL run_started_at run (old history that must never blank out)
 *  - a non-latest run_attempt (must be dropped by latest_workflow_runs)
 *  - error rows (must be excluded everywhere `error IS NULL` is required)
 *  - multiple (isl, osl) sequences, incl. a partial re-sweep that truncates a line
 *  - eval rows (with and without conc / isl / osl) + eval_samples
 *  - changelog entries, availability rows (incl. one that must NOT match any benchmark),
 *    run_stats (incl. one tied to a superseded run_attempt), server_logs
 */

export interface ConfigRow {
  id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
}

export interface WorkflowRunRow {
  id: number;
  github_run_id: number;
  run_attempt: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  head_sha: string | null;
  head_branch: string | null;
  html_url: string | null;
  created_at: string; // ISO timestamptz
  run_started_at: string | null;
  date: string; // YYYY-MM-DD
}

export interface ServerLogRow {
  id: number;
  server_log: string;
}

export interface BenchmarkRow {
  id: number;
  workflow_run_id: number;
  config_id: number;
  benchmark_type: string;
  date: string;
  isl: number;
  osl: number;
  conc: number;
  image: string | null;
  metrics: Record<string, number>;
  workers: unknown[] | null;
  error: string | null;
  server_log_id: number | null;
}

export interface RunStatRow {
  id: number;
  workflow_run_id: number;
  date: string;
  hardware: string;
  n_success: number;
  total: number;
}

export interface EvalResultRow {
  id: number;
  workflow_run_id: number;
  config_id: number;
  task: string;
  date: string;
  isl: number | null;
  osl: number | null;
  conc: number | null;
  lm_eval_version: string | null;
  metrics: Record<string, number>;
}

export interface EvalSampleRow {
  id: number;
  eval_result_id: number;
  doc_id: number;
  prompt: string | null;
  target: string | null;
  response: string | null;
  passed: boolean | null;
  score: number | null;
  metrics: Record<string, number> | null;
  data: unknown;
}

export interface AvailabilityRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  date: string;
}

export interface ChangelogRow {
  id: number;
  workflow_run_id: number;
  date: string;
  base_ref: string;
  head_ref: string;
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

export interface Dataset {
  configs: ConfigRow[];
  workflow_runs: WorkflowRunRow[];
  server_logs: ServerLogRow[];
  benchmark_results: BenchmarkRow[];
  run_stats: RunStatRow[];
  eval_results: EvalResultRow[];
  eval_samples: EvalSampleRow[];
  availability: AvailabilityRow[];
  changelog_entries: ChangelogRow[];
}

// Dates used across the fixtures.
export const D_OLD = '2026-06-10'; // has a NULL run_started_at run
export const D_NEW = '2026-06-14'; // has 3 same-day reruns
export const MODEL_A = 'testm';
export const MODEL_B = 'otherm';

/** Config factory — every field explicit so PGlite CHECK constraints are satisfied. */
function config(partial: Partial<ConfigRow> & Pick<ConfigRow, 'id' | 'model'>): ConfigRow {
  return {
    hardware: 'h100',
    framework: 'vllm',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 1,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 1,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 1,
    num_decode_gpu: 8,
    ...partial,
  };
}

function run(
  id: number,
  github_run_id: number,
  run_attempt: number,
  run_started_at: string | null,
  date: string,
  conclusion: string | null = 'success',
  html_url: string | null = `https://github.com/x/runs/${github_run_id}`,
): WorkflowRunRow {
  return {
    id,
    github_run_id,
    run_attempt,
    name: `run ${github_run_id}`,
    status: 'completed',
    conclusion,
    head_sha: `sha${github_run_id}`,
    head_branch: 'main',
    html_url,
    created_at: run_started_at ?? `${date}T00:00:00Z`,
    run_started_at,
    date,
  };
}

let brId = 5000;
function bench(
  workflow_run_id: number,
  config_id: number,
  date: string,
  conc: number,
  metrics: Record<string, number>,
  extra: Partial<BenchmarkRow> = {},
): BenchmarkRow {
  return {
    id: brId++,
    workflow_run_id,
    config_id,
    benchmark_type: 'latency',
    date,
    isl: 1024,
    osl: 1024,
    conc,
    image: null,
    metrics,
    workers: null,
    error: null,
    server_log_id: null,
    ...extra,
  };
}

/**
 * Build the dataset. Ids are stable so tests can reference specific runs by github id.
 *
 * Run map (workflow_runs.id → github_run_id):
 *   10→100  D_OLD, run_started 04:00        (older full sweep, config 1)
 *   11→101  D_NEW, run_started 05:00        (partial re-sweep of config 1)
 *   20→200  D_NEW, run_started 07:00        (config 2, same ts as 21, LOWER id)
 *   21→201  D_NEW, run_started 07:00        (config 2, same ts as 20, HIGHER id → wins)
 *   30→300  D_OLD, run_started NULL         (old history, config 3 disagg/multinode)
 *   40→400  D_NEW, attempt 0 (superseded)   (config 4)
 *   41→400  D_NEW, attempt 1 (latest)       (config 4 — supersedes attempt 0)
 *   50→500  D_NEW, conclusion NULL          (in-progress; excluded from availability/runs-by-date)
 */
export function buildDataset(): Dataset {
  const configs: ConfigRow[] = [
    config({ id: 1, model: MODEL_A }),
    config({ id: 2, model: MODEL_A, spec_method: 'mtp' }),
    // disagg + multinode config with a per-worker power array (migration 006 `workers`).
    config({
      id: 3,
      model: MODEL_A,
      hardware: 'mi355x',
      framework: 'mori-sglang',
      disagg: true,
      is_multinode: true,
      prefill_tp: 8,
      prefill_ep: 8,
      prefill_num_workers: 2,
      decode_tp: 8,
      decode_ep: 8,
      decode_num_workers: 4,
      num_prefill_gpu: 16,
      num_decode_gpu: 32,
    }),
    config({ id: 4, model: MODEL_B, hardware: 'b200' }),
  ];

  const workflow_runs: WorkflowRunRow[] = [
    run(10, 100, 1, `${D_OLD}T04:00:00Z`, D_OLD),
    run(11, 101, 1, `${D_NEW}T05:00:00Z`, D_NEW),
    run(20, 200, 1, `${D_NEW}T07:00:00Z`, D_NEW),
    run(21, 201, 1, `${D_NEW}T07:00:00Z`, D_NEW),
    run(30, 300, 1, null, D_OLD),
    run(40, 400, 0, `${D_NEW}T02:00:00Z`, D_NEW), // superseded attempt
    run(41, 400, 1, `${D_NEW}T03:00:00Z`, D_NEW), // latest attempt (same github id)
    run(50, 500, 1, `${D_NEW}T08:00:00Z`, D_NEW, null), // in-progress: conclusion NULL
  ];

  const workers = [
    { role: 'prefill', worker_idx: 0, hosts: ['h1'], num_gpus: 8, avg_power_w: 400 },
    { role: 'decode', worker_idx: 0, hosts: ['h2'], num_gpus: 8, avg_power_w: 500 },
  ];

  const benchmark_results: BenchmarkRow[] = [
    // config 1, seq (1024,1024): run A (D_OLD) full sweep, run B (D_NEW) partial re-sweep.
    bench(10, 1, D_OLD, 1, { median_tpot: 0.1, tput_per_gpu: 100 }, { server_log_id: 9001 }),
    bench(10, 1, D_OLD, 8, { median_tpot: 0.18, tput_per_gpu: 180 }),
    bench(10, 1, D_OLD, 64, { median_tpot: 0.5, tput_per_gpu: 640 }),
    bench(11, 1, D_NEW, 1, { median_tpot: 0.09, tput_per_gpu: 110 }),
    bench(11, 1, D_NEW, 8, { median_tpot: 0.16, tput_per_gpu: 190 }),
    // config 1, seq (8192,1024): only run A measured it (run B skipped this sequence).
    bench(10, 1, D_OLD, 1, { median_tpot: 0.2 }, { isl: 8192, osl: 1024 }),
    bench(10, 1, D_OLD, 8, { median_tpot: 0.3 }, { isl: 8192, osl: 1024 }),
    // config 1: an ERROR row on the latest run — must be excluded everywhere.
    bench(11, 1, D_NEW, 128, { median_tpot: 9.9 }, { error: 'OOM' }),
    // config 2, seq (1024,1024): two same-day runs, identical run_started_at → id tiebreak.
    bench(20, 2, D_NEW, 1, { median_tpot: 0.5 }),
    bench(20, 2, D_NEW, 8, { median_tpot: 0.6 }),
    bench(20, 2, D_NEW, 64, { median_tpot: 0.7 }), // extra conc on the LOSING run
    bench(21, 2, D_NEW, 1, { median_tpot: 0.4 }),
    bench(21, 2, D_NEW, 8, { median_tpot: 0.45 }),
    // config 3 (disagg/multinode) on the NULL-run_started_at old-history run, with workers.
    bench(30, 3, D_OLD, 1, { median_tpot: 0.9, tput_per_gpu: 50 }, { workers, image: 'img:1' }),
    bench(30, 3, D_OLD, 8, { median_tpot: 1.1, tput_per_gpu: 60 }, { workers, image: 'img:1' }),
    // config 4 (model B) measured by the LATEST attempt (41). A stale row on the
    // superseded attempt (40) must be dropped by latest_workflow_runs.
    bench(40, 4, D_NEW, 1, { median_tpot: 5.5 }), // superseded attempt → excluded
    bench(41, 4, D_NEW, 1, { median_tpot: 0.05 }),
    bench(41, 4, D_NEW, 8, { median_tpot: 0.07 }),
    // config 1 on the in-progress run (conclusion NULL): present for benchmarks,
    // but its date/availability visibility differs by query (exercises conclusion handling).
    bench(50, 1, D_NEW, 256, { median_tpot: 0.02 }),
  ];

  const run_stats: RunStatRow[] = [
    { id: 1, workflow_run_id: 11, date: D_NEW, hardware: 'h100', n_success: 9, total: 10 },
    { id: 2, workflow_run_id: 21, date: D_NEW, hardware: 'h100', n_success: 8, total: 8 },
    { id: 3, workflow_run_id: 30, date: D_OLD, hardware: 'mi355x', n_success: 4, total: 5 },
    // tied to superseded attempt 40 → its run isn't in latest_workflow_runs → excluded.
    { id: 4, workflow_run_id: 40, date: D_NEW, hardware: 'b200', n_success: 1, total: 3 },
    { id: 5, workflow_run_id: 41, date: D_NEW, hardware: 'b200', n_success: 3, total: 3 },
  ];

  const eval_results: EvalResultRow[] = [
    // eval WITH conc/isl/osl and WITH samples
    {
      id: 700,
      workflow_run_id: 11,
      config_id: 1,
      task: 'gsm8k',
      date: D_NEW,
      isl: 1024,
      osl: 1024,
      conc: 32,
      lm_eval_version: '0.4.5',
      metrics: { em_strict: 0.85, n_eff: 1319 },
    },
    // eval WITHOUT conc/isl/osl (all NULL) and WITHOUT samples
    {
      id: 701,
      workflow_run_id: 30,
      config_id: 3,
      task: 'mmlu',
      date: D_OLD,
      isl: null,
      osl: null,
      conc: null,
      lm_eval_version: null,
      metrics: { em_flexible: 0.72 },
    },
    // eval on model B latest attempt
    {
      id: 702,
      workflow_run_id: 41,
      config_id: 4,
      task: 'gsm8k',
      date: D_NEW,
      isl: null,
      osl: null,
      conc: null,
      lm_eval_version: '0.4.5',
      metrics: { em_strict: 0.9 },
    },
    // eval on a SUPERSEDED attempt (40) → must be dropped (run not in latest view).
    {
      id: 703,
      workflow_run_id: 40,
      config_id: 4,
      task: 'gsm8k',
      date: D_NEW,
      isl: null,
      osl: null,
      conc: null,
      lm_eval_version: '0.4.4',
      metrics: { em_strict: 0.1 },
    },
  ];

  const eval_samples: EvalSampleRow[] = [
    {
      id: 800,
      eval_result_id: 700,
      doc_id: 0,
      prompt: 'Q1',
      target: 'A1',
      response: '4',
      passed: true,
      score: 1,
      metrics: { exact_match: 1 },
      data: { resps: [['raw 4']], arguments: { gen_args_0: { arg_0: ['prompt-0'] } } },
    },
    {
      id: 801,
      eval_result_id: 700,
      doc_id: 1,
      prompt: 'Q2',
      target: 'A2',
      response: '',
      passed: false,
      score: 0,
      metrics: { exact_match: 0 },
      data: { resps: [['!!!!!']], arguments: [['plain prompt']] },
    },
    {
      id: 802,
      eval_result_id: 700,
      doc_id: 2,
      prompt: 'Q3',
      target: 'A3',
      response: '9',
      passed: null, // unfiltered / no verdict
      score: null,
      metrics: null,
      data: { resps: [['raw 9']], arguments: [['p3']] },
    },
  ];

  const availability: AvailabilityRow[] = [
    // matches config 1 run B (D_NEW) — present in getAvailabilityData output
    avail(MODEL_A, 'h100', 'vllm', 'fp8', 1024, 1024, D_NEW),
    // matches config 1 run A (D_OLD)
    avail(MODEL_A, 'h100', 'vllm', 'fp8', 1024, 1024, D_OLD),
    // matches config 3 (disagg) on NULL-run history (D_OLD) — its run HAS a conclusion
    avail(MODEL_A, 'mi355x', 'mori-sglang', 'fp8', 1024, 1024, D_OLD),
    // matches config 4 model B latest attempt
    avail(MODEL_B, 'b200', 'vllm', 'fp8', 1024, 1024, D_NEW),
    // a DANGLING availability row that matches no successful benchmark → must be excluded
    avail(MODEL_A, 'h100', 'vllm', 'fp8', 9999, 9999, D_NEW),
    // matches only the in-progress (conclusion NULL) run's config-1 conc=256 row on
    // a UNIQUE seq → excluded because wr.conclusion IS NULL. Uses isl/osl 256 so it
    // cannot be satisfied by the D_NEW 1024/1024 rows above.
    avail(MODEL_A, 'h100', 'vllm', 'fp8', 256, 256, D_NEW),
  ];

  const changelog_entries: ChangelogRow[] = [
    {
      id: 900,
      workflow_run_id: 11,
      date: D_NEW,
      base_ref: 'main~1',
      head_ref: 'main',
      config_keys: ['testm-fp8-h100-vllm'],
      description: 'bump vllm',
      pr_link: 'https://github.com/x/pull/1',
    },
    {
      id: 901,
      workflow_run_id: 21,
      date: D_NEW,
      base_ref: 'main~2',
      head_ref: 'main',
      config_keys: ['testm-mtp-fp8-h100-vllm'],
      description: 'add mtp',
      pr_link: null,
    },
    // changelog tied to superseded attempt 40 → dropped (run not in latest view).
    {
      id: 902,
      workflow_run_id: 40,
      date: D_NEW,
      base_ref: 'main~3',
      head_ref: 'main',
      config_keys: ['otherm-fp8-b200-vllm'],
      description: 'stale',
      pr_link: null,
    },
  ];

  const server_logs: ServerLogRow[] = [{ id: 9001, server_log: 'server log line 1\nline 2' }];

  return {
    configs,
    workflow_runs,
    server_logs,
    benchmark_results,
    run_stats,
    eval_results,
    eval_samples,
    availability,
    changelog_entries,
  };
}

function avail(
  model: string,
  hardware: string,
  framework: string,
  precision: string,
  isl: number,
  osl: number,
  date: string,
): AvailabilityRow {
  return {
    model,
    isl,
    osl,
    precision,
    hardware,
    framework,
    spec_method: 'none',
    disagg: false,
    date,
  };
}
