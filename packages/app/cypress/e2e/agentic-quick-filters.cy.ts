import { unlockAgenticGate } from '../support/e2e';

const MODEL = 'dsv4';
const DATE = '2026-06-12';

const percentileLadder = (prefix: string, base: number): Record<string, number> => ({
  [`median_${prefix}`]: base,
  [`p75_${prefix}`]: base * 1.2,
  [`p90_${prefix}`]: base * 1.5,
  [`p95_${prefix}`]: base * 1.7,
  [`p99_${prefix}`]: base * 2.2,
  [`std_${prefix}`]: base * 0.3,
});

const metrics = (conc: number): Record<string, number> => {
  const scale = conc / 16;
  const itl = 0.011 * scale;
  return {
    ...percentileLadder('ttft', 0.4 * scale),
    ...percentileLadder('tpot', 0.012 * scale),
    ...percentileLadder('itl', itl),
    ...percentileLadder('e2el', 8 * scale),
    median_intvty: 1 / itl,
    p75_intvty: 1 / (itl * 1.2),
    p90_intvty: 1 / (itl * 1.5),
    p99_intvty: 1 / (itl * 2.2),
    std_intvty: (1 / itl) * 0.1,
    tput_per_gpu: 950 / Math.sqrt(scale),
    output_tput_per_gpu: 210,
    input_tput_per_gpu: 740,
    total_tput_tps: 380 * conc,
  };
};

const configs = [
  { hardware: 'b200', framework: 'vllm', disagg: false },
  { hardware: 'mi300x', framework: 'sglang', disagg: true },
];

const availability = [
  ...configs.map((config) => ({
    model: MODEL,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: config.hardware,
    framework: config.framework,
    spec_method: 'mtp',
    disagg: config.disagg,
    benchmark_type: 'agentic_traces',
    date: DATE,
  })),
  ...configs.map((config) => ({
    model: MODEL,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: config.hardware,
    framework: config.framework,
    spec_method: 'none',
    disagg: config.disagg,
    benchmark_type: 'single_turn',
    date: DATE,
  })),
];

let benchmarkId = 980000;
const benchmarks = configs.flatMap((config) =>
  [16, 64, 128].map((conc) => ({
    id: benchmarkId++,
    ...config,
    model: MODEL,
    precision: 'fp4',
    spec_method: 'mtp',
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'off',
    benchmark_type: 'agentic_traces',
    image: `${config.framework}/server:test`,
    metrics: metrics(conc),
    workers: null,
    date: DATE,
    run_url: null,
  })),
);

function visitAgenticQuickFilters() {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: benchmarks }).as('benchmarks');
  cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4&i_spec=mtp', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      unlockAgenticGate(win);
    },
  });
  cy.wait(['@availability', '@benchmarks']);
  cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
}

describe('Agentic Quick Filters', () => {
  it('opens from the legend, omits spec decoding, and filters the rendered agentic points', () => {
    visitAgenticQuickFilters();

    // A stale speculative-decoding URL selection is ignored for agentic data.
    cy.get('.dot-group[data-hw-key^="b200"]').should('exist');
    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');
    cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
    cy.get('[data-testid="scatter-quick-filters"]').should('contain.text', 'Quick Filters').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filters-selected-count"]').should('not.exist');

    cy.get('[data-testid^="quick-filter-spec-"]').should('not.exist');
    cy.contains('Spec Decoding').should('not.exist');

    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-AMD"]').click();
    cy.get('.dot-group[data-hw-key^="b200"]').should('not.exist');
    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');
    cy.get('[data-testid="quick-filters-selected-count"]').should('contain.text', '1 selected');

    // An incompatible cross-group selection produces zero points. The dialog
    // must stay mounted so the reader can recover without reloading the page.
    cy.get('[data-testid="quick-filter-framework-select"]').click();
    cy.get('[data-testid="quick-filter-framework-vllm"]').click();
    cy.get('[data-testid="scatter-empty-quick-filters"]').should('exist');
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');

    cy.contains('button', 'Clear filters').click();
    cy.get('.dot-group[data-hw-key^="b200"]').should('exist');
    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');
    cy.get('[data-testid="quick-filters-selected-count"]').should('not.exist');
  });

  it('clears Quick Filters from the legend reset action', () => {
    visitAgenticQuickFilters();

    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-AMD"]').click();
    cy.get('[data-testid="quick-filters-dialog"]').contains('button', 'Done').click();

    cy.get('.dot-group[data-hw-key^="b200"]').should('not.exist');
    cy.get('[data-testid="scatter-reset-filter"]').click();
    cy.get('.dot-group[data-hw-key^="b200"]').should('exist');
    cy.get('.dot-group[data-hw-key^="mi300x"]').should('exist');

    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-AMD"]').should('have.attr', 'aria-selected', 'false');
  });
});
