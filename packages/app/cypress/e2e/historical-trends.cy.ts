import { compactTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import type { AvailabilityRow, BenchmarkRow } from '@/lib/api/api';

import { availabilityBody } from '../support/e2e';

/** Clicks the trend chart where its first point is drawn; the hover overlay above the dots takes the click. */
const clickFirstTrendPoint = () =>
  cy
    .get('[data-testid="trend-chart-svg"] .dot-group circle')
    .first()
    .then(($dot) => {
      const dot = $dot[0].getBoundingClientRect();
      cy.get('[data-testid="trend-chart-svg"] .proximity-overlay').then(($overlay) => {
        const plot = $overlay[0].getBoundingClientRect();
        cy.wrap($overlay).click(dot.x + dot.width / 2 - plot.x, dot.y + dot.height / 2 - plot.y, {
          force: true,
        });
      });
    });

/** Opens the waterfall series picker, reads every option's series id, and closes it again. */
const waterfallSeriesIds = () => {
  cy.get('[data-testid="waterfall-series"]').click();
  return cy.get('[data-testid="waterfall-series-option"]').then(($options) => {
    const ids = [...$options].map((option) => option.dataset.seriesId ?? '');
    cy.focused().type('{esc}');
    return cy.wrap(ids);
  });
};

describe('Historical improvement waterfall', () => {
  beforeEach(() => {
    cy.fixture<BenchmarkRow[]>('api/benchmarks-history.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*', {
        body: compactTrendHistory(rows),
      }).as('waterfallHistory');
    });
    cy.visit('/infx/historical?g_model=DeepSeek-R1-0528');
    cy.wait('@waterfallHistory');
    cy.get('[data-testid="historical-trend-figure"] svg').should('be.visible');
  });

  it('keeps the line chart default, switches views, and changes series', () => {
    cy.get('[data-testid="historical-view-line"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('[data-testid="waterfall-chart-svg"]').should('be.visible');
    cy.get('#historical-trend-export').should('exist');
    cy.get('[data-testid="waterfall-step"][data-kind="baseline"]').should('have.length', 1);
    cy.get('[data-testid="waterfall-step"][data-kind="best"]').should('have.length', 1);
    cy.get('[data-testid="waterfall-series"]').click();
    cy.get('[data-testid="waterfall-series-option"]').then(($options) => {
      if ($options.length > 1) cy.wrap($options.eq(1)).click();
      else cy.focused().type('{esc}');
    });
    cy.get('[data-testid="historical-view-line"]').click();
    cy.get('[data-testid="trend-chart-svg"]').should('be.visible');
    cy.get('[data-testid="waterfall-chart-svg"]').should('not.exist');
  });

  it('uses internal horizontal scrolling without widening a 375px page', () => {
    cy.viewport(375, 844);
    cy.get('select[data-testid="historical-view"]').select('waterfall');
    cy.get('[data-testid="waterfall-chart-svg"]').should('exist');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
    cy.get('[data-chart-scroll]').should('have.attr', 'tabindex', '0');
  });

  it('preserves hardware filtering, high contrast and reset in waterfall mode', () => {
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('[data-testid="waterfall-controls"] button[aria-expanded]').should('not.be.visible');
    cy.get('#historical-log-scale').should('not.exist');
    cy.get('#historical-high-contrast').should('be.visible').click();
    cy.get('#historical-high-contrast').should('have.attr', 'data-state', 'checked');

    waterfallSeriesIds().then((ids) => {
      const initialCount = ids.length;
      expect(initialCount).to.be.greaterThan(1);
      const hardware = ids[0].split('__')[0];
      cy.get(`[data-testid="waterfall-controls"] label[for="checkbox-${hardware}"]`).click();
      waterfallSeriesIds().should('have.length.lessThan', initialCount);
      cy.get('[data-testid="historical-reset-filter"]').should('be.visible').click();
      waterfallSeriesIds().should('have.length', initialCount);
    });

    cy.get('[data-testid="historical-view-line"]').click();
    cy.get('#historical-high-contrast').should('have.attr', 'data-state', 'checked');
    cy.get('#historical-log-scale').should('be.visible');
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('#historical-high-contrast').should('have.attr', 'data-state', 'checked').click();
    cy.get('#historical-high-contrast').should('have.attr', 'data-state', 'unchecked');
  });

  it('opens waterfall controls even when the line-chart legend was collapsed', () => {
    cy.get('[data-testid="historical-trend-figure"] [data-testid="legend-close-button"]').click();
    cy.get('#historical-high-contrast').should('not.exist');
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('#historical-high-contrast').should('be.visible').click();
    cy.get('[data-testid="waterfall-controls"] [data-testid="legend-open-button"]').should(
      'not.exist',
    );
    cy.get('[data-testid="waterfall-controls"] [data-testid="legend-close-button"]').should(
      'not.exist',
    );
    cy.get('[data-testid="waterfall-controls"] label[for^="checkbox-"]').first().click();
    cy.get('[data-testid="historical-reset-filter"]').should('be.visible').click();
    cy.get('#historical-high-contrast')
      .should('be.visible')
      .and('have.attr', 'data-state', 'checked');

    cy.get('[data-testid="historical-view-line"]').click();
    cy.get('[data-testid="historical-trend-figure"] [data-testid="legend-open-button"]').should(
      'be.visible',
    );
    cy.get('#historical-high-contrast').should('not.exist');
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('#historical-high-contrast')
      .should('be.visible')
      .and('have.attr', 'data-state', 'checked');
  });
});

