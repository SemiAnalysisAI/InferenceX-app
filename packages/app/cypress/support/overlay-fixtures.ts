/**
 * Shared fixtures for `?unofficialrun=` overlay e2e specs.
 *
 * The benchmark values are the real numbers from GitHub run 29682242847
 * (GLM5.2 B300 agentic hicache, offload=on rows):
 *   conc, p90_intvty (tok/s/user), tput_per_gpu, p90_e2el (s)
 * C=4 is dominated on e2e by C=8 (12874 tok/s @ 33.1s vs 9415 @ 48.0s), which
 * makes the set a ready-made probe for the e2e-restricted frontier behaviors.
 */
export const DEFAULT_MODEL_DB_KEY = 'dsv4';
export const AGENTIC_DATE = '2026-07-19';
export const OVERLAY_RUN_ID = '29682242847';
export const OVERLAY_RUN_BRANCH = 'add-glm5.2-b300-agentic-hicache';
export const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

export const REAL_CONFIGS: [number, number, number, number][] = [
  [48, 10.6, 17199, 126.9],
  [8, 68.5, 12874, 33.1],
  [4, 88.3, 9415, 48], // e2e-dominated by C=8 → NOT optimal
  [2, 111.1, 5018, 30],
  [1, 130.2, 2600, 25.8],
];

export const metricsFor = (intvty: number, tput: number, e2el: number): Record<string, number> => ({
  // intvty is ALWAYS derived as 1/itl by the agentic aliases — feed itl.
  median_itl: 1 / (intvty * 1.2),
  p75_itl: 1 / (intvty * 1.1),
  p90_itl: 1 / intvty,
  p99_itl: 1 / (intvty * 0.8),
  median_e2el: e2el * 0.8,
  p75_e2el: e2el * 0.9,
  p90_e2el: e2el,
  p99_e2el: e2el * 1.3,
  median_ttft: 0.5,
  p90_ttft: 1,
  p99_ttft: 2,
  tput_per_gpu: tput,
  output_tput_per_gpu: tput * 0.3,
  input_tput_per_gpu: tput * 0.7,
});

let idCursor = 900000;
export const b300Rows = (runUrl: string | null, hardware = 'b300') =>
  REAL_CONFIGS.map(([conc, intvty, tput, e2el]) => ({
    id: runUrl ? 0 : idCursor++,
    hardware,
    framework: 'sglang',
    model: DEFAULT_MODEL_DB_KEY,
    precision: 'fp4',
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
    image: 'sglang:test',
    metrics: metricsFor(intvty, tput, e2el),
    workers: null,
    date: AGENTIC_DATE,
    run_url: runUrl,
  }));

export const availability = [
  {
    model: DEFAULT_MODEL_DB_KEY,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: 'b300',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  },
];

