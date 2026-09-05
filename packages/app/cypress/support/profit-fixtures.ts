/**
 * Synthetic agentic rows for the `/profit-estimator` e2e spec, one identical
 * SKU set per model the estimator serves (Kimi K3, GLM 5.2/5.3, MiniMax M3).
 *
 * The captured API fixtures carry no `agentic_traces` rows, and the estimator
 * is pinned to that workload, so the spec intercepts availability and
 * benchmarks with this set instead. Shapes follow `overlay-fixtures.ts`; the
 * metric aliases derive interactivity from `p90_itl`, so the tuples below are
 * (concurrency, p90 interactivity tok/s/user, tput_per_gpu, p90 e2e latency s).
 *
 * The H200 curve tops out below the 45 tok/s/user default on purpose: the page
 * must list it under "Not priced" rather than extrapolate a bar for it. The
 * wide curve reaches 130 tok/s/user so GLM's 100 and MiniMax M3's 83 tok/s/user
 * defaults are reads, not clamps, on every other SKU.
 */
import { metricsFor } from './overlay-fixtures';

export const PROFIT_MODEL_DB_KEY = 'kimik3';
export const PROFIT_GLM_DB_KEY = 'glm5.2';
export const PROFIT_MINIMAX_DB_KEY = 'minimaxm3';
/** `?model=` display key the benchmarks request carries → DB key of its rows. */
const PROFIT_DB_KEY_BY_DISPLAY_MODEL: Record<string, string> = {
  'Kimi-K3': PROFIT_MODEL_DB_KEY,
  'GLM-5.2': PROFIT_GLM_DB_KEY,
  'MiniMax-M3': PROFIT_MINIMAX_DB_KEY,
};
const PROFIT_DB_KEYS = Object.values(PROFIT_DB_KEY_BY_DISPLAY_MODEL);
export const PROFIT_DATE = '2026-08-31';
/**
 * Earlier run date served for the compare-history panel. Its rows carry 80% of
 * the current throughput, so a history bar always lands below today's for the
 * same chip and the spec can tell the two apart.
 */
export const PROFIT_HISTORY_DATE = '2026-07-15';
const PROFIT_HISTORY_TPUT_SCALE = 0.8;
/**
 * A date between the two above on which the sweep ran twice, so the Config
 * Changelog offers each run as its own comparison entry (`date~r<runId>`) the
 * way `/inference` does. Run #1 carries 85% and run #2 92% of today's
 * throughput; `?date=` (the day's latest) resolves to run #2.
 */
export const PROFIT_RUN_DATE = '2026-08-10';
export const PROFIT_RUNS = [
  { runId: 27_480_000_001, startedAt: `${PROFIT_RUN_DATE}T02:00:00Z`, tputScale: 0.85 },
  { runId: 27_480_000_002, startedAt: `${PROFIT_RUN_DATE}T09:00:00Z`, tputScale: 0.92 },
] as const;
/** Single run behind each of the other two dates, for the changelog's Git/Workflow links. */
const PROFIT_SINGLE_RUN_ID: Record<string, number> = {
  [PROFIT_HISTORY_DATE]: 27_470_000_001,
  [PROFIT_DATE]: 27_490_000_001,
};
const PROFIT_DATES = [PROFIT_HISTORY_DATE, PROFIT_RUN_DATE, PROFIT_DATE];

const tputScaleFor = (date: string, runId?: number): number => {
  if (date === PROFIT_DATE) return 1;
  if (date === PROFIT_RUN_DATE) {
    const run = PROFIT_RUNS.find((r) => r.runId === runId) ?? PROFIT_RUNS.at(-1)!;
    return run.tputScale;
  }
  return PROFIT_HISTORY_TPUT_SCALE;
};

type Curve = [conc: number, intvty: number, tput: number, e2el: number][];

const WIDE_CURVE: Curve = [
  [64, 12, 18_000, 140],
  [16, 40, 13_500, 60],
  [8, 62, 9_800, 38],
  [4, 90, 6_000, 30],
  [1, 130, 2_400, 24],
];

