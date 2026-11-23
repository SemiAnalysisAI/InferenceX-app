import {
  availabilityBody,
  interceptBenchmarkPresence,
  interceptDerivedAgenticMetrics,
} from '../support/e2e';
import { clickScatterPoint } from '../support/scatter-points';

const AGENTIC_DATE = '2026-06-12';
const DEFAULT_MODEL_DB_KEY = 'dsv4';
const DEFAULT_MODEL_LABEL = 'DeepSeek V4 Pro';
const TARGET_MODEL_DB_KEY = 'kimik3';
const TARGET_MODEL_LABEL = 'Kimi K3';

const AGENTIC_HARDWARE = [
  { hardware: 'b200', framework: 'vllm' },
  { hardware: 'b300', framework: 'vllm' },
  { hardware: 'h200', framework: 'vllm' },
];

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

function interceptDetailPage(): void {
  cy.intercept('GET', '/api/v1/trace-server-metrics*', { body: null });
  cy.intercept('GET', '/api/v1/trace-histograms*', { body: {} });
  cy.intercept('GET', '/api/v1/request-timeline*', { body: null });
  cy.intercept('GET', '/api/v1/benchmark-siblings*', { body: null });
  cy.intercept('GET', '/api/v1/agentic-aggregates*', { body: null });
}

function interceptChart(): void {
  cy.intercept('GET', '/api/v1/availability/compact', { body: availabilityBody(availability) }).as(
    'availability',
  );
  // Each model's chart gets only its own rows, so a clicked point belongs to the chart's model.
  const dbKeyFor: Record<string, string> = {
    'DeepSeek-V4-Pro': DEFAULT_MODEL_DB_KEY,
    'Kimi-K3': TARGET_MODEL_DB_KEY,
  };
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    const model = dbKeyFor[new URL(request.url).searchParams.get('model') ?? ''];
    request.reply({ body: benchmarks.filter((b) => b.model === model) });
  }).as('benchmarks');
  interceptBenchmarkPresence({ trace: tracedIds });
  interceptDerivedAgenticMetrics();
  interceptDetailPage();
}

function visitChart(path: string): void {
  interceptChart();
  const separator = path.includes('?') ? '&' : '?';
  cy.visit(`${path}${separator}g_model=DeepSeek-V4-Pro`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.get('[data-testid="inference-chart-display"]').should('exist');
}

function selectTargetModel(): void {
  cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro');
  cy.get('[data-testid="model-selector"]').click();
  cy.contains('[role="option"]', TARGET_MODEL_LABEL).click();
  cy.get('[data-testid="model-selector"]').should('contain.text', TARGET_MODEL_LABEL);
}

function soloLegendSeries(): void {
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').should(
    'have.length.greaterThan',
    1,
  );
  cy.contains('[data-testid="chart-legend"] label', SOLO_HW_LABEL).click();
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').should('have.length', 1);
}

function clickTracedPoint(): void {
  cy.get('[data-testid="inference-chart-display"] [data-testid="d3-chart-svg"]')
    .first()
    .should(($svg) => {
      const svg = $svg[0];
      const containerWidth = svg.parentElement?.getBoundingClientRect().width ?? 0;
      expect(
        Number(svg.getAttribute('width')),
        'chart rebuilt at the container width',
      ).to.be.closeTo(containerWidth, 1);
    });
  cy.scatterPoints('[data-testid="inference-chart-display"]')
    .should('have.length.greaterThan', 0)
    .then((points) => {
      const target = points.find(
        (point) => point.datum.hwKey === SOLO_HW_KEY && tracedIds.has(Number(point.datum.id)),
      );
      expect(target, `a traced ${SOLO_HW_KEY} point`).to.not.equal(undefined);
      clickScatterPoint(target!);
    });
}

function openPointDetail(): void {
  cy.get(`[data-testid="legend-points-${SOLO_HW_KEY}"]`).should('exist');
  clickTracedPoint();
  cy.get('[data-testid="point-details-panel"] [data-action="view-charts"]')
    .should('be.visible')
    .click();
}

const backControl = (locale: 'en' | 'zh') =>
  cy.contains('button', locale === 'zh' ? '返回' : 'Back');
const chartLink = (locale: 'en' | 'zh') =>
  cy.contains('a', locale === 'zh' ? '推理图表' : 'Inference chart');

