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

export const profitBenchmarkRows = (dbKey: string = PROFIT_MODEL_DB_KEY, date = PROFIT_DATE) =>
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
        Math.round(tput * sku.tputScale * (date === PROFIT_DATE ? 1 : PROFIT_HISTORY_TPUT_SCALE)),
        e2el,
      ),
      workers: null,
      date,
      run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${idCursor}`,
    })),
  );

export const profitAvailabilityRows = (dbKeys: readonly string[] = PROFIT_DB_KEYS) =>
  dbKeys.flatMap((dbKey) =>
    [PROFIT_HISTORY_DATE, PROFIT_DATE].flatMap((date) =>
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

/**
 * Intercept availability (both models, both dates) and benchmarks (the rows of
 * whichever model the request names, so a model switch never sees another
 * model's bars; the earlier date's rows when the compare-history panel asks
 * for `?date=<PROFIT_HISTORY_DATE>`).
 */
export const interceptProfitData = (): void => {
  cy.intercept('GET', '/api/v1/availability*', { body: profitAvailabilityRows() }).as(
    'profit-availability',
  );
  cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
    const display = String(req.query['model'] ?? '');
    const date =
      String(req.query['date'] ?? '') === PROFIT_HISTORY_DATE ? PROFIT_HISTORY_DATE : PROFIT_DATE;
    req.reply({ body: profitBenchmarkRows(PROFIT_DB_KEY_BY_DISPLAY_MODEL[display], date) });
  }).as('profit-benchmarks');
};