const visitHistoricalWithSetup = () => {
  cy.visit('/infx/historical', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.get('[data-testid="historical-trends-display"]').should('be.visible');
};

const asAgenticRowsOn = <Row extends object>(rows: Row[], date: string) =>
  rows.map((row) => ({ ...row, benchmark_type: 'agentic_traces', date }));

describe('Historical Trends AgentX P90 operating point', () => {
  it('labels P90 in English and Chinese while using the P90 rather than median curve', () => {
    const date = '2025-03-01';
    cy.fixture<AvailabilityRow[]>('api/availability.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/availability/compact', {
        body: availabilityBody(asAgenticRowsOn(rows, date)),
      });
    });
    cy.fixture<BenchmarkRow[]>('api/benchmarks.json').then((rows) => {
      // Deliberately synthetic regression data: P90 and median must disagree.
      const agentic = [
        [10, 500],
        [35, 300],
        [60, 100],
      ].map(([rate, throughput], index) => ({
        ...rows[0],
        id: 8800 + index,
        hardware: 'h200',
        framework: 'trt',
        model: 'dsr1',
        precision: 'fp8',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        conc: [64, 32, 8][index],
        date,
        curve_date: date,
        spec_method: 'none',
        disagg: false,
        metrics: {
          ...rows[0].metrics,
          median_intvty: rate * 2,
          p90_intvty: 999,
          p90_full_response_itl: 1 / rate,
          tput_per_gpu: throughput,
          output_tput_per_gpu: throughput,
        },
      }));
      cy.intercept('GET', '**/api/v1/benchmarks?*', agentic).as('p90Benchmarks');
      cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*', {
        body: compactTrendHistory(agentic),
      }).as('p90History');
    });
    for (const prefix of ['', '/zh']) {
      cy.visit(
        `${prefix}/infx/historical?g_model=DeepSeek-R1-0528&i_seq=agentic-traces&i_prec=fp8&i_metric=y_tpPerGpu&g_rundate=${date}`,
      );
      cy.wait('@p90Benchmarks');
      cy.wait('@p90History');
      cy.get('[data-testid="historical-target-input"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'P90');
      cy.get('[data-testid="historical-trend-figure"] h2').should('contain.text', 'P90');
      clickFirstTrendPoint();
      cy.get('[data-testid="point-details-panel"]').should('contain.text', '300');
    }
  });
});