const H200_CURVE: Curve = [
  [64, 8, 6_000, 180],
  [16, 22, 4_200, 80],
  [4, 38, 2_100, 44],
];

interface ProfitSku {
  hardware: string;
  framework: string;
  precision: string;
  curve: Curve;
  tputScale: number;
}

export const PROFIT_SKUS: ProfitSku[] = [
  { hardware: 'h200', framework: 'vllm', precision: 'fp8', curve: H200_CURVE, tputScale: 1 },
  { hardware: 'b200', framework: 'sglang', precision: 'fp4', curve: WIDE_CURVE, tputScale: 1 },
  { hardware: 'b300', framework: 'vllm', precision: 'fp4', curve: WIDE_CURVE, tputScale: 1.25 },
  { hardware: 'gb300', framework: 'sglang', precision: 'fp4', curve: WIDE_CURVE, tputScale: 1.4 },
  { hardware: 'mi355x', framework: 'vllm', precision: 'fp4', curve: WIDE_CURVE, tputScale: 0.9 },
];

let idCursor = 800_000;

export const profitBenchmarkRows = (
  dbKey: string = PROFIT_MODEL_DB_KEY,
  date = PROFIT_DATE,
  runId?: number,
) =>
  PROFIT_SKUS.flatMap((sku) =>
    sku.curve.map(([conc, intvty, tput, e2el]) => ({
      id: idCursor++,
      hardware: sku.hardware,
      framework: sku.framework,
      model: dbKey,
      precision: sku.precision,
      spec_method: 'none',
      disagg: false,
      is_multinode: false,
      prefill_tp: 8,
      decode_tp: 8,
      num_prefill_gpu: 8,
      num_decode_gpu: 8,
      isl: null,
      osl: null,
      conc,
      offload_mode: 'on',
      benchmark_type: 'agentic_traces',
      image: `${sku.framework}:test`,
      metrics: metricsFor(
        intvty,
        Math.round(tput * sku.tputScale * tputScaleFor(date, runId)),
        e2el,
      ),
      workers: null,
      date,
      workflow_run_id: runId ?? PROFIT_SINGLE_RUN_ID[date],
      run_started_at: PROFIT_RUNS.find((r) => r.runId === runId)?.startedAt ?? `${date}T02:00:00Z`,
      run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId ?? PROFIT_SINGLE_RUN_ID[date] ?? idCursor}`,
    })),
  );

export const profitAvailabilityRows = (dbKeys: readonly string[] = PROFIT_DB_KEYS) =>
  dbKeys.flatMap((dbKey) =>
    PROFIT_DATES.flatMap((date) =>
      PROFIT_SKUS.map((sku) => ({
        model: dbKey,
        isl: null,
        osl: null,
        precision: sku.precision,
        hardware: sku.hardware,
        framework: sku.framework,
        spec_method: 'none',
        disagg: false,
        benchmark_type: 'agentic_traces',
        date,
      })),
    ),
  );

/** Changelog config key for a SKU, in the `<model>-<precision>-<gpu>-<framework>-agentic` form the API emits. */
const configKeyFor = (dbKey: string, sku: ProfitSku) =>
  `${dbKey}-${sku.precision}-${sku.hardware}-${sku.framework}-agentic`;

const runConfigsFor = (runId: number, startedAt: string, sha: string) =>
  PROFIT_DB_KEYS.flatMap((dbKey) =>
    PROFIT_SKUS.map((sku) => ({
      github_run_id: runId,
      run_started_at: startedAt,
      html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`,
      head_sha: sha,
      model: dbKey,
      precision: sku.precision,
      hardware: sku.hardware,
      framework: sku.framework,
      spec_method: 'none',
      disagg: false,
    })),
  );

const changelogRow = (runId: number, date: string, sha: string, description: string) => ({
  workflow_run_id: runId,
  date,
  base_ref: `base${sha}`,
  head_ref: sha,
  config_keys: PROFIT_DB_KEYS.flatMap((dbKey) =>
    PROFIT_SKUS.map((sku) => configKeyFor(dbKey, sku)),
  ),
  description,
  pr_link: `https://github.com/SemiAnalysisAI/InferenceX/pull/${runId % 10_000}`,
});

