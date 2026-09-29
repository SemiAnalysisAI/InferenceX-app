import { assertShareLinkParams } from '../support/share-link';

// The Measured Power "Timeline" display (`y_measuredPowerTimeline`) restores its
// shared view on a `?unofficialrun=` trace. Intercepted rows carry the
// `power_audit.source` / `run_url` provenance that names each point's
// `gpu_metrics_*` artifact; `/api/gpu-metrics?series=power` returns matching
// one-second series.

const MODEL = 'dsv4';
const DATE = '2026-09-01';
const RUN_ID = '34716669498';
const RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`;
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const START_MS = Date.UTC(2026, 8, 1, 20, 0, 0);

/** conc, interactivity (tok/s/user), output tok/s per GPU, measured W per GPU */
const CONFIGS: [number, number, number, number][] = [
  [16, 90, 200, 500],
  [64, 60, 400, 600],
  [256, 30, 800, 700],
];

const resultName = (hardware: string, conc: number) =>
  `dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc${conc}_${hardware}-host-0123456789abcdef0123`;

let rowId = 980000;
const rows = (runUrl: string, hardware: 'b200' | 'h200') =>
  CONFIGS.map(([conc, intvty, outputTput, watts]) => ({
    id: hardware === 'b200' ? rowId++ : 0,
    hardware,
    framework: 'sglang',
    model: MODEL,
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    benchmark_type: 'single_turn',
    image: 'sglang:test',
    metrics: {
      median_intvty: intvty,
      median_itl: 1 / intvty,
      median_e2el: 20,
      median_ttft: 0.5,
      tput_per_gpu: outputTput * 9,
      output_tput_per_gpu: outputTput,
      input_tput_per_gpu: outputTput * 8,
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: watts,
      avg_total_gpu_power_w: watts * 8,
      joules_per_output_token: watts / outputTput,
    },
    workers: null,
    power_audit: {
      source: `power_validation_${resultName(hardware, conc)}.json`,
      sample_count: 160,
      window_start_unix: (START_MS + 40_000) / 1000,
      window_end_unix: (START_MS + 60_000) / 1000,
      observed_gpu_ids: ['0', '1', '2', '3', '4', '5', '6', '7'],
    },
    date: DATE,
    run_url: runUrl,
  }));

const seriesFor = (hardware: string, runUrl: string, runId: string) => ({
  runInfo: {
    id: Number(runId),
    name: 'Run Sweep',
    branch: hardware === 'b200' ? 'main' : 'powerx-timeline',
    sha: 'abc123',
    createdAt: `${DATE}T20:00:00Z`,
    url: runUrl,
    conclusion: 'success',
    status: 'completed',
  },
  series: CONFIGS.map((config) => {
    const [conc] = config;
    const watts = config[3];
    const t = Array.from({ length: 61 }, (_, i) => i);
    return {
      artifact: `gpu_metrics_${resultName(hardware, conc)}`,
      startMs: START_MS,
      bucketSeconds: 1,
      gpus: [0, 1],
      t,
      power: [0, 1].map((gpu) => t.map((second) => (second >= 40 ? watts + gpu : 150 + gpu))),
    };
  }),
});

const availability = [
  {
    model: MODEL,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: DATE,
  },
];

function interceptRows() {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: rows(RUN_URL, 'b200') }).as('benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
  cy.intercept('POST', `/api/gpu-metrics?runId=${RUN_ID}*`, {
    body: seriesFor('b200', RUN_URL, RUN_ID),
  }).as('series');
}

function interceptOverlay() {
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: 'powerx-timeline',
          branch: 'powerx-timeline',
          sha: 'abc000',
          createdAt: `${DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: rows(OVERLAY_RUN_URL, 'h200'),
      evaluations: [],
    },
  }).as('unofficialRun');
  cy.intercept('POST', `/api/gpu-metrics?runId=${OVERLAY_RUN_ID}*`, {
    body: seriesFor('h200', OVERLAY_RUN_URL, OVERLAY_RUN_ID),
  }).as('overlaySeries');
}

function visitChart(extraParams: string) {
  interceptRows();
  cy.visit(`/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${extraParams}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      win.localStorage.setItem('inferencex-feature-gate', '1');
    },
  });
  cy.wait(['@availability', '@benchmarks']);
  cy.get('[data-testid="inference-chart-display"]').should('exist');
}

describe('PowerX measured power timeline', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message === 'ResizeObserver loop completed with undelivered notifications.') {
        return false;
      }
    });
  });

  it('restores the shared serving-window view and focus on an unofficial trace', () => {
    interceptOverlay();
    const focus = `${OVERLAY_RUN_ID}:${resultName('h200', 64)}`;
    visitChart(
      `&i_metric=y_measuredPowerTimeline&unofficialrun=${OVERLAY_RUN_ID}&i_ptaxis=serving&i_ptlines=gpu&i_ptwindow=window&i_ptfocus=${encodeURIComponent(focus)}`,
    );
    cy.wait(['@series', '@unofficialRun', '@overlaySeries']);
    cy.get('[data-testid="power-timeline-focus"]').should('contain.text', 'c64');
    cy.get('[data-testid="power-timeline-per-gpu"]').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="power-timeline-window-only"]').should(
      'have.attr',
      'data-state',
      'checked',
    );
    cy.get('path.power-trace[data-segment="full"]').should('not.exist');
    cy.get('path.power-trace[data-run-index="0"][data-segment="window"]').should('exist');
    assertShareLinkParams({
      i_metric: 'y_measuredPowerTimeline',
      i_ptaxis: 'serving',
      i_ptlines: 'gpu',
      i_ptwindow: 'window',
      i_ptfocus: focus,
    });
    cy.get('[data-testid="power-timeline-focus-clear"]').click();
    assertShareLinkParams({ i_ptfocus: null, i_ptlines: 'gpu', i_ptwindow: 'window' });
  });
});