describe('Historical Trends — Content & Interactions', () => {
  beforeEach(() => {
    visitHistoricalWithSetup();
  });

  it('loads history when the current snapshot lacks the selected energy metric', () => {
    cy.fixture<BenchmarkRow[]>('api/benchmarks.json').then((rows) => {
      const withoutRoleEnergy = rows.map((row) => ({
        ...row,
        metrics: { ...row.metrics, prefill_joules_per_input_token: undefined },
      }));
      cy.intercept('GET', '**/api/v1/benchmarks?*', withoutRoleEnergy).as('benchmarks');
      cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*').as('history');
      cy.visit(
        '/infx/historical?g_model=DeepSeek-R1-0528&i_metric=y_measuredPrefillJPerInputToken',
      );
      cy.wait('@benchmarks');
      cy.wait('@history');
      cy.get('[data-testid="yaxis-metric-selector"]').should('contain.text', 'Measured energy');
      cy.get('[data-testid="measured-energy-denominator"]').should('contain.text', 'Input token');
      cy.get('[data-testid="measured-energy-scope"]').should('contain.text', 'Prefill GPUs');
      cy.get('[data-testid="historical-target-slider"]').should('be.visible');
      cy.get('[data-testid="historical-trend-figure"]')
        .should('be.visible')
        .and('contain.text', 'No historical data found for the tracked configurations');
      cy.contains(
        'No interactivity chart data available for the selected model and sequence.',
      ).should('not.exist');
    });
  });

  it('target interactivity slider value updates when the number input is changed', () => {
    cy.get('[data-testid="historical-trends-display"]').find('input[type="number"]').as('numInput');
    cy.get('@numInput').clear().type('50');
    cy.get('[data-testid="historical-trends-display"]')
      .find('input[type="range"]')
      .should('have.value', '50');
  });

  it('keeps fixed precision visible and allows selection for multi-precision models', () => {
    cy.get('button[data-testid="precision-multiselect"]')
      .should('be.visible')
      .and('have.text', 'FP4')
      .and('be.disabled');
    cy.visit('/infx/historical?g_model=DeepSeek-R1-0528');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    cy.get('[data-testid="precision-multiselect"][role="combobox"]')
      .should('be.visible')
      .and('be.enabled');
  });

  it('Y-axis metric selector is present and can be changed', () => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-select-option]').should('have.length.greaterThan', 1);

    cy.get('[data-testid="yaxis-metric-selector"]')
      .invoke('text')
      .then((initialText) => {
        cy.get('[data-select-option]').eq(2).click();
        cy.get('[data-testid="yaxis-metric-selector"]')
          .invoke('text')
          .should('not.eq', initialText.trim());
      });
  });

  it('offers the published tiers in the caption Cost Tier selector but no Custom user values', () => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="historical-trend-figure"] [data-testid="cost-tier-selector"]')
      .should('be.visible')
      .and('contain.text', 'Owning at large hyperscaler volume')
      .click('right');
    cy.get('[data-testid="cost-tier-hyperscaler"]').should('exist');
    cy.get('[data-testid="cost-tier-rental"]').should('exist');
    cy.get('[data-testid="cost-tier-custom"]').should('not.exist');
    cy.get('[data-testid="cost-tier-rental"]').click();
    cy.get('[data-testid="historical-trend-figure"] [data-testid="cost-tier-selector"]').should(
      'contain.text',
      'Rent – 3-year commit',
    );
  });
});