/** Intercept availability + benchmarks + unofficial-run with the B300 fixture. */
export const interceptOverlayRun = ({ overlayHardware = 'b300' } = {}) => {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: b300Rows(null) }).as('benchmarks');
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: OVERLAY_RUN_BRANCH,
          branch: OVERLAY_RUN_BRANCH,
          sha: 'abc000',
          createdAt: `${AGENTIC_DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: b300Rows(OVERLAY_RUN_URL, overlayHardware),
      evaluations: [],
    },
  }).as('unofficialRun');
};

export const countVisible = ($els: JQuery<HTMLElement>): number =>
  [...$els].filter((el) => getComputedStyle(el).opacity !== '0').length;

// ---------------------------------------------------------------------------
// Single-turn (fixed-sequence) overlay fixtures — for fixed-sequence calculator specs
// ---------------------------------------------------------------------------
//
// The calculator supports the agentic rows above as well. These fixtures remain
// useful for fixed-sequence coverage and for hardware/sequence combinations
// tailored to the calculator overlay visibility tests.

export const SINGLE_TURN_DATE = '2026-07-19';
export const SINGLE_TURN_ISL = 1024;
export const SINGLE_TURN_OSL = 1024;
/** A second sequence, covering different hardware — switching to it and back
 *  changes the calculator's available-hardware set, which reseeds the legend. */
export const ALT_SEQUENCE_ISL = 8192;
export const ALT_SEQUENCE_OSL = 1024;
export const ALT_SEQUENCE_LABEL = '8K / 1K';
export const ALT_SEQUENCE_HARDWARE = 'h100';
/** A model the calculator is NOT showing — used to prove overlay model filtering. */
export const OTHER_MODEL_DB_KEY = 'glm5';
/** Hardware present only in the unofficial run, never in the official rows. */
export const OVERLAY_ONLY_HARDWARE = 'mi355x';
/** A second official GPU, so a hardware filter set before the run lands is observable. */
export const SECOND_OFFICIAL_HARDWARE = 'b200';
/**
 * A sequence the unofficial run covers but the DB does not — the "this
 * model/sequence exists only in the run" case the overlay feature exists for.
 * Selecting it leaves the calculator with zero official hardware.
 */
export const OVERLAY_ONLY_ISL = 1024;
export const OVERLAY_ONLY_OSL = 8192;
export const OVERLAY_ONLY_SEQUENCE_LABEL = '1K / 8K';

/** conc, interactivity (tok/s/user), tput_per_gpu */
export const SINGLE_TURN_CONFIGS: [number, number, number][] = [
  [48, 10.6, 17199],
  [8, 68.5, 12874],
  [2, 111.1, 5018],
  [1, 130.2, 2600],
];

export const singleTurnMetrics = (intvty: number, tput: number): Record<string, number> => ({
  median_intvty: intvty,
  median_itl: 1 / intvty,
  median_e2el: 30,
  median_ttft: 0.5,
  tput_per_gpu: tput,
  output_tput_per_gpu: tput * 0.3,
  input_tput_per_gpu: tput * 0.7,
});

let singleTurnIdCursor = 800000;

/**
 * Fixed-sequence (1k/1k) rows for one hardware config.
 *
 * `tputScale` lets an overlay run report a different throughput than the
 * official rows, so the two bars are distinguishable in assertions.
 */
export const singleTurnRows = (
  runUrl: string | null,
  {
    hardware = 'b300',
    model = DEFAULT_MODEL_DB_KEY,
    tputScale = 1,
    isl = SINGLE_TURN_ISL,
    osl = SINGLE_TURN_OSL,
  }: {
    hardware?: string;
    model?: string;
    tputScale?: number;
    isl?: number;
    osl?: number;
  } = {},
) =>
  SINGLE_TURN_CONFIGS.map(([conc, intvty, tput]) => ({
    id: runUrl ? 0 : singleTurnIdCursor++,
    hardware,
    framework: 'sglang',
    model,
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl,
    osl,
    conc,
    offload_mode: 'off',
    benchmark_type: 'single_turn',
    image: 'sglang:test',
    metrics: singleTurnMetrics(intvty, tput * tputScale),
    workers: null,
    date: SINGLE_TURN_DATE,
    run_url: runUrl,
  }));

export const singleTurnAvailability = [
  {
    model: DEFAULT_MODEL_DB_KEY,
    isl: SINGLE_TURN_ISL,
    osl: SINGLE_TURN_OSL,
    precision: 'fp4',
    hardware: 'b300',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: SINGLE_TURN_DATE,
  },
  {
    model: DEFAULT_MODEL_DB_KEY,
    isl: SINGLE_TURN_ISL,
    osl: SINGLE_TURN_OSL,
    precision: 'fp4',
    hardware: SECOND_OFFICIAL_HARDWARE,
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: SINGLE_TURN_DATE,
  },
  {
    model: DEFAULT_MODEL_DB_KEY,
    isl: ALT_SEQUENCE_ISL,
    osl: ALT_SEQUENCE_OSL,
    precision: 'fp4',
    hardware: ALT_SEQUENCE_HARDWARE,
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: SINGLE_TURN_DATE,
  },
];

/**
 * Intercept availability + benchmarks + unofficial-run with fixed-sequence
 * rows the calculator can actually read.
 *
 * The overlay payload deliberately carries two extra kinds of rows:
 * - `OTHER_MODEL_DB_KEY` rows, which must be filtered out — the unofficial-run
 *   API returns every model in the run, the calculator shows only the selected one.
 * - `OVERLAY_ONLY_HARDWARE` rows, hardware with no official data at all, which
 *   must still get a legend entry so its overlay bar can be hidden.
 */
export const interceptCalculatorOverlayRun = ({ runDelayMs }: { runDelayMs?: number } = {}) => {
  cy.intercept('GET', '/api/v1/availability', { body: singleTurnAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', {
    // The route is intercepted regardless of query params; the hook filters by
    // isl/osl client-side, so both sequences ship in one payload.
    body: [
      ...singleTurnRows(null),
      ...singleTurnRows(null, { hardware: SECOND_OFFICIAL_HARDWARE, tputScale: 0.6 }),
      ...singleTurnRows(null, {
        hardware: ALT_SEQUENCE_HARDWARE,
        isl: ALT_SEQUENCE_ISL,
        osl: ALT_SEQUENCE_OSL,
      }),
    ],
  }).as('benchmarks');
  cy.intercept('GET', '/api/unofficial-run*', {
    // A delay lets a spec set a GPU filter in the window after the official
    // benchmarks land but before the run does — the real-world ordering.
    delay: runDelayMs,
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: OVERLAY_RUN_BRANCH,
          branch: OVERLAY_RUN_BRANCH,
          sha: 'abc000',
          createdAt: `${SINGLE_TURN_DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: [
        ...singleTurnRows(OVERLAY_RUN_URL, { tputScale: 1.3 }),
        ...singleTurnRows(OVERLAY_RUN_URL, { hardware: OVERLAY_ONLY_HARDWARE, tputScale: 0.8 }),
        ...singleTurnRows(OVERLAY_RUN_URL, { model: OTHER_MODEL_DB_KEY, tputScale: 5 }),
        // 1k/8k: covered by the run only, so selecting it leaves zero official
        // hardware. Same two GPUs as 1k/1k, which keeps `overlayAvailableHwKeys`
        // unchanged across the switch — the adversarial case, since only the
        // official-list reset can clear the now-stale official keys.
        ...singleTurnRows(OVERLAY_RUN_URL, {
          tputScale: 1.1,
          isl: OVERLAY_ONLY_ISL,
          osl: OVERLAY_ONLY_OSL,
        }),
        ...singleTurnRows(OVERLAY_RUN_URL, {
          hardware: OVERLAY_ONLY_HARDWARE,
          tputScale: 0.9,
          isl: OVERLAY_ONLY_ISL,
          osl: OVERLAY_ONLY_OSL,
        }),
      ],
      evaluations: [],
    },
  }).as('unofficialRun');
};