function assertRestoredChart(modelLabel = TARGET_MODEL_LABEL): void {
  cy.get('[data-testid="model-selector"]').should('contain.text', modelLabel);
  cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked')
    .should('have.length', 1)
    .closest('li')
    .should('contain.text', SOLO_HW_LABEL);
}

/** Answers the sibling navigator with every traced point of the soloed SKU on `model`. */
function interceptSiblings(model = TARGET_MODEL_DB_KEY): void {
  const [hardware, framework] = SOLO_HW_KEY.split('_');
  const skuPoints = benchmarks.filter(
    (b) => b.model === model && b.hardware === hardware && b.framework === framework,
  );
  cy.intercept('GET', '/api/v1/benchmark-siblings*', (request) => {
    const currentId = Number(new URL(request.url).searchParams.get('id'));
    request.reply({
      sku: {
        hardware,
        framework,
        model,
        precision: 'fp4',
        spec_method: 'none',
        benchmark_type: 'agentic_traces',
        github_run_id: 31893747354,
        date: AGENTIC_DATE,
        dataset_slug: 'fixture-dataset',
      },
      siblings: skuPoints.map((b) => ({
        id: b.id,
        conc: b.conc,
        offload_mode: 'off',
        decode_tp: 8,
        decode_ep: 1,
        decode_pp: 1,
        decode_dcp_size: 1,
        decode_pcp_size: 1,
        decode_dp_attention: false,
        decode_num_workers: 0,
        prefill_tp: 8,
        prefill_ep: 1,
        prefill_pp: 1,
        prefill_dcp_size: 1,
        prefill_pcp_size: 1,
        prefill_dp_attention: false,
        prefill_num_workers: 0,
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
        disagg: false,
        is_multinode: false,
        tput_per_gpu: b.metrics.tput_per_gpu,
        total_requests: 100,
        is_current: b.id === currentId,
        has_trace: true,
      })),
    });
  });
}

/** Steps to a neighbouring point of the same SKU with the Previous/Next buttons. */
function stepToSibling(): void {
  cy.location('pathname').then((detailPath) => {
    cy.get('button[aria-label="Next point"], button[aria-label="Previous point"]')
      .filter(':enabled')
      .first()
      .click();
    cy.location('pathname')
      .should('match', /^\/infx\/inference\/agentic\/\d+$/u)
      .and('not.eq', detailPath);
  });
}