describe('Historical Trends — Chinese route', () => {
  beforeEach(() => {
    cy.visit('/zh/infx/historical', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
  });

  it('localizes the metric title, chart instructions, and point tooltip', () => {
    cy.viewport(1440, 900);
    cy.contains('目标交互性（tok/s/user）').should('be.visible');
    cy.get('[data-testid="historical-trend-figure"] h2').should('contain.text', '随时间变化');
    cy.get('[data-testid="historical-trend-figure"]').should('contain.text', 'Shift+滚轮横向缩放');
    clickFirstTrendPoint();
    cy.get('[data-testid="point-details-panel"]')
      .should('contain.text', '目标交互性')
      .invoke('text')
      .should('match', /\d{4}年/u);
  });

  it('localizes the Agentic sequence and run date in the chart caption', () => {
    const runDate = '2025-03-01';
    cy.fixture<AvailabilityRow[]>('api/availability.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/availability/compact', {
        body: availabilityBody(asAgenticRowsOn(rows, runDate)),
      }).as('agenticAvailability');
    });
    cy.fixture<BenchmarkRow[]>('api/benchmarks.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/benchmarks?*', {
        body: asAgenticRowsOn(rows, runDate),
      }).as('agenticBenchmarks');
    });

    cy.visit(
      `/zh/infx/historical?g_model=DeepSeek-R1-0528&i_seq=agentic-traces&i_prec=fp4&g_rundate=${runDate}`,
    );
    cy.wait('@agenticAvailability');
    cy.wait('@agenticBenchmarks');
    cy.get('[data-testid="historical-trend-figure"] h2').should('contain.text', '智能体');
    cy.get('[data-testid="historical-trend-figure"] [data-testid="result-context"]')
      .first()
      .should('contain.text', '2025年3月1日')
      .and('not.contain.text', runDate);
  });

  it('shows a settled Chinese empty state instead of leaving the skeleton mounted', () => {
    cy.intercept('GET', '**/api/v1/benchmarks?*', []).as('emptyBenchmarks');
    cy.reload();
    cy.wait('@emptyBenchmarks');
    cy.contains('所选模型和序列暂无交互性图表数据').should('be.visible');
    cy.get('[data-testid="historical-trends-display"] .animate-pulse').should('not.exist');
    cy.get('[data-testid="historical-target-slider"]').should('not.exist');
    cy.get('[data-testid="historical-trend-figure"]').should('not.exist');
  });

  it('shows a safe Chinese primary error and recovers through the reload control', () => {
    cy.fixture('api/benchmarks.json').then((benchmarkRows) => {
      let failRequests = true;
      cy.intercept('GET', '**/api/v1/benchmarks?*', (request) => {
        request.reply(
          failRequests
            ? { statusCode: 500, body: { error: 'historical-database-internal-detail' } }
            : { body: benchmarkRows },
        );
      }).as('failedBenchmarks');
      cy.reload();
      cy.wait('@failedBenchmarks');
      cy.wait('@failedBenchmarks');
      cy.contains('历史基准测试数据加载失败').should('be.visible');
      cy.contains('historical-database-internal-detail').should('not.exist');
      cy.contains('button', '重新加载页面')
        .then(() => {
          failRequests = false;
        })
        .click();
      cy.wait('@failedBenchmarks');
      cy.get('[data-testid="historical-trend-figure"]').should('be.visible');
    });
  });

  it('shows a distinct secondary-history error and recovers through the tracked retry', () => {
    // The display is visible before its history request starts, so let the beforeEach page
    // finish that request; otherwise it consumes the first failure the stub below counts.
    cy.get('[data-testid="trend-chart-svg"] .dot-group').should('exist');
    cy.fixture<BenchmarkRow[]>('api/benchmarks-history.json').then((historyRows) => {
      let attempts = 0;
      cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*', (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2
            ? { statusCode: 500, body: { error: 'secondary-history-internal-detail' } }
            : { body: compactTrendHistory(historyRows) },
        );
      }).as('secondaryHistory');

      cy.reload();
      cy.wait('@secondaryHistory');
      cy.wait('@secondaryHistory');
      cy.get('[data-testid="historical-trend-error"]')
        .should('contain.text', '历史趋势数据加载失败')
        .and('not.contain.text', '历史基准测试数据加载失败')
        .and('not.contain.text', 'secondary-history-internal-detail');
      cy.contains('button', '重试加载趋势数据').click();
      cy.wait('@secondaryHistory');
      cy.get('[data-testid="historical-trend-figure"]').should('be.visible');
    });
  });

  it('keeps the target controls and chart reachable at 375px', () => {
    cy.viewport(375, 844);
    cy.get('[data-testid="historical-trends-display"] input[type="range"]').should('be.visible');
    cy.get('[data-testid="historical-trends-display"] input[type="number"]').should('be.visible');
    cy.get('[data-testid="historical-trend-figure"] svg').should('exist');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
  });
});

