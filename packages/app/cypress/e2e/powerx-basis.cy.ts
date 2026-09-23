import { assertShareLinkMetric } from '../support/share-link';

// Power boundaries inside the gated Measured Energy group. Deterministic
// intercepted rows carry validated telemetry and throughput, so every boundary
// (GPU measured, GPU provisioned, utility provisioned, utility modeled) has a
// value on the official B200 rows; the overlay run adds H200 rows. The metric
// key carries the boundary — there is no separate URL parameter to round-trip.

const BASIS_MODEL = 'dsv4';
const BASIS_DATE = '2026-09-01';
const BASIS_OVERLAY_RUN_ID = '31415926535';
const BASIS_OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${BASIS_OVERLAY_RUN_ID}`;

/** conc, interactivity (tok/s/user), output tok/s per GPU, measured W per GPU, measured J/out */
const BASIS_CONFIGS: [number, number, number, number, number][] = [
  [16, 90, 200, 500, 2.5],
  [64, 60, 400, 600, 1.5],
  [256, 30, 800, 700, 0.875],
];

// HW_REGISTRY: b200 tdp 1000 W / all-in 1.71 kW; h200 tdp 700 W / all-in 1.37 kW.
const B200_ALL_IN_WATTS = 1710;
const H200_ALL_IN_WATTS = 1370;
const B200_TDP_WATTS = 1000;

const basisMetrics = (
  intvty: number,
  outputTput: number,
  watts: number,
  joulesPerOutput: number,
): Record<string, number> => ({
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
  // Eight validated GPUs on one host: the chassis model recovers the count
  // from total ÷ per-GPU watts, so the utility modeled boundary is supported.
  avg_total_gpu_power_w: watts * 8,
  joules_per_output_token: joulesPerOutput,
});

let basisId = 970000;
const basisRows = (runUrl: string | null, hardware: 'b200' | 'h200') =>
  BASIS_CONFIGS.map(([conc, intvty, outputTput, watts, joules]) => ({
    id: runUrl ? 0 : basisId++,
    hardware,
    framework: 'sglang',
    model: BASIS_MODEL,
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
    metrics: basisMetrics(intvty, outputTput, watts, joules),
    workers: null,
    date: BASIS_DATE,
    run_url: runUrl,
  }));

const basisAvailability = [
  {
    model: BASIS_MODEL,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: BASIS_DATE,
  },
];

function interceptBasisRows() {
  cy.intercept('GET', '/api/v1/availability', { body: basisAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: basisRows(null, 'b200') }).as('benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
}

function interceptOverlayRows() {
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: BASIS_OVERLAY_RUN_ID,
          name: 'powerx-basis',
          branch: 'powerx-basis',
          sha: 'abc000',
          createdAt: `${BASIS_DATE}T00:00:00Z`,
          url: BASIS_OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: basisRows(BASIS_OVERLAY_RUN_URL, 'h200'),
      evaluations: [],
    },
  }).as('unofficialRun');
}

function visitBasisChart({
  path = '/inference',
  extraParams = '',
  gateUnlocked,
}: {
  path?: string;
  extraParams?: string;
  gateUnlocked: boolean;
}) {
  interceptBasisRows();
  cy.visit(`${path}?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${extraParams}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      if (gateUnlocked) win.localStorage.setItem('inferencex-feature-gate', '1');
      else win.localStorage.removeItem('inferencex-feature-gate');
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

