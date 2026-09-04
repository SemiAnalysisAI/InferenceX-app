// Deterministic intercepted rows exercise the validated/historical power UI:
// one row has power_valid=1 and one has no validation verdict.

const POWER_MODEL = 'dsv4';
const POWER_DATE = '2026-08-20';

const powerPercentileLadder = (prefix: string, base: number): Record<string, number> => ({
  [`median_${prefix}`]: base,
  [`p75_${prefix}`]: base * 1.2,
  [`p90_${prefix}`]: base * 1.5,
  [`p95_${prefix}`]: base * 1.7,
  [`p99_${prefix}`]: base * 2.2,
  [`std_${prefix}`]: base * 0.3,
});

const powerMetrics = (conc: number): Record<string, number> => {
  const scale = conc / 16;
  const itl = 0.011 * scale;
  return {
    ...powerPercentileLadder('ttft', 0.4 * scale),
    ...powerPercentileLadder('tpot', 0.012 * scale),
    ...powerPercentileLadder('itl', itl),
    ...powerPercentileLadder('e2el', 8 * scale),
    median_intvty: 1 / itl,
    p75_intvty: 1 / (itl * 1.2),
    p90_intvty: 1 / (itl * 1.5),
    p99_intvty: 1 / (itl * 2.2),
    std_intvty: (1 / itl) * 0.1,
    tput_per_gpu: 950 / Math.sqrt(scale),
    output_tput_per_gpu: 210,
    input_tput_per_gpu: 740,
  };
};

const powerConfigs = [
  // Legacy telemetry: measured watts without a producer verdict.
  { hardware: 'b200', framework: 'vllm', power: { avg_power_w: 560 } },
  // Certified telemetry: explicit power_valid=1 verdict.
  { hardware: 'mi300x', framework: 'sglang', power: { power_valid: 1, avg_power_w: 685.5 } },
];

const powerAvailability = powerConfigs.map((config) => ({
  model: POWER_MODEL,
  isl: 8192,
  osl: 1024,
  precision: 'fp4',
  hardware: config.hardware,
  framework: config.framework,
  spec_method: 'none',
  disagg: false,
  benchmark_type: 'single_turn',
  date: POWER_DATE,
}));

let powerBenchmarkId = 990000;
const powerBenchmarks = powerConfigs.flatMap((config) =>
  [16, 64, 128].map((conc) => ({
    id: powerBenchmarkId++,
    hardware: config.hardware,
    framework: config.framework,
    model: POWER_MODEL,
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
    image: `${config.framework}/server:test`,
    metrics: { ...powerMetrics(conc), ...config.power },
    workers: null,
    date: POWER_DATE,
    run_url: null,
  })),
);

function visitCertifiedPowerChart(extraParams = '') {
  cy.intercept('GET', '/api/v1/availability', { body: powerAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: powerBenchmarks }).as('benchmarks');
  cy.visit(`/inference?g_model=DeepSeek-V4-Pro&i_seq=8k/1k&i_prec=fp4${extraParams}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.wait(['@availability', '@benchmarks']);
  cy.get('[data-testid="inference-chart-display"]', { timeout: 30_000 }).should('exist');
  cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
}

describe('Validated vs historical measured power', () => {
  it('rings legacy points on a measured axis and filters them via Quick Filters', () => {
    visitCertifiedPowerChart();

    cy.get('.legacy-power-ring').should('not.exist');
    cy.get('[data-testid="legacy-power-key"]').should('not.exist');

    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', 'Measured Average Power per Chip')
      .scrollIntoView()
      .should('be.visible')
      .click();
    cy.get('[data-slot="select-content"]').should('not.exist');

    cy.get('[data-testid="measured-power-summary"]')
      .should('contain.text', 'Showing 2 of 6 measured points')
      .and('contain.text', '1/3 validated')
      .and('contain.text', '1/3 historical')
      .and('contain.text', 'Best per SKU and Optimal Only are enabled');

    cy.get('.dot-group[data-hw-key^="b200"] .legacy-power-ring').should('exist');
    cy.get('.dot-group[data-hw-key^="mi300x"] .legacy-power-ring').should('not.exist');
    cy.get('[data-testid="legacy-power-key"]').should('be.visible');
    cy.screenshot('legacy-power-rings', { capture: 'viewport' });

    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-power-certified"]').should('be.enabled');
    cy.get('[data-testid="quick-filter-power-legacy"]').should('be.enabled');
    cy.get('[data-testid="quick-filter-power-certified"]').should('contain.text', 'Validated');
    cy.get('[data-testid="quick-filter-power-legacy"]').should('contain.text', 'Historical');
    cy.get('[data-testid="measured-power-help"]').click();
    cy.contains('Both are shown by default.').should('be.visible');
    cy.get('body').type('{esc}');

    cy.get('[data-testid="quick-filter-power-certified"]').click();
    cy.get('[data-testid="quick-filters-selected-count"]').should('contain.text', '1 selected');
    cy.get('.dot-group[data-hw-key^="b200"]').should('not.exist');
    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');
    cy.get('.legacy-power-ring').should('not.exist');
    cy.get('[data-testid="legacy-power-key"]').should('not.exist');
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
    cy.screenshot('certified-only-filter', { capture: 'viewport' });

    cy.contains('button', 'Clear filters').click();
    cy.get('[data-testid="quick-filters-selected-count"]').should('not.exist');
    cy.get('[data-testid="quick-filter-power-certified"]').should(
      'have.attr',
      'aria-pressed',
      'false',
    );
    cy.get('[data-testid="quick-filters-dialog"]').contains('button', 'Done').click();
    cy.get('.dot-group[data-hw-key^="b200"] .legacy-power-ring').should('exist');
    cy.get('[data-testid="legacy-power-key"]').should('be.visible');
  });

  it('restores a shared i_power=certified link with the toggle pre-selected', () => {
    // Note: filter writes live in the in-memory share-link store (the address
    // bar is deliberately stripped after load — see url-state.ts), so the
    // durable observable behavior is the restore direction tested here.
    visitCertifiedPowerChart('&i_metric=y_measuredAvgPower&i_power=certified');

    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');
    cy.get('.dot-group[data-hw-key^="b200"]').should('not.exist');
    cy.get('[data-testid="legacy-power-key"]').should('not.exist');

    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filter-power-certified"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="quick-filters-selected-count"]').should('contain.text', '1 selected');
  });
});