describe('Historical frontier views', () => {
  beforeEach(() => {
    // The trend line loads compact trend rows; the frontier views load the full history only
    // once one of them is opened.
    cy.fixture<BenchmarkRow[]>('api/benchmarks-history.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/benchmarks/history/trends?*', {
        body: compactTrendHistory(rows),
      }).as('trendHistory');
      cy.intercept('GET', '**/api/v1/benchmarks/history?*', { body: rows }).as('frontierHistory');
    });
    cy.visit('/infx/historical?g_model=DeepSeek-R1-0528');
    cy.wait('@trendHistory');
    cy.get('[data-testid="historical-trend-figure"] svg').should('be.visible');
  });

  it('adds Frontier, Compare and Software gains beside the trend views', () => {
    cy.get('[data-testid^="historical-view-"]').then(($buttons) => {
      expect([...$buttons].map((button) => button.textContent)).to.deep.equal([
        'Trend line',
        'Improvement waterfall',
        'Frontier',
        'Compare',
        'Software gains',
      ]);
    });
    cy.get('[data-testid="historical-view-frontier"]').click();
    cy.get('[data-testid="frontier-view"]').should('be.visible');
    // The trend target keeps its place but is inert: frontier views span every interactivity.
    cy.get('[data-testid="historical-target-slider"]').closest('[inert]').should('exist');
    cy.get('[data-testid="frontier-grouping"]').should('not.exist');
    cy.get('[data-testid="frontier-vendor-all"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="frontier-svg"] path.fr-area').should('have.length', 1);
    // Choosing a vendor redraws the frontier from that company's chips alone.
    cy.get('[data-testid="frontier-vendor-AMD"]').click();
    cy.get('[data-testid="frontier-vendor-AMD"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="frontier-svg"] .line-label').should(($labels) => {
      expect($labels.text()).to.contain('MI3');
      expect($labels.text()).not.to.contain('B200');
    });

    cy.get('[data-testid="historical-view-line"]').click();
    cy.get('[data-testid="trend-chart-svg"]').should('be.visible');
    cy.get('[data-testid="historical-target-slider"]').closest('[inert]').should('not.exist');
  });

  it('compares vendors and chips with lead bars and per-series selection', () => {
    cy.get('[data-testid="historical-view-compare"]').click();
    cy.get('[data-testid="frontier-grouping-vendor"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="frontier-series-NVIDIA"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="frontier-series-AMD"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="frontier-lead-bars"] rect').should('have.length.greaterThan', 0);
    cy.get('[data-testid="frontier-area-timeline"] path').should('have.length.greaterThan', 0);

    // One series on its own gets the shading under its curve.
    cy.get('[data-testid="frontier-series-AMD"]').click();
    cy.get('[data-testid="frontier-lead-bars"]').should('not.exist');
    cy.contains('Pick at least two to compare.').should('be.visible');
    cy.get('[data-testid="frontier-svg"] path.fr-area').should('have.length', 1);

    cy.get('[data-testid="frontier-vendor"]').should('not.exist');
    cy.get('[data-testid="frontier-grouping-gpu"]').click();
    cy.get('[data-testid^="frontier-series-"][aria-pressed="true"]').should('have.length', 2);
    cy.get('[data-testid="frontier-series-b200"]').should('exist');
    cy.get('[data-testid="frontier-vendor-NVIDIA"]').click();
    cy.get('[data-testid="frontier-series-mi355x"]').should('not.exist');
    cy.get('[data-testid="frontier-series-b200"]').should('exist');
  });

  it('plots the rate of software gain by date and by chip age under Software gains', () => {
    cy.get('[data-testid="historical-view-software"]').click();
    cy.get('[data-testid="frontier-gain-rate"] svg path').should('have.length.greaterThan', 0);
    cy.get('[data-testid="frontier-gain-rate-table"]').within(() => {
      cy.contains('th', 'Current rate').should('exist');
      cy.get('tbody tr').should('have.length.greaterThan', 0);
    });
    cy.get('[data-testid="frontier-gain-rate-window-30"]').click();
    cy.get('[data-testid="frontier-gain-rate-axis-age"]').click();
    cy.get('[data-testid="frontier-gain-rate"]').should('contain.text', 'Days since first run');
    cy.get('[data-testid="frontier-gain-rate-common"]').should('not.exist');
  });

  it('shows same-chip software gains without a vendor option', () => {
    cy.get('[data-testid="historical-view-software"]').click();
    cy.get('[data-testid="frontier-grouping"]').should('not.exist');
    cy.get('[data-testid^="frontier-series-"]').first().should('not.contain.text', 'NVIDIA');
    cy.get('[data-testid="frontier-software-gain"]')
      .closest('section')
      .should('contain.text', 'the ground of its first run');
    cy.get('[data-testid="frontier-software-bars"] rect').should('have.length.greaterThan', 0);
    cy.get('[data-testid="frontier-software-table"]').within(() => {
      cy.contains('th', 'Average').should('exist');
      cy.get('tbody tr').should('have.length.greaterThan', 0);
      cy.get('tbody tr').first().find('td').last().invoke('text').should('match', /x$|—/);
    });
  });

  it('scrubs the chapter timeline and lists the points behind the curve', () => {
    cy.get('[data-testid="historical-view-frontier"]').click();
    cy.get('[data-testid="frontier-date-slider"]').then(($slider) => {
      const last = Number($slider.attr('max'));
      expect(last).to.be.greaterThan(1);
      expect(Number($slider.val())).to.equal(last);
    });
    // Cypress cannot type into a range input; set it the way a drag would, through React.
    cy.get<HTMLInputElement>('[data-testid="frontier-date-slider"]').then(([slider]) => {
      const { prototype } = slider.ownerDocument.defaultView!.HTMLInputElement;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(slider, '0');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cy.get('[data-testid="frontier-date-slider"]').should('have.value', '0');
    cy.get('[data-testid="frontier-play"]').should('contain.text', 'Play');

    cy.get('[data-testid="frontier-data-toggle"]').click();
    cy.get('[data-testid="frontier-data-table"] tbody tr').should('have.length.greaterThan', 0);
  });

  it('labels the frontier views in Chinese', () => {
    cy.visit('/zh/infx/historical?g_model=DeepSeek-R1-0528');
    cy.wait('@trendHistory');
    cy.get('[data-testid="historical-view-frontier"]').should('have.text', '前沿').click();
    cy.get('[data-testid="historical-view-compare"]').should('have.text', '对比');
    cy.get('[data-testid="historical-view-software"]').should('have.text', '软件提升');
    cy.get('[data-testid="frontier-vendor-all"]').should('have.text', '全部');
  });
});
