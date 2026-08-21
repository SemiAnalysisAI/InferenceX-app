import { interceptDerivedAgenticMetrics } from '../support/e2e';

// ---------------------------------------------------------------------------
// Regression: returning from an agentic point-detail page reset the chart.
//
// Chart filters only ever reach an in-memory store — `url-state.ts` strips the
// share params from the address bar after load — and the point-detail links are
// plain `<a href>` (they must support open-in-new-tab), so following one is a
// full-document navigation that destroys that store. Back therefore returned to
// a bare `/inference` and the chart rebuilt from defaults: DeepSeek V4 Pro with
// every legend series on, no matter what the reader had been looking at.
//
// The shared fixtures carry ZERO agentic_traces rows, so this spec injects its
// own agentic coverage (same pattern as gpu-compare-agentic-detail.cy.ts).
// ---------------------------------------------------------------------------

const AGENTIC_DATE = '2026-06-12';
const DEFAULT_MODEL_DB_KEY = 'dsv4'; // DeepSeek-V4-Pro, the dashboard default
const TARGET_MODEL_DB_KEY = 'kimik3'; // Kimi-K3, the non-default the reader picks
const TARGET_MODEL_LABEL = 'Kimi K3';

const AGENTIC_HARDWARE = [
  { hardware: 'b200', framework: 'vllm' },
  { hardware: 'b300', framework: 'vllm' },
  { hardware: 'h200', framework: 'vllm' },
];

/** The series the reader solos — must differ from the "all on" default. */
const SOLO_HW_KEY = 'b300_vllm';
const SOLO_HW_LABEL = 'B300 (vLLM)';

const availabilityFor = (model: string) => [
  ...AGENTIC_HARDWARE.map((g) => ({
    model,
    isl: null,
    osl: null,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    date: AGENTIC_DATE,
  })),
  // Fixed-seq rows alongside, so the scenario selector sees the "both exist"
  // signal it needs to settle confidently on agentic.
  ...AGENTIC_HARDWARE.map((g) => ({
    model,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: g.hardware,
    framework: g.framework,
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: AGENTIC_DATE,
  })),
];

const availability = [
  ...availabilityFor(DEFAULT_MODEL_DB_KEY),
  ...availabilityFor(TARGET_MODEL_DB_KEY),
];

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

let benchIdCursor = 900100;
const benchmarksFor = (model: string) =>
  AGENTIC_HARDWARE.flatMap((g) =>
    [16, 64, 128].map((conc) => ({
      id: benchIdCursor++,
      hardware: g.hardware,
      framework: g.framework,
      model,
      precision: 'fp4',
      spec_method: 'none',
      disagg: false,
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

const benchmarks = [...benchmarksFor(DEFAULT_MODEL_DB_KEY), ...benchmarksFor(TARGET_MODEL_DB_KEY)];
const tracedIds = new Set(benchmarks.map((b) => b.id));

/** Minimal detail-page payloads — this spec only cares about its nav controls. */
function interceptDetailPage(): void {
  cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
  cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
  cy.intercept('GET', '/api/v1/request-timeline*', { body: null });
  cy.intercept('GET', '/api/v1/benchmark-siblings*', { body: null });
  cy.intercept('GET', '/api/v1/agentic-aggregates*', { body: null });
}

function interceptChart(): void {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: benchmarks }).as('benchmarks');
  cy.intercept('GET', '/api/v1/trace-availability*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
    request.reply({
      body: Object.fromEntries(
        ids.filter((id) => tracedIds.has(Number(id))).map((id) => [id, true]),
      ),
    });
  });
  interceptDerivedAgenticMetrics();
  interceptDetailPage();
}

function visitChart(path: string): void {
  interceptChart();
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.get('[data-testid="inference-chart-display"]').should('exist');
}

/** Pick the non-default model through the dropdown, exactly as the report does. */
function selectTargetModel(): void {
  cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro');
  cy.get('[data-testid="model-selector"]').click();
  cy.contains('[role="option"]', TARGET_MODEL_LABEL).click();
  cy.get('[data-testid="model-selector"]').should('contain.text', TARGET_MODEL_LABEL);
}

/** Solo one legend series so the restored state is distinguishable from "all on". */
function soloLegendSeries(): void {
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').should(
    'have.length.greaterThan',
    1,
  );
  cy.contains('[data-testid="chart-legend"] label', SOLO_HW_LABEL).click();
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').should('have.length', 1);
}

