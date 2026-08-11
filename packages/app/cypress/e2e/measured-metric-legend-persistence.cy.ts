/**
 * Switching to a partially-covered Y-axis metric must not destroy the legend
 * selection.
 *
 * Regression: the Measured Energy axes only exist for configs whose run
 * recorded power telemetry. useChartData drops the other configs, and the
 * legend's active set used to be reconciled against that metric-filtered set.
 * reconcileActiveSet never re-widens, so switching back to throughput left the
 * pruned configs deselected — they disappeared from the chart and the legend
 * until the user reset them or reloaded the page.
 *
 * The fix reconciles the active set against a metric-independent universe, so
 * this spec pins both halves of the contract: the pruned config comes back on
 * its own, and a config the user removed by hand stays removed.
 */
const DEFAULT_MODEL_DB_KEY = 'dsv4'; // DeepSeek-V4-Pro is the default model
const LEGEND_RUN_DATE = '2026-08-01';

// Same framework on both configs on purpose: the engine-comparison exclusion
// policy resolves competing engines by dropping one group, which would hide a
// legend entry for reasons unrelated to metric coverage.
const LEGEND_CONFIGS = [
  { hardware: 'b200', label: 'B200', avgPowerW: 950 },
  { hardware: 'h200', label: 'H200', avgPowerW: undefined },
];

const legendAvailability = LEGEND_CONFIGS.map((c) => ({
  model: DEFAULT_MODEL_DB_KEY,
  isl: 8192,
  osl: 1024,
  precision: 'fp4',
  hardware: c.hardware,
  framework: 'vllm',
  spec_method: 'none',
  disagg: false,
  benchmark_type: 'single_turn',
  date: LEGEND_RUN_DATE,
}));

let legendBenchIdCursor = 940000;
const legendBenchmarks = LEGEND_CONFIGS.flatMap((c) =>
  [16, 64].map((conc) => ({
    id: legendBenchIdCursor++,
    hardware: c.hardware,
    framework: 'vllm',
    model: DEFAULT_MODEL_DB_KEY,
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
    image: 'vllm/vllm-openai:v0.9.0',
    metrics: {
      median_ttft: 0.4,
      median_tpot: 0.012,
      median_itl: 0.012,
      median_e2el: 8 + conc / 16,
      median_intvty: 90 - conc / 4,
      tput_per_gpu: 900 - conc,
      output_tput_per_gpu: 210,
      input_tput_per_gpu: 740,
      total_tput_tps: 7600,
      // Only the B200 run recorded power — this asymmetry is the whole point.
      ...(c.avgPowerW === undefined ? {} : { avg_power_w: c.avgPowerW + conc }),
    },
    workers: null,
    date: LEGEND_RUN_DATE,
    run_url: null,
  })),
);

const legendRoot = () => cy.get('[data-testid="chart-legend"]');
const checkedLegendRows = () =>
  cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked');

const pickYAxisMetric = (optionTitle: string) => {
  cy.get('[data-testid="yaxis-metric-selector"]').click();
  cy.get('[data-slot="select-content"]').should('exist');
  // The select list is a scroll container, so measured options sit below the
  // fold — scroll each target into view before clicking it.
  cy.contains('[role="option"]', optionTitle).scrollIntoView().click();
  cy.get('[data-slot="select-content"]').should('not.exist');
};

describe('Legend selection survives a partially-covered Y-axis metric', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/availability', { body: legendAvailability }).as('availability');
    cy.intercept('GET', '/api/v1/benchmarks*', { body: legendBenchmarks }).as('benchmarks');
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    legendRoot().contains('B200').should('exist');
    legendRoot().contains('H200').should('exist');
    checkedLegendRows().should('have.length', 2);
  });

  it('restores the telemetry-less config after a round trip through measured power', () => {
    pickYAxisMetric('Measured Average Power per Chip');

    // H200 has no power telemetry, so it correctly drops off this axis.
    legendRoot().contains('B200').should('exist');
    legendRoot().should('not.contain.text', 'H200');

    pickYAxisMetric('Token Throughput per Chip');

    // The regression: H200 came back as a legend row but stayed deselected.
    legendRoot().contains('H200').should('exist');
    checkedLegendRows().should('have.length', 2);
  });

  it('keeps a hand-removed config off across the same round trip', () => {
    // The X only becomes opaque on row hover (CSS group-hover), which Cypress
    // events don't trigger — force the click on the always-present element.
    legendRoot()
      .find('[role="button"][aria-label^="Hide"][aria-label*="H200"]')
      .click({ force: true });
    checkedLegendRows().should('have.length', 1);

    pickYAxisMetric('Measured Average Power per Chip');
    pickYAxisMetric('Token Throughput per Chip');

    // Restoring pruned configs must not resurrect an explicit deselection.
    legendRoot().find('[title^="Show H200"]').should('exist');
    checkedLegendRows().should('have.length', 1);
  });
});
