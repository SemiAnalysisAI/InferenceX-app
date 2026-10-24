import {
  interceptDerivedAgenticMetrics,
  unlockAgenticGate,
  openXAxisMenu,
  selectXAxisMode,
} from '../support/e2e';
import { agenticMetrics, measuredPowerMetrics } from '../support/agentic-fixtures';
import { expandLegendAdvanced } from '../support/legend-advanced';

const DEFAULT_MODEL_DB_KEY = 'dsv4';
const AGENTIC_DATE = '2026-06-12';

const agenticGpus = [
  { hardware: 'b200', framework: 'vllm', disagg: false },
  { hardware: 'b300', framework: 'vllm', disagg: false },
];

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

const OTHER_MODEL_DB_KEY = 'dsr1';
const otherModelAvailability = agenticAvailability.map((row) => ({
  ...row,
  model: OTHER_MODEL_DB_KEY,
}));
const otherModelBenchmarks = agenticBenchmarks.map((row, index) => ({
  ...row,
  id: 920000 + index,
  model: OTHER_MODEL_DB_KEY,
}));

const interceptFixedSequenceData = () => {
  cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: fixedSequenceBenchmarks }).as('benchmarks');
};

describe('X-Axis Mode Toggle (inference chart)', () => {
  before(() => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="x-axis-mode-selector"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  beforeEach(() => {
    interceptDerivedAgenticMetrics();
  });

  it('defaults to Interactivity and offers every full name in one axis dropdown', () => {
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    cy.get('[data-testid="x-axis-mode-selector"]').should('contain.text', 'Interactivity');
    cy.get('[data-testid="x-axis-mode-buttons"]').should('not.exist');
    openXAxisMenu();
    cy.get('[role="grid"] [data-select-option]').should('have.length', 4);
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]')
      .should('have.text', 'E2E Normalized Interactivity')
      .and('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid="x-axis-mode-interactivity"]')
      .should('have.attr', 'aria-pressed', 'true')
      .click();
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );

    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
  });

  it('explains normalized interactivity inside its option without changing the axis', () => {
    openXAxisMenu();
    cy.get('[data-testid="option-help-e2e-normalized-interactivity"]').click();
    cy.get('[role="dialog"] [data-testid="normalized-interactivity-faq-link"]')
      .should('be.visible')
      .and('have.attr', 'href', '/about#faq-normalized-interactivity')
      .and('have.text', 'What does E2E Normalized Interactivity mean?');
    cy.get('[data-testid="option-help-content-e2e-normalized-interactivity"]')
      .should('contain.text', 'output tokens divided by end-to-end latency')
      .type('{esc}');
    cy.get('[data-testid="x-axis-mode-selector"]').should(
      'have.attr',
      'data-value',
      'interactivity',
    );
    cy.get('[data-testid="option-help-e2e-normalized-interactivity"]').type('{esc}');
    cy.get('#chart-0 [data-testid="normalized-interactivity-faq-link"]').should('not.exist');
  });

  it('explains the offload halo in the info footer and distinguishes it from plain points', () => {
    cy.get('[data-testid="chart-notices-chart-0"] [data-testid="offload-halo-key"]')
      .should('be.visible')
      .and('contain.text', 'KV offload ON');
    cy.get('#chart-0 .offload-halo').should('have.length.at.least', 1);
    cy.get('#chart-0 .dot-group').then(($points) => {
      cy.get('#chart-0 .offload-halo').should(($halos) => {
        expect($halos.length).to.be.lessThan($points.length);
      });
    });

    cy.get('[data-testid="chart-notices-chart-0"] [data-testid="offload-halo-key"]').should(
      'be.visible',
    );
    cy.get('#chart-0 [data-testid="offload-halo-key"]').should('not.exist');
  });

  it('shows the fixed p90 percentile in the Interactivity axis label', () => {
    selectXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
  });

  it('honors explicit label URL overrides for the agentic view', () => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces&i_label=0&i_advlabel=0&i_linelabel=0', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    cy.get('[data-testid="legend-advanced-toggle"]').first().click({ scrollBehavior: 'center' });
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('switches the x-axis to E2E Latency and updates the heading', () => {
    selectXAxisMode('e2e', 'E2E Latency');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'End-to-end Latency');
    cy.get('[data-testid="chart-figure"] svg').should('contain.text', 'P90 End-to-end Latency (s)');
  });

  it('switches back to request-level E2E Normalized Interactivity', () => {
    selectXAxisMode('e2e-normalized-interactivity');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 E2E Normalized Interactivity',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 E2E Normalized Interactivity (tok/s/user)',
    );
  });

  it('does not change the chart while browsing options, and Escape cancels', () => {
    selectXAxisMode('ttft', 'TTFT');
    openXAxisMenu();
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').focus();
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').type('{esc}');
    cy.get('[data-testid="x-axis-mode-selector"]')
      .should('have.attr', 'data-value', 'ttft')
      .and('have.focus');
  });

  it('keeps the agentic Latency Percentile control removed and labels the fixed p90 basis', () => {
    selectXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
    cy.get('[data-testid="percentile-selector"]').should('not.exist');
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
  });
});

