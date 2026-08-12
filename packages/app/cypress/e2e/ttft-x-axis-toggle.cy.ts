import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';

// This spec exercises the agentic x-axis modes, which only exist when the
// selected model resolves to the Agentic Traces scenario. The default e2e
// fixtures (cypress/fixtures/api/*.json) have NO agentic rows for any model, and
// the app default scenario is 8K/1K, so bare /inference always resolves to a
// fixed-seq scenario. We therefore inject agentic availability + benchmark rows
// for the default model VIA SPEC-SCOPED INTERCEPTS (not the shared fixtures) and
// visit with an explicit ?i_seq=agentic-traces so this test — and only this
// test — sees the agentic view.
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

// Availability: default model has BOTH agentic and fixed-seq. The agentic view
// is selected explicitly via ?i_seq=agentic-traces (the app default is 8K/1K).
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
    // Keep both visual variants in the fixture: the middle point gets the
    // dashed offload halo while the others remain plain.
    offload_mode: conc === 64 ? 'on' : 'off',
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

/**
 * On agentic charts, Interactivity / E2E Latency / TTFT live inside the
 * "Advanced" menu rather than as top-level tabs, so they must be revealed
 * before they can be clicked. The menu closes on select, so the post-select
 * assertion targets the trigger, which carries the active state and the
 * selected metric's label.
 */
function selectAdvancedXAxisMode(mode: 'interactivity' | 'e2e' | 'ttft', label: string) {
  cy.get('[data-testid="x-axis-mode-advanced"]').click();
  cy.get(`[data-testid="x-axis-mode-${mode}"]`).click();
  cy.get('[data-testid="x-axis-mode-advanced"]')
    .should('have.attr', 'data-state', 'active')
    .and('contain.text', label);
}

