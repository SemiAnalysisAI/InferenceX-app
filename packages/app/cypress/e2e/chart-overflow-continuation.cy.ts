/**
 * Intentional cost/TTFT clipping must read as a deliberate chart boundary,
 * not as a mysteriously truncated benchmark line. Covers both official rows
 * and the mandatory `?unofficialrun=` overlay path.
 */
const MODEL_DISPLAY = 'DeepSeek-V4-Pro';
const MODEL_DB = 'dsv4';
const RUN_DATE = '2026-07-30';
const OVERLAY_RUN_ID = '99900000055';
const OVERLAY_BRANCH = 'test/chart-overflow-continuation';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

const metrics = (interactivity: number, ttft: number, tputPerGpu: number) => ({
  median_intvty: interactivity,
  median_itl: 1 / interactivity,
  median_ttft: ttft,
  p99_ttft: ttft * 1.1,
  median_e2el: ttft + 20,
  p99_e2el: ttft + 25,
  median_tpot: 1 / interactivity,
  p99_tpot: 1 / interactivity,
  tput_per_gpu: tputPerGpu,
  input_tput_per_gpu: tputPerGpu * 0.8,
  output_tput_per_gpu: tputPerGpu * 0.2,
});

const row = (
  id: number,
  conc: number,
  interactivity: number,
  ttft: number,
  tputPerGpu: number,
  runUrl: string | null,
) => ({
  id: runUrl ? 0 : id,
  hardware: 'b200',
  framework: 'vllm',
  model: MODEL_DB,
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
  image: 'vllm/vllm-openai:test',
  metrics: metrics(interactivity, ttft, tputPerGpu),
  workers: null,
  date: RUN_DATE,
  run_url: runUrl,
});

// C=1 exceeds $5/M, C=1024 exceeds 60s TTFT, and C=512 is the
// sole in-bounds point. The complete lower-left cost frontier crosses the
// visible region on both sides, so the chart should draw two continuations.
const rows = (runUrl: string | null) => [
  row(910001, 1, 162.6, 0.35, 80, runUrl),
  row(910002, 512, 55.7, 36.28, 3887, runUrl),
  row(910003, 1024, 41.45, 69.65, 4486, runUrl),
];

const availability = [
  {
    model: MODEL_DB,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'vllm',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: RUN_DATE,
  },
];

const visitOverflowChart = (withOverlay: boolean) => {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: rows(null) }).as('benchmarks');
  if (withOverlay) {
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: Number(OVERLAY_RUN_ID),
            name: OVERLAY_BRANCH,
            branch: OVERLAY_BRANCH,
            sha: 'abc055',
            createdAt: `${RUN_DATE}T00:00:00Z`,
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: rows(OVERLAY_RUN_URL),
        evaluations: [],
      },
    }).as('unofficialRun');
  }

  const overlayParam = withOverlay ? `&unofficialrun=${OVERLAY_RUN_ID}` : '';
  cy.visit(
    `/inference?g_model=${MODEL_DISPLAY}&g_rundate=${RUN_DATE}&i_seq=8k%2F1k&i_metric=y_costh&i_xmode=ttft&i_optimal=0${overlayParam}`,
    {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    },
  );
  cy.wait('@benchmarks');
  if (withOverlay) cy.wait('@unofficialRun');
  cy.get('[data-testid="chart-overflow-notice"]').should('be.visible');
};

describe('Chart overflow continuations', () => {
  it('draws official dashed arrows and explains both active display limits', () => {
    visitOverflowChart(false);

    cy.get('[data-testid="official-overflow-continuation"]')
      .should('have.length', 2)
      .each(($continuation) => {
        cy.wrap($continuation)
          .find('.overflow-continuation-line')
          .should('have.attr', 'stroke-dasharray');
        cy.wrap($continuation).find('.overflow-continuation-arrow').should('exist');
      });

    cy.get('[data-testid="chart-overflow-notice"]')
      .should('contain.text', '2 points outside chart limits')
      .click();
    cy.get('[data-testid="chart-overflow-popover"]')
      .should('contain.text', '1 point above $5/M is hidden.')
      .and('contain.text', '1 point beyond 60s TTFT is hidden.')
      .and('contain.text', 'Dashed arrows show where the Pareto line continues');
  });

  it('draws overlay continuations and removes them when that run is dismissed', () => {
    visitOverflowChart(true);

    cy.get('[data-testid="overlay-overflow-continuation"]').should('have.length', 2);
    cy.get('[data-testid="chart-overflow-notice"]').should(
      'contain.text',
      '4 points outside chart limits',
    );

    cy.get(`[aria-label="Dismiss ${OVERLAY_BRANCH}"]`).click();
    cy.get('[data-testid="overlay-overflow-continuation"]').should('not.exist');
    cy.get('[data-testid="official-overflow-continuation"]').should('have.length', 2);
    cy.get('[data-testid="chart-overflow-notice"]').should(
      'contain.text',
      '2 points outside chart limits',
    );
  });
});