describe('X-axis mode URL param', () => {
  it('keeps a URL-restored mode through the agentic sequence resolving', () => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces&i_xmode=ttft', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    cy.get('[data-testid="x-axis-mode-selector"]')
      .should('have.attr', 'data-value', 'ttft')
      .and('contain.text', 'TTFT');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('never shows the latency percentile selector and labels the fixed P90 basis', () => {
    interceptAgenticData();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });

    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    cy.get('[data-testid="percentile-selector"]').should('not.exist');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'P90');
  });
});

describe('Default scenario', () => {
  for (const width of [1280, 375]) {
    it(`keeps the labeled scenario field discoverable at ${width}px and recovers from empty data`, () => {
      interceptAgenticData();
      interceptDerivedAgenticMetrics();
      cy.visit('/inference', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        },
      });
      cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
      cy.get('[data-testid="selected-option-help-agentic-traces"]').should('exist');
      cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
      cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'P90');

      cy.viewport(width, 800);
      interceptAgenticData();
      interceptDerivedAgenticMetrics();
      cy.visit('/inference');
      cy.get('fieldset [data-testid="scenario-selector"]')
        .should('be.visible')
        .and('contain.text', 'Agentic');
      cy.get('label[for="scenario-select"]').should('be.visible').and('contain.text', 'Scenario');
      cy.get('h2 [data-testid="scenario-selector"]').should('not.exist');
      cy.get('fieldset [data-testid="scenario-selector"]').click('right', {
        scrollBehavior: 'center',
      });
      cy.contains('[data-select-option]', '8K / 1K').click();
      cy.contains('No measurements to plot for this selection.').should('be.visible');
      cy.get('fieldset [data-testid="scenario-selector"]')
        .should('contain.text', '8K / 1K')
        .click('right', { scrollBehavior: 'center' });
      cy.contains('[data-select-option]', 'Agentic').click();
      cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Agentic');
      cy.get('fieldset [data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    });
  }

  it('keeps 8K / 1K when the link asks for it explicitly', () => {
    interceptAgenticData();
    cy.visit('/zh/inference');
    cy.get('label[for="scenario-select"]').should('be.visible').and('have.text', '场景');
    cy.get('fieldset [data-testid="scenario-selector"]').should('be.visible');
    cy.get('h2 [data-testid="scenario-selector"]').should('not.exist');

    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    cy.get('[data-testid="selected-option-help-agentic-traces"]').should('not.exist');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="chart-figure"] svg').should('contain.text', 'Interactivity (tok/s/user)');
    cy.get('[data-testid="chart-figure"] svg').should('not.contain.text', 'P90 Interactivity');

    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
  });

  it('opens the Agentic scenario for another model with corresponding data', () => {
    cy.intercept('GET', '/api/v1/availability', { body: otherModelAvailability }).as(
      'availability',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: otherModelBenchmarks }).as('benchmarks');
    cy.visit('/inference?g_model=DeepSeek-R1-0528', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
    cy.get('[data-testid="selected-option-help-agentic-traces"]').should('exist');
  });
});

