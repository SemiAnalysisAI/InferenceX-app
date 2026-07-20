/**
 * Overlay (unofficial run) points must respect the "Optimal Only" toggle the
 * same way official points do.
 *
 * Regression: with Optimal Only ON, official non-pareto points are hidden via
 * `isPointVisible`, but overlay X markers rendered every point unconditionally.
 * On the agentic interactivity chart this made an e2e-dominated config (TP8
 * C=4 in the GLM5.2 B300 hicache run) look like a pareto point: its X marker
 * stayed visible sitting on the dashed roofline (the monotone spline between
 * C=8 and C=2 passes within ~0.5% of it) while the official twin was hidden.
 *
 * Fixture values are the real run-29682242847 numbers:
 *   conc, p90_intvty, tput_per_gpu, p90_e2el
 * C=4 is dominated on e2e by C=8 (12874 tok/s @ 33.1s vs 9415 @ 48.0s), so
 * with Optimal Only ON exactly 4 of the 5 overlay X's must stay visible.
 */
import { unlockAgenticGate } from '../support/e2e';

const DEFAULT_MODEL_DB_KEY = 'dsv4';
const AGENTIC_DATE = '2026-07-19';
const OVERLAY_RUN_ID = '29682242847';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

const REAL_CONFIGS: [number, number, number, number][] = [
  [48, 10.6, 17199, 126.9],
  [8, 68.5, 12874, 33.1],
  [4, 88.3, 9415, 48], // e2e-dominated by C=8 → NOT optimal
  [2, 111.1, 5018, 30],
  [1, 130.2, 2600, 25.8],
];

const metricsFor = (intvty: number, tput: number, e2el: number): Record<string, number> => ({
  median_itl: 1 / (intvty * 1.2),
  p90_itl: 1 / intvty,
  p99_itl: 1 / (intvty * 0.8),
  median_e2el: e2el * 0.8,
  p90_e2el: e2el,
  p99_e2el: e2el * 1.3,
  median_ttft: 0.5,
  p90_ttft: 1,
  p99_ttft: 2,
  tput_per_gpu: tput,
  output_tput_per_gpu: tput * 0.3,
  input_tput_per_gpu: tput * 0.7,
});

let idCursor = 900000;
const b300Rows = (runUrl: string | null) =>
  REAL_CONFIGS.map(([conc, intvty, tput, e2el]) => ({
    id: runUrl ? 0 : idCursor++,
    hardware: 'b300',
    framework: 'sglang',
    model: DEFAULT_MODEL_DB_KEY,
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'on',
    benchmark_type: 'agentic_traces',
    image: 'sglang:test',
    metrics: metricsFor(intvty, tput, e2el),
    workers: null,
    date: AGENTIC_DATE,
    run_url: runUrl,
  }));

const availability = [
  {
    model: DEFAULT_MODEL_DB_KEY,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: 'b300',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  },
];

const countVisible = ($els: JQuery<HTMLElement>): number =>
  [...$els].filter((el) => getComputedStyle(el).opacity !== '0').length;

describe('Overlay points respect Optimal Only (agentic interactivity)', () => {
  before(() => {
    cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
    cy.intercept('GET', '/api/v1/benchmarks*', { body: b300Rows(null) }).as('benchmarks');
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: OVERLAY_RUN_ID,
            name: 'add-glm5.2-b300-agentic-hicache',
            branch: 'add-glm5.2-b300-agentic-hicache',
            sha: 'abc000',
            createdAt: `${AGENTIC_DATE}T00:00:00Z`,
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: b300Rows(OVERLAY_RUN_URL),
        evaluations: [],
      },
    }).as('unofficialRun');
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="x-axis-mode-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length',
      REAL_CONFIGS.length,
    );
  });

  // Optimal Only defaults ON (i_optimal !== '0') — the DEFAULT view is where
  // the regression lived: official C=4 hidden, overlay C=4 X still drawn.
  it('hides the e2e-dominated overlay point in the default Optimal Only view', () => {
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    // Official parity check: 4 of 5 official dots visible.
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').then(($dots) => {
      expect(countVisible($dots), 'visible official points').to.eq(REAL_CONFIGS.length - 1);
    });
    // The overlay must hide its C=4 too — 4 of 5 X markers visible.
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').then(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length - 1);
    });
  });

  it('shows all overlay points when Optimal Only is turned off', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').then(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length);
    });
  });

  it('re-hides the e2e-dominated overlay point when Optimal Only is re-enabled', () => {
    cy.get('#scatter-hide-non-optimal').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').then(($pts) => {
      expect(countVisible($pts), 'visible overlay X markers').to.eq(REAL_CONFIGS.length - 1);
    });
  });
});