describe('PowerX power boundaries in the Measured Energy group', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message === 'ResizeObserver loop completed with undelivered notifications.') {
        return false;
      }
    });
  });

  it('switches the boundary from the Measured controls and carries it in i_metric', () => {
    visitBasisChart({ gateUnlocked: true, extraParams: '&i_metric=y_measuredJPerOutputToken' });
    cy.get('[data-testid="measured-metric-controls"]').should('be.visible');
    cy.get('[data-testid="measured-energy-basis"]')
      .should('be.visible')
      .and('contain.text', 'GPU measured');
    cy.get('[data-testid="power-basis-assumptions"]').should('not.exist');

    cy.get('[data-testid="measured-energy-basis"]').click();
    cy.get('[data-slot="select-item"][data-value="utility-provisioned"]')
      .should('contain.text', 'Utility provisioned (all-in)')
      .click();

    assertShareLinkMetric('y_utilityProvisionedJPerOutputToken');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Utility Provisioned Joules per Output Token, all GPUs (all-in)',
    );
    // Aggregate rows: all-in W ÷ output tok/s per GPU (N_alloc cancels).
    assertPlottedValues(
      '.dot-group',
      sortedAsc(BASIS_CONFIGS.map((config) => B200_ALL_IN_WATTS / config[2])),
    );
    cy.get('[data-testid="power-basis-assumptions"]')
      .should('have.attr', 'data-power-basis', 'utility-provisioned')
      .and('contain.text', 'all-in provisioned utility power per GPU')
      .and('contain.text', 'prefill and decode GPUs together');
    cy.get('[data-testid="power-metric-availability"]').should(
      'contain.text',
      '3 of 3 points have this metric',
    );
    // The collapsed Y-axis option carries the boundary metric's own
    // explanation, so its help popover must resolve for a boundary key.
    cy.get('[data-testid="selected-option-help-y_utilityProvisionedJPerOutputToken"]').trigger(
      'pointerover',
      { pointerType: 'mouse' },
    );
    cy.get('[data-testid="selected-option-help-content-y_utilityProvisionedJPerOutputToken"]')
      .should('be.visible')
      .and('contain.text', 'J/tok')
      .and('contain.text', 'allocated GPUs');
    cy.get('[data-testid="selected-option-help-y_utilityProvisionedJPerOutputToken"]').trigger(
      'pointerout',
      { pointerType: 'mouse' },
    );
    // The other energy settings stay usable and return to GPU measured.
    cy.get('[data-testid="measured-energy-denominator"]').click();
    cy.get('[data-slot="select-item"][data-value="query"]').click();
    assertShareLinkMetric('y_measuredJPerSuccessfulQuery');
    cy.get('[data-testid="measured-energy-basis"]').should('contain.text', 'GPU measured');
  });

  it('renders a shared utility-modeled link while the gate is locked and hides the group otherwise', () => {
    visitBasisChart({ gateUnlocked: false, extraParams: '&i_metric=y_utilityModeledWatts' });
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Utility Modeled Power per Chip (PUE)',
    );
    // B200 8k/1k with eight validated GPUs is inside the chassis model, so
    // every row has a modeled utility value above its measured watts.
    cy.get<SVGElement & { __data__: { y: number } }>(
      '[data-testid="inference-chart-display"] svg .dot-group',
    ).should(($points) => {
      expect($points).to.have.length(BASIS_CONFIGS.length);
      const measured = sortedAsc(BASIS_CONFIGS.map((config) => config[3]));
      const plotted = sortedAsc(Array.from($points, (point) => point.__data__.y));
      for (const [index, value] of plotted.entries()) {
        // Chassis AC × PUE 1.3 per GPU exceeds the GPU-board watts but stays
        // below the 1.71 kW all-in provisioning.
        expect(value).to.be.greaterThan(measured[index]);
        expect(value).to.be.lessThan(B200_ALL_IN_WATTS);
      }
    });
    cy.get('[data-testid="power-basis-assumptions"]')
      .should('have.attr', 'data-power-basis', 'utility-modeled')
      .and('contain.text', 'PUE 1.3')
      .and('contain.text', 'revision');
    // Watt boundaries draw the upper power envelope like measured watts, so
    // Optimal Only (default on) keeps every load point instead of a Pareto corner.
    cy.get('[data-testid="power-curve-description"]').should('exist');
    cy.get('[data-testid="inference-chart-display"] svg .roofline-path')
      .should('have.length.at.least', 1)
      .and('have.attr', 'data-curve-kind', 'power-envelope');
    cy.get<SVGElement>('[data-testid="inference-chart-display"] svg .dot-group').should(
      ($points) => {
        const shown = [...$points].filter((point) => getComputedStyle(point).opacity === '1');
        expect(shown).to.have.length(BASIS_CONFIGS.length);
      },
    );
    // Like its Measured siblings, the selected gated metric keeps its own
    // controls reachable from a shared link.
    cy.get('[data-testid="measured-power-basis"]').should('contain.text', 'Utility modeled (PUE)');
    cy.get('[data-testid="measured-basis-hint"]').should('be.visible');

    // Without the shared metric the locked gate hides the whole group.
    visitBasisChart({ gateUnlocked: false });
    cy.get('[data-testid="measured-metric-controls"]').should('not.exist');
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-slot="select-content"]').should('exist');
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'Measured Power');
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'Measured Energy');
  });

  it('shows the boundary column in the Table view', () => {
    visitBasisChart({ gateUnlocked: true, extraParams: '&i_metric=y_gpuProvisionedWatts' });
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-chart-display"] table').within(() => {
      cy.contains('th', 'GPU Provisioned Power per Chip (TDP, W)').should('be.visible');
      // formatInferenceTableNumber renders the 1000 W spec constant as "1,000".
      cy.contains('td', B200_TDP_WATTS.toLocaleString('en-US')).should('exist');
    });
  });

  it('translates the boundary control and metric on /zh/inference', () => {
    visitBasisChart({
      path: '/zh/inference',
      gateUnlocked: true,
      extraParams: '&i_metric=y_gpuProvisionedJPerOutputToken',
    });
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      '每输出 token GPU 额定焦耳能耗（TDP）',
    );
    cy.get('[data-testid="measured-metric-controls"]').should('contain.text', '功耗边界');
    cy.get('[data-testid="measured-energy-basis"]').should('contain.text', 'GPU 额定（TDP）');
    cy.get('[data-testid="measured-basis-hint"]').should('contain.text', '返回 GPU 实测');
    cy.get('[data-testid="power-basis-assumptions"]').should('contain.text', 'GPU 额定边界');
    cy.get('[data-testid="power-metric-availability"]').should(
      'contain.text',
      '3 个数据点中有 3 个提供此指标',
    );
    assertPlottedValues(
      '.dot-group',
      sortedAsc(BASIS_CONFIGS.map((config) => B200_TDP_WATTS / config[2])),
    );
  });

  it('plots the boundary for ?unofficialrun= overlay rows with the overlay hardware specs', () => {
    interceptOverlayRows();
    visitBasisChart({
      gateUnlocked: true,
      extraParams: `&unofficialrun=${BASIS_OVERLAY_RUN_ID}&i_metric=y_utilityProvisionedJPerOutputToken`,
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Utility Provisioned Joules per Output Token, all GPUs (all-in)',
    );
    assertPlottedValues(
      '.dot-group',
      sortedAsc(BASIS_CONFIGS.map((config) => B200_ALL_IN_WATTS / config[2])),
    );
    // Overlay H200 rows derive from their own registry specs, not the official B200's.
    assertPlottedValues(
      '.unofficial-overlay-pt',
      sortedAsc(BASIS_CONFIGS.map((config) => H200_ALL_IN_WATTS / config[2])),
    );
    // Official (3) + visible overlay (3) rows feed the availability count.
    cy.get('[data-testid="power-metric-availability"]').should(
      'contain.text',
      '6 of 6 points have this metric',
    );
    // The modeled boundary rides the same overlay path: validated H200 8k/1k
    // telemetry is inside the chassis model too.
    cy.get('[data-testid="measured-energy-basis"]').click();
    cy.get('[data-slot="select-item"][data-value="utility-modeled"]').click();
    assertShareLinkMetric('y_utilityModeledJPerOutputToken');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      BASIS_CONFIGS.length,
    );
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length',
      BASIS_CONFIGS.length,
    );
  });
});
