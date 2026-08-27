// AgentX measured power (PLAN-10 / gap G15): the role-local energy axes
// (Measured Prefill/Decode J per token) render for agentic runs, and pinned
// tooltips carry the per-worker power drilldown when the row ships workers[].
//
// The shared cypress/fixtures/api/*.json files contain ZERO agentic rows (by
// design), so this spec injects agentic availability + benchmark rows via
// spec-scoped intercepts, following ttft-x-axis-toggle.cy.ts. Production
// AgentX rows currently ship workers: null (producer emission lands with
// PLAN-09), so the synthetic workers here verify the UI ahead of real data —
// and the workers-less series proves the graceful-absence path.
import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import {
  agenticMetrics,
  measuredPowerMetrics,
  syntheticWorkers,
} from '../support/agentic-fixtures';

const MODEL_DB_KEY = 'dsv4'; // DeepSeek-V4-Pro
const AGENTIC_DATE = '2026-06-12';

// One disaggregated series carrying role energy + workers, one aggregate
// series with whole-run measured metrics only and no workers.
const POWER_GPUS = [
  { hardware: 'b200', framework: 'vllm', disagg: true },
  { hardware: 'b300', framework: 'vllm', disagg: false },
];

const agenticAvailability = POWER_GPUS.flatMap((g) => [
  {
    model: MODEL_DB_KEY,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  },
  {
    model: MODEL_DB_KEY,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: g.disagg,
    benchmark_type: 'single_turn',
    date: AGENTIC_DATE,
  },
]);

let benchIdCursor = 930000;
const agenticBenchmarks = POWER_GPUS.flatMap((g) =>
  [16, 64, 128].map((conc) => ({
    id: benchIdCursor++,
    hardware: g.hardware,
    framework: g.framework,
    model: MODEL_DB_KEY,
    precision: 'fp4',
    spec_method: 'none',
    disagg: g.disagg,
    is_multinode: g.disagg,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: g.disagg ? 1 : 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: g.disagg ? 1 : 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'off',
    benchmark_type: 'agentic_traces',
    image: 'vllm/vllm-openai:v0.9.0',
    metrics: { ...agenticMetrics(conc), ...measuredPowerMetrics(conc, { disagg: g.disagg }) },
    workers: g.disagg ? syntheticWorkers(true) : null,
    date: AGENTIC_DATE,
    run_url: null,
  })),
);

const DISAGG_DOTS = '.dot-group[data-hw-key^="b200"]';
const AGGREGATE_DOTS = '.dot-group[data-hw-key^="b300"]';

describe('AgentX measured power (role energy axes + worker drilldown)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as('availability');
    cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('benchmarks');
    interceptDerivedAgenticMetrics();
    // No stored traces or logs for the synthetic ids: keeps the pinned
    // tooltip free of the "View charts/logs" actions this spec doesn't test.
    cy.intercept('GET', '/api/v1/trace-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
      request.reply({ body: Object.fromEntries(ids.map((id) => [id, false])) });
    });
    cy.intercept('GET', '/api/v1/log-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
      request.reply({ body: Object.fromEntries(ids.map((id) => [id, false])) });
    });
    cy.visit('/inference?i_seq=agentic-traces', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="scatter-graph"] .dot-group').should('have.length.greaterThan', 0);
  });

  it('offers the role-energy axes and coverage-filters series without role energy', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.contains('[data-slot="select-content"]', 'Measured Energy')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[role="option"]', 'Measured Prefill Joules per Input Token')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[role="option"]', 'Measured Decode Joules per Output Token')
      .scrollIntoView()
      .should('be.visible');

    cy.contains('[role="option"]', 'Measured Prefill Joules per Input Token').click();
    cy.get('[data-slot="select-content"]').should('not.exist');

    // Only the disagg series carries prefill_joules_per_input_token; the
    // aggregate series drops off the chart while the legend universe stays
    // intact (selectionPoints reconciliation).
    cy.get(DISAGG_DOTS).should('have.length', 3);
    cy.get(AGGREGATE_DOTS).should('not.exist');
    cy.get('[data-testid="chart-legend"]').should('contain.text', 'B200');
    cy.get('[data-testid="chart-legend"]').should('contain.text', 'B300');
  });

  it('renders the per-worker power table on a pinned agentic tooltip', () => {
    cy.get(`${DISAGG_DOTS} .visible-shape`).first().click({ force: true });

    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get('[data-chart-tooltip]:visible [data-testid="tooltip-worker-power"]')
      .should('exist')
      .and('contain.text', 'prefill[0]')
      .and('contain.text', '612.3 W')
      .and('contain.text', 'decode[0]');
  });

  it('stays graceful when the pinned point has no workers payload', () => {
    cy.get(`${AGGREGATE_DOTS} .visible-shape`).first().click({ force: true });

    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get('[data-testid="tooltip-worker-power"]').should('not.exist');
  });
});