/** Notes the chart's pathname before the reader leaves it for a point's detail page. */
function rememberChartPath(): void {
  cy.location('pathname')
    .should('not.match', /\/agentic\//u)
    .as('chartPath');
}

/** The Inference tab a chart path belongs to, with or without its model segment. */
const inferenceTab = (pathname: string) =>
  pathname.replace(/^(?<tab>(?:\/zh)?\/infx\/inference)\/[^/]+$/u, '$<tab>');

/**
 * Back returns to the chart's own history entry. A chart opened on the bare Inference URL
 * rewrites its address to the model route once it loads, so the bare and model forms are the same
 * chart; which model it shows, and its legend, are asserted separately.
 */
function assertBackAtChart(): void {
  cy.get<string>('@chartPath').then((chartPath) => {
    cy.location('pathname').should((pathname) => {
      expect(pathname).to.not.match(/\/agentic\//u);
      expect(inferenceTab(pathname)).to.eq(inferenceTab(chartPath));
    });
  });
}

const SOLO_KIMI_POINT_ID = benchmarks.find(
  (b) => b.model === TARGET_MODEL_DB_KEY && `${b.hardware}_${b.framework}` === SOLO_HW_KEY,
)!.id;

describe('Agentic point detail — returning to the chart', () => {
  it('returns to the chart it came from and restores the legend when the reader clicks Back', () => {
    visitChart('/infx/inference');
    interceptSiblings();
    selectTargetModel();
    soloLegendSeries();
    rememberChartPath();
    openPointDetail();

    cy.location('pathname').should('match', /^\/infx\/inference\/agentic\/\d+$/u);
    backControl('en').click();

    assertBackAtChart();
    assertRestoredChart();
  });

  it('returns to the default model chart, not the featured model, when the reader clicks Back', () => {
    visitChart('/infx/inference');
    interceptSiblings(DEFAULT_MODEL_DB_KEY);
    cy.get('[data-testid="model-selector"]').should('contain.text', DEFAULT_MODEL_LABEL);
    soloLegendSeries();
    rememberChartPath();
    openPointDetail();

    cy.location('pathname').should('match', /^\/infx\/inference\/agentic\/\d+$/u);
    backControl('en').click();

    assertBackAtChart();
    assertRestoredChart(DEFAULT_MODEL_LABEL);
  });

  it('leaves the detail page for good: browser back after Back does not reopen it', () => {
    cy.visit('/about');
    visitChart('/infx/inference');
    interceptSiblings(DEFAULT_MODEL_DB_KEY);
    soloLegendSeries();
    rememberChartPath();
    openPointDetail();

    backControl('en').click();
    assertBackAtChart();
    cy.go('back');

    cy.location('pathname').should('not.match', /\/agentic\//u);
  });

  it('replaces a deep-linked detail with its chart, so browser back leaves instead of reopening it', () => {
    cy.visit('/about');
    interceptChart();
    interceptSiblings();
    cy.visit(`/infx/inference/agentic/${SOLO_KIMI_POINT_ID}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    backControl('en').should('be.enabled').click();
    cy.location('pathname').should('eq', '/infx/inference/kimi-k3');
    cy.get('[data-testid="model-selector"]').should('contain.text', TARGET_MODEL_LABEL);
    cy.go('back');

    cy.location('pathname').should('eq', '/about');
  });

  for (const { name, select, gModel, label, path } of [
    {
      name: 'a chosen model',
      select: true,
      gModel: 'Kimi-K3',
      label: TARGET_MODEL_LABEL,
      path: '/infx/inference/kimi-k3',
    },
    {
      name: 'the default model',
      select: false,
      gModel: 'DeepSeek-V4-Pro',
      label: DEFAULT_MODEL_LABEL,
      path: '/infx/inference/deepseek-v4',
    },
  ]) {
    it(`returns to ${name}'s chart even when the point's SKU data fails to load`, () => {
      visitChart('/infx/inference');
      // Only the detail page's own URL can name the model: siblings fail, metrics are empty.
      cy.intercept('GET', '/api/v1/benchmark-siblings*', { statusCode: 500, body: {} }).as(
        'siblings',
      );
      if (select) selectTargetModel();
      else cy.get('[data-testid="model-selector"]').should('contain.text', label);
      soloLegendSeries();
      rememberChartPath();
      openPointDetail();

      cy.location('search').should('include', `g_model=${gModel}`);
      cy.wait('@siblings');
      chartLink('en')
        .should('have.attr', 'href')
        .and('match', new RegExp(`^${path}(?:\\?|$)`, 'u'));
      backControl('en').should('be.enabled').click();

      assertBackAtChart();
      assertRestoredChart(label);
    });
  }

  it('returns to the chart in one Back click after stepping through sibling points', () => {
    visitChart('/infx/inference');
    interceptSiblings();
    selectTargetModel();
    soloLegendSeries();
    rememberChartPath();
    openPointDetail();

    stepToSibling();
    stepToSibling();
    backControl('en').click();

    assertBackAtChart();
    assertRestoredChart();
  });

  it('replaces the history entry when stepping between siblings', () => {
    visitChart('/infx/inference');
    interceptSiblings();
    selectTargetModel();
    soloLegendSeries();
    openPointDetail();

    stepToSibling();
    cy.go('back');

    cy.location('pathname').should('eq', '/infx/inference/kimi-k3');
    assertRestoredChart();
  });

  it('restores the model and legend through the "Inference chart" link', () => {
    visitChart('/infx/inference');
    interceptSiblings();
    selectTargetModel();
    soloLegendSeries();
    openPointDetail();

    chartLink('en')
      .should('have.attr', 'href')
      .and('match', /^\/infx\/inference\/kimi-k3(?:\?|$)/u)
      .and('not.include', 'g_model=');
    chartLink('en').click();

    cy.location('pathname').should('eq', '/infx/inference/kimi-k3');
    assertRestoredChart();
  });

  it('keeps a Chinese reader on /zh for the whole round trip', () => {
    visitChart('/zh/infx/inference');
    interceptSiblings();
    selectTargetModel();
    soloLegendSeries();
    rememberChartPath();
    openPointDetail();

    cy.location('pathname').should('match', /^\/zh\/infx\/inference\/agentic\/\d+$/u);
    chartLink('zh')
      .should('have.attr', 'href')
      .and('match', /^\/zh\/infx\/inference\/kimi-k3(?:\?|$)/u);
    backControl('zh').click();

    assertBackAtChart();
    assertRestoredChart();
  });
});
