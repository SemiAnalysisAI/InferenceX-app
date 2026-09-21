import { assertShareLinkParams } from '../support/share-link';

// Power comparison series (`i_pcompare`) inside the gated Measured Energy
// group: `boundaries` overlays every power boundary, `roles` the prefill and
// decode pools, on the same points as the selected metric. Deterministic
// disaggregated rows carry validated whole-deployment and per-role telemetry,
// so every sibling series has a value; the overlay run adds H200 rows.

const MODEL = 'dsv4';
const DATE = '2026-09-01';
const OVERLAY_RUN_ID = '31415926535';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

/**
 * conc, interactivity (tok/s/user), output tok/s per GPU, measured W per GPU,
 * prefill W per GPU, decode W per GPU, J per output token, decode J per output token.
 * Input tokens outnumber output tokens 8:1, so J/in = J/out ÷ 8 and the prefill
 * pool's J/in reconstructs to J/out − decode J/out on the output-token axis.
 */
const CONFIGS: [number, number, number, number, number, number, number, number][] = [
  [16, 90, 200, 500, 800, 400, 2.4, 1.6],
  [64, 60, 400, 600, 820, 450, 1.6, 1],
  [256, 30, 800, 700, 840, 500, 1, 0.6],
];
const TOKEN_RATIO = 8;

// HW_REGISTRY: b200 tdp 1000 W / all-in 1.71 kW; h200 tdp 700 W / all-in 1.37 kW.
const B200_TDP_WATTS = 1000;
const B200_ALL_IN_WATTS = 1710;

let rowId = 990000;
const rows = (runUrl: string | null, hardware: 'b200' | 'h200') =>
  CONFIGS.map(([conc, intvty, outputTput, watts, prefillWatts, decodeWatts, jOut, decodeJOut]) => ({
    id: runUrl ? 0 : rowId++,
    hardware,
    framework: 'dynamo-sglang',
    model: MODEL,
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 4,
    decode_tp: 4,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    benchmark_type: 'single_turn',
    image: 'dynamo:test',
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
      prefill_avg_power_w: prefillWatts,
      decode_avg_power_w: decodeWatts,
      joules_per_output_token: jOut,
      joules_per_input_token: jOut / TOKEN_RATIO,
      prefill_joules_per_input_token: (jOut - decodeJOut) / TOKEN_RATIO,
      decode_joules_per_output_token: decodeJOut,
    },
    workers: null,
    date: DATE,
    run_url: runUrl,
  }));

const availability = [
  {
    model: MODEL,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'dynamo-sglang',
    spec_method: 'none',
    disagg: true,
    benchmark_type: 'single_turn',
    date: DATE,
  },
];

function interceptRows() {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: rows(null, 'b200') }).as('benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
}

function interceptOverlayRows() {
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: 'powerx-compare',
          branch: 'powerx-compare',
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
  cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
}

const sortedAsc = (values: number[]) => [...values].sort((a, b) => a - b);

/** Plotted y values (sorted) of every point matching `selector`, visible or not. */
function assertPlottedValues(selector: string, expected: number[]) {
  cy.get<SVGElement & { __data__: { y: number } }>(
    `[data-testid="inference-chart-display"] svg ${selector}`,
  ).should(($points) => {
    const values = sortedAsc(Array.from($points, (point) => point.__data__.y));
    expect(values).to.have.length(expected.length);
    for (const [index, value] of values.entries()) {
      expect(value).to.be.closeTo(expected[index], 1e-6);
    }
  });
}

function chooseCompare(mode: 'none' | 'boundaries' | 'roles') {
  cy.get('[data-testid="measured-power-compare"]').click();
  cy.get(`[data-slot="select-item"][data-value="${mode}"]`).click();
}