/** Pin the tooltip on a visible point of the soloed series and open its detail page. */
function openPointDetail(): void {
  cy.get(`[data-testid="legend-points-${SOLO_HW_KEY}"]`).should('exist');
  cy.get('[data-testid="inference-chart-display"] svg .dot-group')
    .should('have.length.greaterThan', 0)
    .then(($dots) => {
      const target = [...$dots].find((node) => {
        const datum = (node as unknown as { __data__?: { hwKey?: string; id?: number } }).__data__;
        return datum?.hwKey === SOLO_HW_KEY && tracedIds.has(Number(datum?.id));
      });
      expect(target, `a traced ${SOLO_HW_KEY} point`).to.not.equal(undefined);
      cy.wrap(target).find('.visible-shape').click({ force: true });
    });
  cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]').should('be.visible').click();
}

/**
 * The detail page's two nav controls, addressed by their visible label so this
 * spec fails on the restoration assertion rather than on a missing hook when
 * run against a build without the fix.
 */
const backControl = (locale: 'en' | 'zh') =>
  cy.contains('button', locale === 'zh' ? '返回' : 'Back');
const chartLink = (locale: 'en' | 'zh') =>
  cy.contains('a', locale === 'zh' ? '推理图表' : 'Inference chart');

/** The state the reader left behind, as it must come back. */
function assertRestoredChart(): void {
  cy.get('[data-testid="model-selector"]').should('contain.text', TARGET_MODEL_LABEL);
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked')
    .should('have.length', 1)
    .closest('li')
    .should('contain.text', SOLO_HW_LABEL);
}

describe('Agentic point detail — returning to the chart', () => {
  it('carries the chart state into the detail link instead of dropping it', () => {
    visitChart('/inference');
    selectTargetModel();
    soloLegendSeries();

    cy.get('[data-testid="inference-chart-display"] svg .dot-group')
      .should('have.length.greaterThan', 0)
      .then(($dots) => {
        const target = [...$dots].find((node) => {
          const datum = (node as unknown as { __data__?: { hwKey?: string; id?: number } })
            .__data__;
          return datum?.hwKey === SOLO_HW_KEY && tracedIds.has(Number(datum?.id));
        });
        cy.wrap(target).find('.visible-shape').click({ force: true });
      });

    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]')
      .should('be.visible')
      .then(($link) => {
        const href = $link.attr('href') ?? '';
        expect(href, 'detail href').to.match(/^\/inference\/agentic\/\d+\?/u);
        const params = new URLSearchParams(href.slice(href.indexOf('?')));
        expect(params.get('g_model'), 'g_model carried into the detail link').to.equal('Kimi-K3');
        expect(params.get('i_active'), 'legend selection carried').to.equal(SOLO_HW_KEY);
      });
  });

  it('restores the model and legend when the reader clicks Back', () => {
    visitChart('/inference');
    selectTargetModel();
    soloLegendSeries();
    openPointDetail();

    cy.location('pathname').should('match', /^\/inference\/agentic\/\d+$/u);
    backControl('en').click();

    cy.location('pathname').should('eq', '/inference');
    assertRestoredChart();
  });

  it('restores the model and legend through the "Inference chart" link', () => {
    visitChart('/inference');
    selectTargetModel();
    soloLegendSeries();
    openPointDetail();

    chartLink('en')
      .should('have.attr', 'href')
      .and('match', /^\/inference\?/u);
    chartLink('en').click();

    cy.location('pathname').should('eq', '/inference');
    assertRestoredChart();
  });

  it('keeps a Chinese reader on /zh for the whole round trip', () => {
    visitChart('/zh/inference');
    selectTargetModel();
    soloLegendSeries();
    openPointDetail();

    cy.location('pathname').should('match', /^\/zh\/inference\/agentic\/\d+$/u);
    chartLink('zh')
      .should('have.attr', 'href')
      .and('match', /^\/zh\/inference\?/u);
    chartLink('zh').click();

    cy.location('pathname').should('eq', '/zh/inference');
    assertRestoredChart();
  });

  it('does not drop the unofficialruns overlay param on the round trip', () => {
    visitChart('/inference?unofficialruns=987654321');
    selectTargetModel();
    soloLegendSeries();

    cy.get('[data-testid="inference-chart-display"] svg .dot-group')
      .should('have.length.greaterThan', 0)
      .then(($dots) => {
        const target = [...$dots].find((node) => {
          const datum = (node as unknown as { __data__?: { hwKey?: string; id?: number } })
            .__data__;
          return datum?.hwKey === SOLO_HW_KEY && tracedIds.has(Number(datum?.id));
        });
        cy.wrap(target).find('.visible-shape').click({ force: true });
      });

    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]')
      .should('be.visible')
      .then(($link) => {
        const href = $link.attr('href') ?? '';
        const params = new URLSearchParams(href.slice(href.indexOf('?')));
        expect(params.get('unofficialruns'), 'overlay run carried forward').to.equal('987654321');
      });

    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]').click();
    cy.location('search').should('contain', 'unofficialruns=987654321');
    chartLink('en').should('have.attr', 'href').and('contain', 'unofficialruns=987654321');
  });
});