/** Second run id, for multi-run (`?unofficialruns=a,b`) specs. */
export const SECOND_OVERLAY_RUN_ID = '29682242848';
export const SECOND_OVERLAY_RUN_BRANCH = 'perf/second-branch';
export const SECOND_OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${SECOND_OVERLAY_RUN_ID}`;

const runInfoFor = (id: string, branch: string, url: string) => ({
  id,
  name: branch,
  branch,
  sha: 'abc000',
  createdAt: `${SINGLE_TURN_DATE}T00:00:00Z`,
  url,
  conclusion: 'success',
  status: 'completed',
  isNonMainBranch: true,
});

/**
 * Two runs, each contributing ONE hardware config on the 1k/8k sequence — a
 * sequence the DB does not cover, so the calculator has zero official hardware
 * there.
 *
 * That combination is what exercises the "don't strand an empty chart" fallback
 * in the additive overlay effect: soloing the GPU from run A and then dismissing
 * run A empties the visible set while run B's bar still has data, and the
 * official hardware list (empty here) is not something the fallback can use.
 */
export const interceptCalculatorMultiRunOverlay = () => {
  cy.intercept('GET', '/api/v1/availability', { body: singleTurnAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: singleTurnRows(null) }).as('benchmarks');
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        runInfoFor(OVERLAY_RUN_ID, OVERLAY_RUN_BRANCH, OVERLAY_RUN_URL),
        runInfoFor(SECOND_OVERLAY_RUN_ID, SECOND_OVERLAY_RUN_BRANCH, SECOND_OVERLAY_RUN_URL),
      ],
      benchmarks: [
        ...singleTurnRows(OVERLAY_RUN_URL, {
          isl: OVERLAY_ONLY_ISL,
          osl: OVERLAY_ONLY_OSL,
        }),
        ...singleTurnRows(SECOND_OVERLAY_RUN_URL, {
          hardware: OVERLAY_ONLY_HARDWARE,
          isl: OVERLAY_ONLY_ISL,
          osl: OVERLAY_ONLY_OSL,
          tputScale: 0.7,
        }),
      ],
      evaluations: [],
    },
  }).as('unofficialRun');
};
