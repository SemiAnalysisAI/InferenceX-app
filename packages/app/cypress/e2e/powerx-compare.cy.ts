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

function interceptRows(officialRunUrl: string) {
  const official = rows(null, 'b200').map((row, index) => ({
    ...row,
    curve_workflow_run_id: 27182818284,
    curve_date: DATE,
    run_url: index === 0 ? officialRunUrl : `${officialRunUrl}0`,
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
function interceptCheaperOverlayRows() {
  const cheaper = rows(OVERLAY_RUN_URL, 'h200').map((row) => ({
    ...row,
    metrics: {
      ...row.metrics,
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

function visitChart(extraParams: string, officialRunUrl: string, locale: 'en' | 'zh' = 'en') {
  interceptRows(officialRunUrl);
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
    it(`differences every visible Table row from one baseline source (${locale})`, () => {
      interceptCheaperOverlayRows();
      visitChart(
        `&unofficialrun=${OVERLAY_RUN_ID}&i_metric=y_measuredJPerOutputToken&i_optimal=0&i_best=0`,
        OFFICIAL_RUN_URL,
        locale,
      );
      cy.wait('@unofficialRun');
      cy.get('[data-testid="inference-table-view-btn"]').first().click();
      const tableRows = '[data-testid="inference-results-table"] tbody tr';
      cy.get(tableRows).should('have.length', CONFIGS.length * 2);
      cy.get('[data-testid="inference-results-table"] th').should(
        'contain.text',
        locale === 'zh' ? '相对基准差值' : 'Δ vs baseline',
      );

      // The first visible source is the baseline; the 10% cheaper overlay tableRows
      // differ from it at each shared load, in the metric column's own units.
      cy.get('[data-testid="inference-table-baseline-trigger"]').should('contain.text', 'B200');
      const baselineWord = locale === 'zh' ? '基准' : 'baseline';
      cy.get(`${tableRows}:contains("B200")`)
        .should('have.length', CONFIGS.length)
        .each(($row) => expect($row.text()).to.include(baselineWord));
      for (const delta of ['-0.240 (-10.0%)', '-0.160 (-10.0%)', '-0.100 (-10.0%)']) {
        cy.contains(tableRows, delta).should('contain.text', 'H200');
      }

      // Choosing the overlay as baseline flips the sign; nothing is interpolated.
      cy.get('[data-testid="inference-table-baseline-trigger"]').click();
      cy.contains('[role="option"]', 'H200').click();
      cy.contains(tableRows, '+0.240 (+11.1%)').should('contain.text', 'B200');
      cy.get(`${tableRows}:contains("H200")`).each(($row) =>
        expect($row.text()).to.include(baselineWord),
      );

      cy.viewport(390, 844);
      cy.get('[data-testid="inference-table-baseline-trigger"]').should(($trigger) => {
        const bounds = $trigger[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(390);
      });
    });
  }

  it('keeps the baseline column off non-power metrics', () => {
    visitChart('&i_metric=y_tpPerGpu', OFFICIAL_RUN_URL);
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should(
      'have.length',
      CONFIGS.length,
    );
    cy.get('[data-testid="inference-table-baseline"]').should('not.exist');
  });
});