describe('PowerX comparison series (i_pcompare)', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message === 'ResizeObserver loop completed with undelivered notifications.') {
        return false;
      }
    });
  });

  it('overlays every boundary from a shared link and switches to roles from the Compare control', () => {
    visitChart({ extraParams: '&i_metric=y_measuredAvgPower&i_pcompare=boundaries' });
    cy.get('[data-testid="measured-power-compare"]').should('contain.text', 'All boundaries');

    const measured = CONFIGS.map((config) => config[3]);
    assertPlottedValues('.dot-group[data-power-variant=""]', sortedAsc(measured));
    assertPlottedValues(
      '.dot-group[data-power-variant="gpu-provisioned"]',
      CONFIGS.map(() => B200_TDP_WATTS),
    );
    assertPlottedValues(
      '.dot-group[data-power-variant="utility-provisioned"]',
      CONFIGS.map(() => B200_ALL_IN_WATTS),
    );
    // Siblings share the hardware colour and differ by dash; every series
    // draws its own power envelope.
    cy.get('[data-testid="inference-chart-display"] svg .roofline-path:not([data-power-variant])')
      .should('have.length', 1)
      .and('have.attr', 'data-hw-key', 'b200_dynamo-sglang');
    cy.get(
      '[data-testid="inference-chart-display"] svg .roofline-path[data-power-variant="gpu-provisioned"]',
    )
      .should('have.attr', 'stroke-dasharray', '8 4')
      .and('have.attr', 'data-hw-key', 'b200_dynamo-sglang');
    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', 'GPU measured')
      .and('contain.text', 'GPU provisioned (TDP)')
      .and('contain.text', 'Utility provisioned (all-in)');
    assertShareLinkParams({ i_metric: 'y_measuredAvgPower', i_pcompare: 'boundaries' });

    chooseCompare('roles');
    assertPlottedValues(
      '.dot-group[data-power-variant="prefill"]',
      sortedAsc(CONFIGS.map((config) => config[4])),
    );
    assertPlottedValues(
      '.dot-group[data-power-variant="decode"]',
      sortedAsc(CONFIGS.map((config) => config[5])),
    );
    cy.get(
      '[data-testid="inference-chart-display"] svg .dot-group[data-power-variant^="gpu-"]',
    ).should('not.exist');
    assertShareLinkParams({ i_pcompare: 'roles' });

    // The Table names each row's series.
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-chart-display"] table').within(() => {
      cy.contains('th', 'Series').should('be.visible');
      cy.contains('td', 'Prefill GPUs').should('exist');
      cy.contains('td', 'All GPUs').should('exist');
    });
    cy.get('[data-testid="inference-chart-view-btn"]').click();

    chooseCompare('none');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length',
      CONFIGS.length,
    );
    assertShareLinkParams({ i_pcompare: null });
  });

  it('reconstructs the prefill pool on the output-token energy axis and pauses off it', () => {
    visitChart({ extraParams: '&i_metric=y_measuredJPerOutputToken&i_pcompare=roles' });
    assertPlottedValues(
      '.dot-group[data-power-variant=""]',
      sortedAsc(CONFIGS.map((config) => config[6])),
    );
    // Prefill J/in × (J/out ÷ J/in) = the prefill pool's J per output token.
    assertPlottedValues(
      '.dot-group[data-power-variant="prefill"]',
      sortedAsc(CONFIGS.map((config) => config[6] - config[7])),
    );
    assertPlottedValues(
      '.dot-group[data-power-variant="decode"]',
      sortedAsc(CONFIGS.map((config) => config[7])),
    );
    cy.get('[data-testid="measured-compare-hint"]').should('not.exist');

    // A prefill J per input token axis has no decode counterpart: the
    // comparison pauses and says so instead of drawing a mismatched series.
    cy.get('[data-testid="measured-energy-denominator"]').click();
    cy.get('[data-slot="select-item"][data-value="input"]').click();
    cy.get('[data-testid="measured-compare-hint"]').should('be.visible');
    cy.get(
      '[data-testid="inference-chart-display"] svg .dot-group[data-power-variant="prefill"]',
    ).should('not.exist');
    cy.get('[data-testid="measured-power-compare"]').should('contain.text', 'Prefill vs decode');
    assertShareLinkParams({ i_metric: 'y_measuredJPerInputToken', i_pcompare: 'roles' });
  });

  it('draws comparison siblings for ?unofficialrun= overlay rows in the run colour', () => {
    interceptOverlayRows();
    visitChart({
      extraParams: `&unofficialrun=${OVERLAY_RUN_ID}&i_metric=y_measuredAvgPower&i_pcompare=boundaries`,
    });
    cy.wait('@unofficialRun');
    // Three overlay rows × (measured + TDP + all-in).
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      CONFIGS.length * 3,
    );
    cy.get(
      '[data-testid="inference-chart-display"] svg .overlay-roofline-path[data-power-variant="gpu-provisioned"]',
    )
      .should('have.length', 1)
      .and('have.attr', 'stroke-dasharray', '8 4')
      .then(($sibling) => {
        cy.get(
          '[data-testid="inference-chart-display"] svg .overlay-roofline-path:not([data-power-variant])',
        ).should(($base) => {
          expect($sibling.attr('stroke')).to.eq($base.attr('stroke'));
        });
      });
    // Comparison clones do not inflate the availability count.
    cy.get('[data-testid="power-metric-availability"]').should(
      'contain.text',
      '6 of 6 points have this metric',
    );
  });

  it('translates the Compare control and legend rows on /zh/inference', () => {
    visitChart({
      path: '/zh/inference',
      extraParams: '&i_metric=y_measuredAvgPower&i_pcompare=roles',
    });
    cy.get('[data-testid="measured-metric-controls"]').should('contain.text', '对比');
    cy.get('[data-testid="measured-power-compare"]').should('contain.text', '预填充 vs 解码');
    cy.get('[data-testid="chart-legend"]')
      .should('contain.text', '全部 GPU')
      .and('contain.text', '预填充 GPU')
      .and('contain.text', '解码 GPU');
  });
});