/** Changelog text the spec asserts on for each run. */
export const PROFIT_CHANGELOG_NOTES = {
  [PROFIT_HISTORY_DATE]: 'Initial agentic-traces submission for every SKU',
  run1: 'Run 1: bump serving image and retune concurrency sweep',
  run2: 'Run 2: enable prefix caching on the agentic trace',
  [PROFIT_DATE]: 'Upgrade to the latest serving release',
} as const;

/**
 * `/api/v1/workflow-info?date=` payload per fixture date: one run with a
 * changelog on the first and last dates, two runs (each with its own
 * changelog) on `PROFIT_RUN_DATE`, nothing anywhere else.
 */
export const profitWorkflowInfo = (date: string) => {
  const runRow = (runId: number, createdAt: string) => ({
    github_run_id: runId,
    name: `Run Sweep - ${date}`,
    conclusion: 'success',
    run_attempt: 1,
    html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`,
    created_at: createdAt,
    date,
  });
  if (date === PROFIT_RUN_DATE) {
    const [r1, r2] = PROFIT_RUNS;
    return {
      runs: [runRow(r1.runId, r1.startedAt), runRow(r2.runId, r2.startedAt)],
      changelogs: [
        changelogRow(r1.runId, date, 'aaa1111', PROFIT_CHANGELOG_NOTES.run1),
        changelogRow(r2.runId, date, 'bbb2222', PROFIT_CHANGELOG_NOTES.run2),
      ],
      configs: [],
      runConfigs: [
        ...runConfigsFor(r1.runId, r1.startedAt, 'aaa1111'),
        ...runConfigsFor(r2.runId, r2.startedAt, 'bbb2222'),
      ],
    };
  }
  const runId = PROFIT_SINGLE_RUN_ID[date];
  if (!runId) return { runs: [], changelogs: [], configs: [], runConfigs: [] };
  const startedAt = `${date}T02:00:00Z`;
  const sha = date === PROFIT_DATE ? 'ccc3333' : '0000aaa';
  const note =
    date === PROFIT_DATE
      ? PROFIT_CHANGELOG_NOTES[PROFIT_DATE]
      : PROFIT_CHANGELOG_NOTES[PROFIT_HISTORY_DATE];
  return {
    runs: [runRow(runId, startedAt)],
    changelogs: [changelogRow(runId, date, sha, note)],
    configs: [],
    runConfigs: runConfigsFor(runId, startedAt, sha),
  };
};

/**
 * Intercept availability (every model, all three dates), benchmarks (the rows
 * of whichever model the request names, so a model switch never sees another
 * model's bars; an earlier date's rows for `?date=`, one specific run's rows
 * for `?runId=&exactRun=true`), and the workflow-info feed behind the Config
 * Changelog.
 */
export const interceptProfitData = (): void => {
  cy.intercept('GET', '/api/v1/availability*', { body: profitAvailabilityRows() }).as(
    'profit-availability',
  );
  cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
    const display = String(req.query['model'] ?? '');
    const dbKey = PROFIT_DB_KEY_BY_DISPLAY_MODEL[display];
    const runId = Number(req.query['runId'] ?? 0);
    const run = PROFIT_RUNS.find((r) => r.runId === runId);
    if (run && String(req.query['exactRun']) === 'true') {
      req.reply({ body: profitBenchmarkRows(dbKey, PROFIT_RUN_DATE, run.runId) });
      return;
    }
    const requested = String(req.query['date'] ?? '');
    const date = PROFIT_DATES.includes(requested) ? requested : PROFIT_DATE;
    req.reply({ body: profitBenchmarkRows(dbKey, date) });
  }).as('profit-benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', (req) => {
    req.reply({ body: profitWorkflowInfo(String(req.query['date'] ?? '')) });
  }).as('profit-workflow-info');
};
