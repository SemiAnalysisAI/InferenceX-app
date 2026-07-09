import { unlockAgenticGate } from '../support/e2e';

const interceptDerivedMetrics = () => {
  cy.intercept('GET', '/api/v1/derived-agentic-metrics*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    request.reply({
      body: Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            id: Number(id),
            normalized_session_time_s: 60 + index,
            p90_prefill_tps_per_user: 100 + index,
            p75_normalized_e2e_400_s: 8 + index,
            p90_normalized_e2e_400_s: 12 + index,
          },
        ]),
      ),
    });
  }).as('derivedAgenticMetrics');
};

// This spec exercises the agentic x-axis modes, which only exist when the
// selected model resolves to the Agentic Traces scenario. The default e2e
// fixtures (cypress/fixtures/api/*.json) have NO agentic rows for any model, so
// after the availability-gated effectiveSequence fix the bare-/inference default
// correctly resolves to a fixed-seq scenario. We therefore inject agentic
// availability + benchmark rows for the default model VIA SPEC-SCOPED INTERCEPTS
// (not the shared fixtures) so this test — and only this test — sees the agentic
// view. Scoping to intercepts keeps every other spec's default fixed-seq.
const DEFAULT_MODEL_DB_KEY = 'dsv4'; // DeepSeek-V4-Pro is the default model
const AGENTIC_DATE = '2026-06-12';

// Percentile ladder for one metric family (median/p75/p90/p95/p99/std).
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

const agenticGpus = [
  { hardware: 'b200', framework: 'vllm', disagg: false },
  { hardware: 'b300', framework: 'vllm', disagg: false },
];

// Availability: default model has BOTH agentic and fixed-seq, so the default
// resolves to agentic (the product-intended, agentic-preferred behavior).
const agenticAvailability = [
  ...agenticGpus.map((g) => ({
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
  ...agenticGpus.map((g) => ({
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

let benchIdCursor = 900000;
const agenticBenchmarks = agenticGpus.flatMap((g) =>
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
    decode_tp: 8,
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

const fixedSequenceBenchmarks = agenticBenchmarks.map((row, index) => ({
  ...row,
  id: 910000 + index,
  isl: 8192,
  osl: 1024,
  benchmark_type: 'single_turn',
}));

const interceptAgenticData = () => {
  cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: agenticBenchmarks }).as('benchmarks');
};

const interceptFixedSequenceData = () => {
  cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: fixedSequenceBenchmarks }).as('benchmarks');
};

describe('X-Axis Mode Toggle (inference chart)', () => {
  before(() => {
    interceptAgenticData();
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="x-axis-mode-buttons"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('shows Interactivity by default for the agentic view', () => {
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    cy.get('[data-testid="x-axis-mode-ttft"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-interactivity"]')
      .should('be.visible')
      .and('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
  });

  it('defaults to parallelism labels without line labels for the agentic view', () => {
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('honors explicit label URL overrides for the agentic view', () => {
    interceptAgenticData();
    cy.visit('/inference?i_label=0&i_advlabel=0&i_linelabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
  });

  it('switches the x-axis to TTFT and updates the heading', () => {
    cy.get('[data-testid="x-axis-mode-ttft"]').click();
    cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('switches the x-axis to E2E Latency and updates the heading', () => {
    cy.get('[data-testid="x-axis-mode-e2e"]').click();
    cy.get('[data-testid="x-axis-mode-e2e"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'End-to-end Latency');
  });

  it('switches to request-level normalized E2E at 400 output tokens', () => {
    interceptDerivedMetrics();
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').click();
    cy.wait('@derivedAgenticMetrics');
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 Normalized E2E @ 400 output tokens',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Normalized E2E @ 400 output tokens (s)',
    );

    cy.get('[data-testid="percentile-selector"]').click();
    cy.contains('[role="option"]', 'p75').click();
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P75 Normalized E2E @ 400 output tokens',
    );
  });

  it('switches back to Interactivity', () => {
    cy.get('[data-testid="x-axis-mode-interactivity"]').click();
    cy.get('[data-testid="x-axis-mode-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
  });
});

describe('Label defaults for fixed-sequence scenarios', () => {
  it('keeps parallelism labels off and line labels on by default', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
  });

  it('honors explicit label URL overrides', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k&i_label=1&i_advlabel=1&i_linelabel=0', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });
});

// ---------------------------------------------------------------------------
// Overlay path — regression coverage for unofficial-run overlays with agentic
// x-axis modes (finding #8 / AGENTS.md: chart features must have overlay tests).
// The overlay behavior itself is verified correct by prior review; this suite
// guards against regressions only and does NOT change overlay behavior.
// ---------------------------------------------------------------------------

// Build a minimal unofficial-run API response that contains one agentic
// overlay benchmark row so the provider builds overlay chart data.
const OVERLAY_RUN_ID = 99900000001;
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

const overlayBenchmarkRow = {
  id: 800000,
  hardware: 'b200',
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
  isl: null,
  osl: null,
  conc: 32,
  offload_mode: 'off',
  benchmark_type: 'agentic_traces',
  image: 'vllm/vllm-openai:v0.9.0',
  metrics: agenticMetrics(32),
  workers: null,
  date: AGENTIC_DATE,
  run_url: OVERLAY_RUN_URL,
};

const interceptAgenticDataWithOverlay = () => {
  interceptAgenticData();
  cy.intercept('GET', '/api/unofficial-run*', {
    body: {
      runInfos: [
        {
          id: OVERLAY_RUN_ID,
          name: 'Overlay regression fixture',
          branch: 'test/overlay-regression',
          sha: 'abc000',
          createdAt: `${AGENTIC_DATE}T00:00:00Z`,
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      benchmarks: [overlayBenchmarkRow],
      evaluations: [],
    },
  }).as('unofficialRun');
};

describe('X-Axis Mode Toggle — overlay path (finding #8 regression guard)', () => {
  before(() => {
    interceptAgenticDataWithOverlay();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="x-axis-mode-buttons"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('shows overlay (unofficial-run) watermark SVG when an overlay is loaded', () => {
    // The unofficial-run pattern watermark appears when isUnofficialRun is true.
    cy.get('[data-testid="inference-chart-display"] svg pattern[id^="unofficial-pattern-"]').should(
      'exist',
    );
  });

  it('switches to ttft x-axis mode and renders SVG with overlay points', () => {
    cy.get('[data-testid="x-axis-mode-ttft"]').click();
    cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
    // Overlay points render as triangles or circles inside the chart SVG.
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
    cy.get('[data-testid="inference-chart-display"] svg').then(($svgs) => {
      let total = 0;
      $svgs.each((_i, svg) => {
        total += svg.querySelectorAll('circle, polygon, path').length;
      });
      expect(total).to.be.greaterThan(0);
    });
  });

  it('normalized-e2e mode shows suppression banner for unofficial-run overlays', () => {
    interceptDerivedMetrics();
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').click();
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    // The suppression message appears because isUnofficialRun is true and the
    // mode is 'normalized-e2e' (documented in ChartDisplay.tsx ~line 640).
    cy.contains(
      'Normalized E2E requires persisted per-request traces, so unofficial-run overlays are unavailable for this experimental view.',
    ).should('be.visible');
  });
});
