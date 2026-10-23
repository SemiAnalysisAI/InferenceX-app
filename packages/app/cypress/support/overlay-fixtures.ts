export const DEFAULT_MODEL_DB_KEY = 'dsv4';
export const AGENTIC_DATE = '2026-07-19';
export const OVERLAY_RUN_ID = '29682242847';
export const OVERLAY_RUN_BRANCH = 'add-glm5.2-b300-agentic-hicache';
export const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

export const REAL_CONFIGS: [number, number, number, number][] = [
  [48, 10.6, 17199, 126.9],
  [8, 68.5, 12874, 33.1],
  [4, 88.3, 9415, 48],
  [2, 111.1, 5018, 30],
  [1, 130.2, 2600, 25.8],
];

export const metricsFor = (intvty: number, tput: number, e2el: number): Record<string, number> => ({
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
  server_gpu_cache_hit_rate: 0.8,
  server_external_cache_hit_rate: 0.1,
  server_cpu_cache_hit_rate: 0.05,
});

export const DOMINATED_CONFIG: [number, number, number, number] = [6, 60, 5000, 40];

let idCursor = 900000;
export const b300Rows = (
  runUrl: string | null,
  hardware = 'b300',
  configs: [number, number, number, number][] = REAL_CONFIGS,
) =>
  configs.map(([conc, intvty, tput, e2el]) => ({
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

export const interceptOverlayRun = ({
  overlayHardware = 'b300',
  overlayConfigs = REAL_CONFIGS,
}: {
  overlayHardware?: string;
  overlayConfigs?: [number, number, number, number][];
} = {}) => {
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
      benchmarks: b300Rows(OVERLAY_RUN_URL, overlayHardware, overlayConfigs),
      evaluations: [],
    },
  }).as('unofficialRun');
};

export const countVisible = ($els: JQuery<HTMLElement>): number =>
  [...$els].filter((el) => getComputedStyle(el).opacity !== '0').length;

export const SINGLE_TURN_DATE = '2026-07-19';
export const SINGLE_TURN_ISL = 1024;
export const SINGLE_TURN_OSL = 1024;
export const ALT_SEQUENCE_ISL = 8192;
export const ALT_SEQUENCE_OSL = 1024;
export const ALT_SEQUENCE_LABEL = '8K / 1K';
export const ALT_SEQUENCE_HARDWARE = 'h100';
export const OTHER_MODEL_DB_KEY = 'glm5';
export const OVERLAY_ONLY_HARDWARE = 'mi355x';
export const SECOND_OFFICIAL_HARDWARE = 'b200';
export const OVERLAY_ONLY_ISL = 1024;
export const OVERLAY_ONLY_OSL = 8192;
export const OVERLAY_ONLY_SEQUENCE_LABEL = '1K / 8K';

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

export const interceptCalculatorOverlayRun = ({ runDelayMs }: { runDelayMs?: number } = {}) => {
  cy.intercept('GET', '/api/v1/availability', { body: singleTurnAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', {
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
