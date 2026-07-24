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
  p90_itl: 1 / intvty,
  p99_itl: 1 / (intvty * 0.8),
  median_e2el: e2el * 0.8,
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
export const b300Rows = (runUrl: string | null) =>
  REAL_CONFIGS.map(([conc, intvty, tput, e2el]) => ({
    id: runUrl ? 0 : idCursor++,
    hardware: 'b300',
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
export const interceptOverlayRun = () => {
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
      benchmarks: b300Rows(OVERLAY_RUN_URL),
      evaluations: [],
    },
  }).as('unofficialRun');
};

export const countVisible = ($els: JQuery<HTMLElement>): number =>
  [...$els].filter((el) => getComputedStyle(el).opacity !== '0').length;
