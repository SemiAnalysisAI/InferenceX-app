import { assertShareLinkMetric } from '../support/share-link';

// The Measured Power "Timeline" display (`y_measuredPowerTimeline`) inside the
// gated Measured Energy group. Deterministic intercepted rows carry validated
// telemetry plus the `power_audit.source` / `run_url` provenance that names each
// point's `gpu_metrics_*` artifact; `/api/gpu-metrics?series=power` is
// intercepted with matching one-second series.

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
  cy.intercept('GET', `/api/gpu-metrics?runId=${RUN_ID}*`, {
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
  cy.intercept('GET', `/api/gpu-metrics?runId=${OVERLAY_RUN_ID}*`, {
    body: seriesFor('h200', OVERLAY_RUN_URL, OVERLAY_RUN_ID),
  }).as('overlaySeries');
}

function visitChart({
  path = '/inference',
  extraParams = '',
}: {
  path?: string;
  extraParams?: string;
}) {
  interceptRows();
  cy.visit(`${path}?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${extraParams}`, {
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

  it('switches the Display control to Timeline and renders the per-second traces', () => {
    visitChart({ extraParams: '&i_metric=y_measuredAvgPower' });
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length',
      CONFIGS.length,
    );

    cy.get('[data-testid="measured-power-display"]').click();
    cy.get('[data-slot="select-item"][data-value="timeline"]')
      .should('contain.text', 'Timeline')
      .click();

    assertShareLinkMetric('y_measuredPowerTimeline');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Power per Chip over Time',
    );
    cy.wait('@series').then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('series')).to.eq('power');
      expect(url.searchParams.get('prefix')).to.eq(
        'dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc',
      );
    });
    cy.get('[data-testid="power-timeline-chart-svg"]').within(() => {
      cy.get('path.power-trace[data-segment="full"]').should('have.length', CONFIGS.length);
      cy.get('path.power-trace[data-segment="window"]').should('have.length', CONFIGS.length);
      cy.get('.power-reference[data-reference="tdp"][data-watts="1000"]').should('exist');
      cy.get('text.power-trace-label').should('have.length', CONFIGS.length);
    });
    cy.get('[data-testid="power-timeline-source"] a').should('have.attr', 'href', RUN_URL);
    cy.get('[data-testid="power-metric-availability"]').should(
      'contain.text',
      '3 of 3 points have this metric',
    );

    // Back to watts returns the scatter body on the same points.
    cy.get('[data-testid="measured-power-display"]').click();
    cy.get('[data-slot="select-item"][data-value="watts"]').click();
    assertShareLinkMetric('y_measuredAvgPower');
    cy.get('[data-testid="power-timeline"]').should('not.exist');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length',
      CONFIGS.length,
    );
  });

  it('opens the timeline from a shared link and keeps the Table view on the measured average', () => {
    visitChart({ extraParams: '&i_metric=y_measuredPowerTimeline' });
    cy.wait('@series');
    cy.get('[data-testid="measured-power-display"]').should('contain.text', 'Timeline');
    cy.get('[data-testid="power-timeline-chart-svg"] path.power-trace').should(
      'have.length.at.least',
      CONFIGS.length,
    );
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-chart-display"] table').within(() => {
      cy.contains('th', 'Measured Power per Chip over Time (W)').should('be.visible');
      cy.contains('td', '700').should('exist');
    });
  });

  it('draws ?unofficialrun= overlay traces in the run colour', () => {
    interceptOverlay();
    visitChart({
      extraParams: `&unofficialrun=${OVERLAY_RUN_ID}&i_metric=y_measuredPowerTimeline`,
    });
    cy.wait(['@unofficialRun', '@series', '@overlaySeries']);
    cy.get('[data-testid="power-timeline-chart-svg"]').within(() => {
      cy.get('path.power-trace[data-run-index="0"][data-segment="window"]').should(
        'have.length',
        CONFIGS.length,
      );
      // Official hardware keys carry the framework suffix (`b200_sglang`).
      cy.get('path.power-trace[data-hw^="b200"][data-segment="window"]').should(
        'have.length',
        CONFIGS.length,
      );
      // B200 and H200 references.
      cy.get('.power-reference[data-reference="tdp"]').should('have.length', 2);
    });
    cy.get('[data-testid="chart-legend"]').should('contain.text', '✕ powerx-timeline');
  });

  it('translates the display option and chart on /zh/inference', () => {
    visitChart({ path: '/zh/inference', extraParams: '&i_metric=y_measuredPowerTimeline' });
    cy.wait('@series');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', '每芯片实测功耗时间线');
    cy.get('[data-testid="measured-power-display"]').should('contain.text', '时间线');
    cy.get('[data-testid="power-timeline-toolbar"]').should('contain.text', '时间轴');
  });
});
