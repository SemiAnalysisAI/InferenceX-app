import { assertShareLinkParams } from '../support/share-link';

// The PowerX article panels inside the gated Measured Energy group.
// Deterministic disaggregated rows carry validated whole-deployment and
// per-role telemetry; the overlay run adds H200 rows.

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

function interceptRows(officialRunUrl: string, clippedLatency = false) {
  const official = rows(null, 'b200').map((row, index) => ({
    ...row,
    curve_workflow_run_id: 27182818284,
    curve_date: DATE,
    run_url: index === 0 ? officialRunUrl : `${officialRunUrl}0`,
    metrics: {
      ...row.metrics,
      median_ttft: clippedLatency ? [0.5, 2, 90][index] : row.metrics.median_ttft,
    },
    power_audit: {
      producer_sha: index === 0 ? 'producer-a' : 'producer-b',
      exporter_image_sha256: index === 0 ? 'exporter-a' : 'exporter-b',
    },
  }));
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: official }).as('benchmarks');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
}

/** Overlay rows 10% cheaper per token than the official rows, so they own the frontier. */
function interceptCheaperOverlayRows(clippedLatency = false) {
  const cheaper = rows(OVERLAY_RUN_URL, 'h200').map((row, index) => ({
    ...row,
    metrics: {
      ...row.metrics,
      median_ttft: clippedLatency ? [0.5, 2, 90][index] : row.metrics.median_ttft,
      joules_per_output_token: row.metrics.joules_per_output_token * 0.9,
      joules_per_input_token: row.metrics.joules_per_input_token * 0.9,
    },
  }));
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: 'powerx-panels',
          branch: 'powerx-panels',
          sha: 'abc000',
          createdAt: `${DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: cheaper,
      evaluations: [],
    },
  }).as('unofficialRun');
}

function visitChart(
  extraParams: string,
  officialRunUrl: string,
  {
    locale = 'en',
    clippedLatency = false,
  }: { locale?: 'en' | 'zh'; clippedLatency?: boolean } = {},
) {
  interceptRows(officialRunUrl, clippedLatency);
  cy.visit(
    `${locale === 'zh' ? '/zh' : ''}/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${extraParams}`,
    {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
        win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
      },
    },
  );
  cy.wait(['@availability', '@benchmarks']);
  cy.get('[data-testid="inference-chart-display"]').should('exist');
  cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
}

function selectPowerSource(testId: string, label: string) {
  cy.get(`[data-testid="${testId}"]`)
    .find('option')
    .contains(label)
    .invoke('val')
    .then((value) => {
      expect(value).to.be.a('string');
      cy.get(`[data-testid="${testId}"]`).select(String(value));
    });
}

function assertReadableDifference(tableId: string, text: string) {
  cy.contains(`[data-testid="${tableId}"] td`, text).should(($cell) => {
    const cell = $cell[0];
    const container = cell.closest('table')!.parentElement!;
    const range = cell.ownerDocument.createRange();
    range.selectNodeContents(cell);
    const bounds = range.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    const firstCell = cell.parentElement!.querySelector('td')!;
    const leftEdge =
      getComputedStyle(firstCell).position === 'sticky'
        ? firstCell.getBoundingClientRect().right
        : containerBounds.left;
    expect(bounds.left, 'difference starts beyond any pinned column').to.be.at.least(leftEdge);
    expect(bounds.right, 'complete difference fits in the scroll viewport').to.be.at.most(
      containerBounds.right + 1,
    );
  });
}

function capturePowerTable(name: string) {
  cy.get('[data-testid="power-comparison-table"]').scrollIntoView({
    offset: { top: -90, left: 0 },
  });
  cy.screenshot(name, { capture: 'viewport' });
}

describe('PowerX article panels', () => {
  const PANELS = '&i_roleshare=1&i_powerfit=1&i_frontier=1';
  const RETIRED_COMPARE =
    '&i_servicecompare=1&i_servicebase=old-baseline&i_servicepeer=old-comparator&i_servicetarget=40';
  const OFFICIAL_RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/27182818284';
  const OVERLAY_COLOR = 'var(--overlay-run-0)';

  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message === 'ResizeObserver loop completed with undelivered notifications.') {
        return false;
      }
    });
  });

  it('keeps role, fit and frontier panels while ignoring retired comparison share state', () => {
    interceptCheaperOverlayRows();
    visitChart(
      `&unofficialrun=${OVERLAY_RUN_ID}&i_metric=y_measuredJPerOutputToken${PANELS}${RETIRED_COMPARE}`,
      OFFICIAL_RUN_URL,
    );
    cy.wait('@unofficialRun');
    cy.get('[data-testid="power-analysis-panels"]').should('be.visible');
    cy.get('[data-testid^="equal-service-"]').should('not.exist');
    cy.get('[data-testid^="matched-concurrency"]').should('not.exist');

    // Role power: prefill and decode W/GPU for both sources; the overlay in its run colour.
    cy.get('[data-testid="chart-0-role-power-plot"] circle.point').should(
      'have.length',
      CONFIGS.length * 4,
    );
    cy.get(`[data-testid="chart-0-role-power-plot"] circle.point[fill="${OVERLAY_COLOR}"]`).should(
      'have.length',
      CONFIGS.length * 2,
    );
    cy.get('[data-testid="chart-0-role-share-plot"] circle.point').should(
      'have.length',
      CONFIGS.length * 2,
    );

    // Output per allocated GPU is output per decode GPU × 4 ÷ 8: 100, 200 and 400 tok/s.
    // W/GPU 500, 600, 700 → P0 450 W, m 0.643 J/token, R² 0.964.
    cy.get('[data-testid="power-fit-row"]').should('have.length', 2);
    cy.get('[data-testid="power-fit-row"]')
      .filter(':contains("B200")')
      .should('contain.text', '450')
      .and('contain.text', '45% · 1,000 W')
      .and('contain.text', '0.643')
      .and('contain.text', '0.964')
      .and('contain.text', '100.0–400.0');
    cy.get('[data-testid="power-fit-row"]')
      .filter(':contains("H200")')
      .should('contain.text', '64% · 700 W');

    // The cheaper overlay rows own the frontier; each lists its run.
    cy.get('[data-testid="frontier-points-row"]')
      .should('have.length', CONFIGS.length)
      .each(($row) => {
        expect($row.text()).to.include('unofficial');
        expect($row.find('a').attr('href')).to.eq(OVERLAY_RUN_URL);
      });
    assertShareLinkParams({
      i_servicecompare: null,
      i_servicebase: null,
      i_servicepeer: null,
      i_servicetarget: null,
      i_roleshare: '1',
      i_powerfit: '1',
      i_frontier: '1',
    });
  });

  for (const locale of ['en', 'zh'] as const) {
    it(`compares official and overlay energy inside the existing Table view (${locale})`, () => {
      cy.viewport(1440, 1000);
      interceptCheaperOverlayRows(true);
      visitChart(
        `&unofficialrun=${OVERLAY_RUN_ID}&i_metric=y_measuredJPerOutputToken&i_xmode=ttft&i_mstat=median&i_optimal=0&i_best=0`,
        OFFICIAL_RUN_URL,
        { locale, clippedLatency: true },
      );
      cy.wait('@unofficialRun');
      // The 90-second observations lie beyond the TTFT chart's 60-second limit.
      cy.get('[data-testid="chart-figure"]').last().find('svg .dot-group').should('have.length', 2);
      cy.get('[data-testid="chart-figure"]')
        .last()
        .find('svg .unofficial-overlay-pt')
        .should('have.length', 2);
      cy.get('[data-testid="inference-table-view-btn"]').last().click();
      cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 6);
      cy.contains(
        '[data-testid="inference-table-content"] button',
        locale === 'zh' ? '功耗与能耗对比' : 'Compare power & energy',
      ).click();
      cy.get('[data-testid="inference-results-table"]').should('not.exist');
      selectPowerSource('power-table-baseline', 'B200');
      selectPowerSource('power-table-comparator', 'H200');
      cy.get('[data-testid="power-concurrency-results"] tbody tr').should('have.length', 3);
      for (const [concurrency, energyDifference] of [
        [16, '-0.24'],
        [64, '-0.16'],
        [256, '-0.1'],
      ] as const) {
        cy.get('[data-testid="power-concurrency-results"] tbody')
          .contains('td', new RegExp(`^${concurrency}$`, 'u'))
          .parent('tr')
          .should('contain.text', `${energyDifference} J/output token (-10%)`)
          .and('contain.text', '0 W/GPU (0%)');
      }
      capturePowerTable(`power-table-${locale}-desktop`);

      cy.get('[data-testid="power-table-match"]').select('service');
      cy.get('[data-testid="power-table-target"]').clear().type('46');
      cy.get('[data-testid="power-service-results"] tbody')
        .contains('tr', locale === 'zh' ? 'GPU 能耗' : 'GPU energy')
        .should('contain.text', '1.3')
        .and('contain.text', '1.17')
        .and('contain.text', '-0.13 J/output token (-10%)')
        .and('contain.text', locale === 'zh' ? '插值估算' : 'Interpolated');
      cy.get('[data-testid="power-concurrency-results"]').should('not.exist');

      cy.get('[data-testid="power-table-match"]').select('concurrency');
      cy.viewport(390, 844);
      cy.get('[data-testid="power-table-baseline"], [data-testid="power-table-comparator"]')
        .should('be.visible')
        .each(($control) => {
          const bounds = $control[0].getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(390);
        });
      cy.get('[data-testid="power-concurrency-results"] table').parent().scrollTo('right');
      cy.contains(
        '[data-testid="power-concurrency-results"] td',
        '-0.24 J/output token (-10%)',
      ).should('be.visible');
      assertReadableDifference('power-concurrency-results', '-0.24 J/output token (-10%)');
      capturePowerTable(`power-table-${locale}-mobile`);
      cy.get('[data-testid="power-table-match"]').select('service');
      cy.get('[data-testid="power-table-target"]').should(($target) => {
        expect($target[0].getBoundingClientRect().width).to.be.greaterThan(250);
      });
      cy.get('[data-testid="power-service-results"] table')
        .parent()
        .scrollTo('right', { ensureScrollable: false });
      assertReadableDifference('power-service-results', '-0.13 J/output token (-10%)');
      capturePowerTable(`power-table-${locale}-mobile-service`);
      cy.contains(
        '[data-testid="inference-table-content"] button',
        locale === 'zh' ? '实测数据' : 'Measurements',
      ).click();
      cy.get('[data-testid="power-comparison-table"]').should('not.exist');
      cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 6);
    });
  }

  it('keeps power comparisons out of the throughput Table view', () => {
    cy.viewport(1440, 1000);
    visitChart('&i_metric=y_tpPerGpu', OFFICIAL_RUN_URL);
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 3);
    cy.get('[data-testid="inference-table-content"]').should('not.exist');
    cy.get('[data-testid="power-comparison-table"]').should('not.exist');
  });
});