describe('X-Axis Mode Toggle (inference chart)', () => {
  before(() => {
    interceptAgenticData();
    // The agentic default mode is E2E Normalized Interactivity, which fetches derived metrics
    // on first render — stub them before the visit.
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="x-axis-mode-buttons"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('shows E2E Normalized Interactivity by default for the agentic view, as the leftmost option', () => {
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    // The three per-request latency modes are nested under Advanced on agentic.
    cy.get('[data-testid="x-axis-mode-ttft"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-interactivity"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-advanced"]')
      .should('be.visible')
      .and('have.attr', 'data-state', 'inactive');
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]')
      .should('be.visible')
      .and('have.attr', 'aria-selected', 'true');
    // E2E Normalized Interactivity leads the mode list for agentic.
    cy.get('[data-testid="x-axis-mode-buttons"] [role="tab"]')
      .first()
      .should('have.attr', 'data-testid', 'x-axis-mode-e2e-normalized-interactivity');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 E2E Normalized Interactivity',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 E2E Normalized Interactivity (tok/s/user)',
    );
  });

  it('switches to Interactivity and updates the heading', () => {
    selectAdvancedXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
  });

  it('explains the offload halo in the legend and distinguishes it from plain points', () => {
    cy.get('#chart-0 [data-testid="offload-halo-key"]')
      .should('be.visible')
      .and('contain.text', 'KV offload ON');
    cy.get('#chart-0 .offload-halo').should('have.length.at.least', 1);
    cy.get('#chart-0 .dot-group').then(($points) => {
      cy.get('#chart-0 .offload-halo').should(($halos) => {
        expect($halos.length).to.be.lessThan($points.length);
      });
    });
  });

  it('keeps the offload halo explanation in the PNG export clone', () => {
    cy.window().then((win) => {
      const exportContainer = win.document.querySelector('#chart-0-export');
      expect(exportContainer).not.to.equal(null);
      const state = { seen: false };
      const observer = new win.MutationObserver(() => {
        if (exportContainer?.querySelector('[data-testid="offload-halo-key"]')) {
          state.seen = true;
          observer.disconnect();
        }
      });
      observer.observe(exportContainer!, { childList: true, subtree: true });
      (win as typeof win & { __offloadHaloExportState: typeof state }).__offloadHaloExportState =
        state;
    });

    cy.get('[data-testid="chart-figure"]').first().find('[data-testid="export-button"]').click();
    cy.get('[data-testid="export-png-button"]').click();
    cy.window().its('__offloadHaloExportState.seen').should('eq', true);
  });

  it('shows the selected percentile in the Interactivity axis label', () => {
    // Explicitly select the mode — do not rely on the agentic default mode.
    selectAdvancedXAxisMode('interactivity', 'Interactivity');
    // Agentic plots percentile fields (p90_intvty), so the axis label carries it.
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
  });

  it('defaults to parallelism labels without line labels for the agentic view', () => {
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('honors explicit label URL overrides for the agentic view', () => {
    interceptAgenticData();
    // Fresh page load → fresh React Query cache → the default E2E Normalized Interactivity
    // mode refetches derived metrics.
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces&i_label=0&i_advlabel=0&i_linelabel=1', {
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
    selectAdvancedXAxisMode('ttft', 'TTFT');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('switches the x-axis to E2E Latency and updates the heading', () => {
    selectAdvancedXAxisMode('e2e', 'E2E Latency');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'End-to-end Latency');
    cy.get('[data-testid="chart-figure"] svg').should('contain.text', 'P90 End-to-end Latency (s)');
  });

  it('switches back to request-level E2E Normalized Interactivity', () => {
    // No cy.wait here: the derived metrics were fetched (and stubbed) on the
    // initial default-mode load and are still fresh in the React Query cache
    // (staleTime 5 min), so re-entering the mode fires no new request.
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').click();
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 E2E Normalized Interactivity',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 E2E Normalized Interactivity (tok/s/user)',
    );

    cy.get('[data-testid="percentile-selector"]').click();
    cy.contains('[role="option"]', 'p75').click();
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P75 E2E Normalized Interactivity',
    );

    // The percentile selector is shared page state for the whole suite —
    // restore the p90 default so later tests assert against a known value.
    cy.get('[data-testid="percentile-selector"]').click();
    cy.contains('[role="option"]', 'p90').click();
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 E2E Normalized Interactivity',
    );
  });

  // Documents the intended pairing of the Advanced menu with manual tab
  // activation: focus may move to the lone remaining tab without the x-axis
  // snapping back to it. The load-bearing guard for manual activation is the
  // 8K/1K test below, where focus-activation is directly observable; this one
  // states the agentic-side expectation.
  it('keeps the Advanced selection when the remaining tab is focused', () => {
    selectAdvancedXAxisMode('ttft', 'TTFT');

    // Let the popover finish closing first: Radix restores focus to its own
    // trigger on close, which would otherwise win the race against the focus
    // below and mask the revert this test is guarding against.
    cy.get('[data-testid="x-axis-mode-advanced-menu"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-advanced"]').should('have.focus');

    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').focus();
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should('have.focus');

    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'false',
    );
    cy.get('[data-testid="x-axis-mode-advanced"]')
      .should('have.attr', 'data-state', 'active')
      .and('contain.text', 'TTFT');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('switches back to Interactivity', () => {
    selectAdvancedXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
  });

  it('follows the percentile selector in the Interactivity axis label', () => {
    // Select p75 here rather than inheriting it from another test — the axis
    // label must track the selector on its own.
    selectAdvancedXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="percentile-selector"]').click();
    cy.contains('[role="option"]', 'p75').click();
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P75 Interactivity (tok/s/user)',
    );
  });
});

describe('X-axis mode URL param', () => {
  // Regression: the reconcile effect used to run before availability resolved
  // the sequence. It recorded the fixed-seq placeholder kind, then treated the
  // switch to agentic as a user-driven kind change and clobbered the
  // URL-restored mode with the agentic default (E2E Normalized Interactivity).
  it('keeps a URL-restored mode through the agentic sequence resolving', () => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces&i_xmode=interactivity', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    cy.get('[data-testid="x-axis-mode-advanced"]')
      .should('have.attr', 'data-state', 'active')
      .and('contain.text', 'Interactivity');
    // Assert on the rendered chart too: the clobber happened one tick after
    // the buttons first painted, so a button-only check could pass too early.
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'false',
    );
  });

  // AgentX publishes on P90, so the percentile control is insider-only. With
  // the gate locked it must not render, and the chart must still plot P90.
  it('hides the percentile selector behind the feature gate and defaults to P90', () => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });

    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    cy.get('[data-testid="percentile-selector"]').should('not.exist');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'P90');
  });
});

