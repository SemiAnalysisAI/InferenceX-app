import { unlockAgenticGate } from '../support/e2e';

// ---------------------------------------------------------------------------
// Spec-scoped fixture helpers
//
// The shared cypress/fixtures/api/*.json files contain ZERO agentic_traces rows
// (by design — adding them flips the bare /inference default to the agentic
// scenario and regresses other specs). This spec therefore injects minimal
// agentic data via spec-scoped cy.intercept overrides that shadow the fixture
// server, following the same pattern used in ttft-x-axis-toggle.cy.ts.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_DB_KEY = 'dsv4'; // DeepSeek-V4-Pro
const AGENTIC_DATE = '2026-06-12';

// Two GPUs with agentic + single_turn entries so the scenario selector resolves
// to agentic (agentic preferred when both types exist for the same model).
const AGENTIC_HARDWARE = [
  { hardware: 'b200', framework: 'vllm', disagg: false },
  { hardware: 'b300', framework: 'vllm', disagg: false },
];

const agenticAvailability = [
  // Agentic rows (isl/osl null).
  ...AGENTIC_HARDWARE.map((g) => ({
    model: DEFAULT_MODEL_DB_KEY,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  })),
  // Single-turn rows alongside — without these the scenario selector may not
  // see the "both exist" signal it needs to confidently pick agentic.
  ...AGENTIC_HARDWARE.map((g) => ({
    model: DEFAULT_MODEL_DB_KEY,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'single_turn',
    date: AGENTIC_DATE,
  })),
];

// Minimal per-metric percentile ladder matching what the chart expects for
// agentic rows (median/p75/p90/p95/p99 + std for each family).
const percentileLadder = (prefix: string, base: number): Record<string, number> => ({
  [`median_${prefix}`]: base,
  [`p75_${prefix}`]: base * 1.2,
  [`p90_${prefix}`]: base * 1.5,
  [`p95_${prefix}`]: base * 1.7,
  [`p99_${prefix}`]: base * 2.2,
  [`std_${prefix}`]: base * 0.3,
});

const agenticMetrics = (conc: number): Record<string, number> => {
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
    total_tput_tps: 7600 * conc * 0.05,
  };
};

// IDs must be unique numbers — the GPU graph uses them as D3 data keys and
// trace-availability is keyed on them.
let benchIdCursor = 800100;
const agenticBenchmarks = AGENTIC_HARDWARE.flatMap((g) =>
  [16, 64, 128].map((conc) => ({
    id: benchIdCursor++,
    hardware: g.hardware,
    framework: g.framework,
    model: DEFAULT_MODEL_DB_KEY,
    precision: 'fp4',
    spec_method: 'none',
    disagg: g.disagg,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'off',
    benchmark_type: 'agentic_traces',
    image: 'vllm/vllm-openai:v0.9.0',
    metrics: agenticMetrics(conc),
    workers: null,
    date: AGENTIC_DATE,
    run_url: null,
  })),
);

// All injected IDs with a stored trace blob — the GPU graph renders the
// "View charts" link only when trace-availability returns true for the id.
const agenticIds = new Set(agenticBenchmarks.map((b) => b.id));

describe('GPU comparison agentic point detail', () => {
  it('exposes the per-point charts as a normal browser link', () => {
    // Shadow the fixture-server availability + benchmarks responses with
    // spec-scoped agentic data so the GPU graph renders agentic dots.
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as(
      'agenticAvailability',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('agenticBenchmarks');
    // Return true for all injected ids so the "View charts" link appears.
    cy.intercept('GET', '/api/v1/trace-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
      if (ids.length < 20) request.alias = 'gpuTraceAvailability';
      const result = Object.fromEntries(
        ids.filter((id) => agenticIds.has(Number(id))).map((id) => [id, true]),
      );
      request.reply({ body: result });
    });

    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });

    cy.get('[data-testid="gpu-multiselect"] [role="combobox"]').click({ force: true });
    cy.get('[role="option"]').first().click();
    cy.contains('button', 'Select date range').click();
    cy.get('body').then(($body) => {
      if ($body.text().includes('View anyway')) {
        cy.contains('button', 'View anyway').click();
      } else {
        cy.contains('button', 'Max Range').click();
        cy.contains('button', 'Apply').click();
      }
    });

    cy.get('[data-testid="gpu-graph"]').first().should('be.visible');
    cy.wait('@gpuTraceAvailability');
    cy.wait(100);
    cy.get('[data-testid="gpu-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0)
      .first()
      .then(($point) => {
        const point = $point[0] as unknown as SVGElement & {
          __data__: { benchmark_type?: string; id?: number };
        };
        expect(point.__data__.benchmark_type).to.equal('agentic_traces');
        expect(point.__data__.id).to.be.a('number');
        cy.wrap($point).find('.visible-shape').click({ force: true });
      });

    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]')
      .should('be.visible')
      .then(($link) => {
        expect($link).to.match('a');
        expect($link).not.to.have.attr('target');
        expect($link.attr('href')).to.match(/^\/inference\/agentic\/\d+$/u);
      });
    cy.location('pathname').should('eq', '/inference');
  });
});