describe('Label defaults for fixed-sequence scenarios', () => {
  it('keeps the fixed-sequence chart unchanged while keyboard-browsing other options', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k');
    selectXAxisMode('ttft', 'TTFT');
    openXAxisMenu();
    cy.get('[data-testid="x-axis-mode-interactivity"]').focus().type('{esc}');
    cy.get('[data-testid="x-axis-mode-selector"]').should('have.attr', 'data-value', 'ttft');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('offers only the three supported axes for fixed sequences', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k');
    openXAxisMenu();
    cy.get('[role="grid"] [data-select-option]').should('have.length', 3);
    cy.get('[data-testid="x-axis-mode-interactivity"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-ttft"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-e2e-normalized-interactivity"]').should('not.exist');
    cy.get('[data-testid="x-axis-mode-interactivity"]').type('{esc}');
  });

  it('honors explicit label URL overrides', () => {
    interceptFixedSequenceData();
    cy.visit('/inference?i_seq=8k%2F1k&i_label=1&i_advlabel=1&i_linelabel=0', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
    expandLegendAdvanced();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-point-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });
});

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

const expectCoordinates = (selector: string, expected: number[]) => {
  cy.get<SVGGElement & { __data__: { x: number } }>(`#chart-0 ${selector}`).should(($points) => {
    expect($points.length).to.equal(expected.length);
    expect(Array.from($points, (point) => point.__data__.x).sort((a, b) => a - b)).to.deep.equal(
      [...expected].sort((a, b) => a - b),
    );
    const renderedXs = Array.from($points, (point) => {
      const transform = point.getAttribute('transform');
      return Number(transform?.match(/translate\((?<x>[^,]+),/u)?.groups?.x);
    });
    expect(renderedXs.every(Number.isFinite), 'finite rendered coordinates').to.equal(true);
    expect(new Set(renderedXs).size, 'points spread across x-axis').to.equal(expected.length);
  });
};
const expectInteractivity = () => {
  cy.get('#chart-0 .x-axis-label').should('have.text', 'Median Interactivity (tok/s/user)');
  cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'vs. Median Interactivity');
  expectCoordinates('.dot-group', [80, 40, 20]);
  expectCoordinates('.unofficial-overlay-pt', [60, 30]);
};

describe('Measured prefill metrics preserve the selected x-axis', () => {
  it('keeps real interactivity and median TTFT coordinates for official and overlay points', () => {
    const powerRows = fixedSequenceBenchmarks.slice(0, 3).map((row, index) => ({
      ...row,
      framework: 'dynamo-sglang',
      disagg: true,
      metrics: {
        ...measuredPowerMetrics(row.conc, { disagg: true }),
        median_intvty: [80, 40, 20][index],
        median_ttft: [0.5, 2, 8][index],
        prefill_avg_power_w: 600 + index * 50,
      },
    }));
    const overlayRows = powerRows.slice(0, 2).map((row, index) => ({
      ...row,
      id: 930000 + index,
      run_url: OVERLAY_RUN_URL,
      metrics: {
        ...row.metrics,
        median_intvty: [60, 30][index],
        median_ttft: [1, 4][index],
      },
    }));
    cy.intercept('GET', '/api/v1/availability', {
      body: [{ ...agenticAvailability[2], framework: 'dynamo-sglang', disagg: true }],
    });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: powerRows });
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: OVERLAY_RUN_ID,
            url: OVERLAY_RUN_URL,
            name: 'Prefill axis regression',
            branch: 'test/prefill-axis',
            sha: 'abc000',
            createdAt: `${AGENTIC_DATE}T00:00:00Z`,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: overlayRows,
        evaluations: [],
      },
    }).as('prefillOverlay');
    cy.visit(
      `/powerx?g_model=DeepSeek-V4-Pro&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_measuredPrefillAvgPower&i_xmode=interactivity&i_best=0&i_optimal=0&i_active=b200_dynamo-sglang&unofficialrun=${OVERLAY_RUN_ID}`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        },
      },
    );
    cy.wait('@prefillOverlay');

    expectInteractivity();
    cy.get('[data-testid="powerx-tab-energy"]').click();
    cy.contains('[data-testid="powerx-energy-per"] button', 'Input token').click();
    cy.get('[data-testid="measured-energy-scope"]').click();
    cy.get('[role="option"][data-value="prefill"]').click();
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Prefill Joules per Input Token',
    );
    expectInteractivity();

    selectXAxisMode('ttft', 'TTFT');
    cy.get('#chart-0 .x-axis-label').should('have.text', 'Median Time To First Token (s)');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'vs. Median Time To First Token',
    );
    expectCoordinates('.dot-group', [0.5, 2, 8]);
    expectCoordinates('.unofficial-overlay-pt', [1, 4]);

    selectXAxisMode('interactivity', 'Interactivity');
    expectInteractivity();

    cy.intercept('GET', '/api/v1/benchmarks*', { body: [] }).as('emptyOfficialBenchmarks');
    cy.location('href').then((href) => {
      const url = new URL(href);
      url.searchParams.set('i_xmode', 'ttft');
      url.searchParams.set('i_metric', 'y_measuredPrefillJPerInputToken');
      cy.visit(url.toString());
    });
    cy.wait(['@emptyOfficialBenchmarks', '@prefillOverlay']);
    cy.get('#chart-0 .x-axis-label').should('have.text', 'Median Time To First Token (s)');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'vs. Median Time To First Token',
    );
    cy.get('#chart-0 .dot-group').should('not.exist');
    expectCoordinates('.unofficial-overlay-pt', [1, 4]);
  });
});

describe('X-Axis Mode Toggle — overlay path (finding #8 regression guard)', () => {
  before(() => {
    interceptAgenticDataWithOverlay();
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="x-axis-mode-selector"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  beforeEach(() => {
    interceptDerivedAgenticMetrics();
  });

  it('shows overlay (unofficial-run) watermark SVG when an overlay is loaded', () => {
    selectXAxisMode('interactivity', 'Interactivity');
    cy.get('[data-testid="inference-chart-display"] svg pattern[id^="unofficial-pattern-"]').should(
      'exist',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Interactivity (tok/s/user)',
    );
    cy.get('[data-testid="chart-notices-chart-0"] [data-testid="offload-halo-key"]')
      .should('be.visible')
      .and('contain.text', 'KV offload ON');
  });

  it('e2e-normalized-interactivity mode shows suppression banner for unofficial-run overlays', () => {
    selectXAxisMode('e2e-normalized-interactivity');
    cy.contains(
      'E2E Normalized Interactivity requires persisted per-request traces, so unofficial-run overlays are unavailable for this experimental view.',
    ).should('be.visible');
  });
});