describe('Default scenario', () => {
  it('bare /inference defaults to 8K / 1K even when the model has agentic data', () => {
    // Availability contains BOTH agentic and fixed-seq rows for the default
    // model; the default selection must still resolve to 8K/1K, not agentic.
    interceptFixedSequenceData();
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    // Fixed-seq plots the mean field — no percentile prefix on the axis label.
    cy.get('[data-testid="chart-figure"] svg').should('contain.text', 'Interactivity (tok/s/user)');
    cy.get('[data-testid="chart-figure"] svg').should('not.contain.text', 'P90 Interactivity');
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

  // Radix Tabs activates on focus by default, which would switch the x-axis
  // (and redraw the chart) just from tabbing through the strip. The Tabs root
  // sets activationMode="manual" to prevent that. Pins the intended behavior;
  // note that focus-activation proved timing-dependent to reproduce, so treat
  // this as a behavioral assertion rather than a proven pre-fix reproduction.
  it('does not switch the x-axis merely by focusing another tab', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="x-axis-mode-ttft"]').click();
    cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');

    cy.get('[data-testid="x-axis-mode-interactivity"]').focus();
    cy.get('[data-testid="x-axis-mode-interactivity"]').should('have.focus');

    // Focus moved, selection did not.
    cy.get('[data-testid="x-axis-mode-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'false',
    );
    cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
  });

  // Only agentic nests the latency modes: E2E Normalized Interactivity is
  // agentic-only, so collapsing them here would leave an empty tab strip.
  it('keeps the flat x-axis strip with no Advanced menu', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="x-axis-mode-buttons"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-interactivity"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-ttft"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-advanced"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-buttons"] [role="tab"]').should('have.length', 3);
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
  offload_mode: 'on',
  benchmark_type: 'agentic_traces',
  image: 'vllm/vllm-openai:v0.9.0',
  metrics: agenticMetrics(32),
  workers: null,
  date: AGENTIC_DATE,
  run_url: OVERLAY_RUN_URL,
};

const interceptAgenticDataWithOverlay = () => {
  cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as('availability');
  // The official path has no halo in this suite, so the legend key below can
  // only be activated by the offloaded unofficial-run point.
  cy.intercept('GET', '/api/v1/benchmarks*', {
    body: agenticBenchmarks.map((row) => ({ ...row, offload_mode: 'off' })),
  }).as('benchmarks');
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
    // Default agentic mode is E2E Normalized Interactivity → derived metrics fetch on mount.
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces`, {
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
    // Explicitly select Interactivity — do not rely on the agentic default mode.
    selectAdvancedXAxisMode('interactivity', 'Interactivity');
    // The unofficial-run pattern watermark appears when isUnofficialRun is true.
    cy.get('[data-testid="inference-chart-display"] svg pattern[id^="unofficial-pattern-"]').should(
      'exist',
    );
    // Overlay shares the chartDefinition label — the percentile prefix applies here too.
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
    cy.get('#chart-0 [data-testid="offload-halo-key"]')
      .should('be.visible')
      .and('contain.text', 'KV offload ON');
  });

  it('switches to ttft x-axis mode and renders SVG with overlay points', () => {
    selectAdvancedXAxisMode('ttft', 'TTFT');
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

  it('e2e-normalized-interactivity mode shows suppression banner for unofficial-run overlays', () => {
    // Derived metrics are cached from the initial default-mode load.
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').click();
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    // The suppression message appears because isUnofficialRun is true and the
    // mode is 'e2e-normalized-interactivity' (documented in ChartDisplay.tsx).
    cy.contains(
      'E2E Normalized Interactivity requires persisted per-request traces, so unofficial-run overlays are unavailable for this experimental view.',
    ).should('be.visible');
  });
});
