/**
 * Tests for the "Historical Trends" tab.
 * Shows interpolated GPU performance over time at a user-selected interactivity level.
 */
import type { BenchmarkRow } from '@/lib/api';

const visitHistoricalWithSetup = () => {
  cy.visit('/historical', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.get('[data-testid="historical-trends-display"]').should('be.visible');
};

const asAgenticRowsOn = (rows: Record<string, unknown>[], date: string) =>
  rows.map((row) => ({ ...row, benchmark_type: 'agentic_traces', date }));

describe('Historical Trends Tab', () => {
  beforeEach(() => {
    visitHistoricalWithSetup();
  });

  it('renders the Historical Trends tab content', () => {
    cy.get('[data-testid="historical-trends-display"]').should('contain.text', 'Over Time');
  });

  it('renders a slider for target interactivity', () => {
    cy.get('[data-testid="historical-target-slider"]')
      .should('exist')
      .and('have.attr', 'aria-label', 'Target Interactivity (tok/s/user)');
  });

  it('renders a number input for precise interactivity value', () => {
    cy.get('[data-testid="historical-target-input"]')
      .should('exist')
      .and('have.attr', 'aria-label', 'Target Interactivity (tok/s/user)');
  });

  it('renders a trend chart SVG after data loads', () => {
    cy.get('[data-testid="historical-trends-display"]').find('svg').should('exist');
  });

  it('tab trigger is visible in desktop navigation', () => {
    cy.get('[data-testid="tab-trigger-historical"]').should('contain.text', 'Historical Trends');
  });
});

describe('Historical Trends — Content & Interactions', () => {
  beforeEach(() => {
    visitHistoricalWithSetup();
  });

  it('renders SVG trend line paths after data loads', () => {
    cy.get('[data-testid="trend-chart-svg"]').should('exist');
    cy.get('[data-testid="trend-chart-svg"] path.line-path').should('have.length.greaterThan', 0);
  });

  it('renders data point circles on trend lines', () => {
    cy.get('[data-testid="trend-chart-svg"] circle').should('have.length.greaterThan', 0);
  });

  it('loads history when the current snapshot lacks the selected energy metric', () => {
    cy.fixture<BenchmarkRow[]>('api/benchmarks.json').then((rows) => {
      const withoutRoleEnergy = rows.map((row) => ({
        ...row,
        metrics: { ...row.metrics, prefill_joules_per_input_token: undefined },
      }));
      cy.intercept('GET', '**/api/v1/benchmarks?*', withoutRoleEnergy).as('benchmarks');
      cy.intercept('GET', '**/api/v1/benchmarks/history?*').as('history');
      cy.visit('/historical?g_model=DeepSeek-R1-0528&i_metric=y_measuredPrefillJPerInputToken');
      cy.wait('@benchmarks');
      cy.wait('@history');
      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Measured Prefill Joules per Input Token',
      );
      cy.get('[data-testid="historical-target-slider"]').should('be.visible');
      cy.get('[data-testid="historical-trend-figure"]')
        .should('be.visible')
        .and('contain.text', 'No historical data found for the tracked configurations.');
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

  it('chart title includes "Over Time" and "Interactivity" reflecting the operating point', () => {
    cy.get('[data-testid="historical-trend-figure"]')
      .find('h2')
      .invoke('text')
      .should('include', 'Over Time')
      .and('include', 'Interactivity');
  });

  it('model selector is present and has selectable options', () => {
    // Clear any stale Radix scroll lock from prior Select interactions
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="model-selector"]').should('be.visible');
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('sequence selector is present and has selectable options', () => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="scenario-selector"]').should('be.visible');
    cy.get('[data-testid="scenario-selector"]').click();
    cy.get('[data-select-option]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('keeps fixed precision visible and allows selection for multi-precision models', () => {
    cy.get('button[data-testid="precision-multiselect"]')
      .should('be.visible')
      .and('have.text', 'FP4')
      .and('be.disabled');
    cy.visit('/historical?g_model=DeepSeek-R1-0528');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    cy.get('[data-testid="precision-multiselect"][role="combobox"]')
      .should('be.visible')
      .and('be.enabled');
  });

  it('legend sidebar renders with hardware items matching visible trend lines', () => {
    cy.get('[data-testid="historical-trend-figure"]')
      .find('.sidebar-legend')
      .should('exist')
      .find('li')
      .should('have.length.greaterThan', 0);
  });

  it('Log Scale switch exists in the legend and can be toggled', () => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="historical-trend-figure"]')
      .find('.sidebar-legend')
      .contains('label', 'Log Scale')
      .should('exist');

    cy.get('#historical-log-scale').click();
    cy.get('#historical-log-scale').should('have.attr', 'data-state', 'checked');

    cy.get('#historical-log-scale').click();
    cy.get('#historical-log-scale').should('have.attr', 'data-state', 'unchecked');
  });

  it('GPU Config multi-select is hidden (Historical Trends uses hideGpuComparison)', () => {
    cy.get('[data-testid="gpu-multiselect"]').should('not.exist');
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

  it('changing model updates the chart title to reflect the new model', () => {
    cy.document().then((doc) => {
      delete doc.body.dataset.scrollLocked;
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="historical-trend-figure"]').should('exist');

    cy.get('[data-testid="historical-trend-figure"] [data-testid="result-context"]')
      .first()
      .invoke('text')
      .then((initialSubtitle) => {
        cy.get('[data-testid="model-selector"]').click();
        cy.get('[role="option"]').then(($options) => {
          if ($options.length <= 1) return;
          cy.wrap($options).last().click();

          cy.get('[data-testid="historical-trend-figure"] [data-testid="result-context"]')
            .first()
            .invoke('text')
            .should('not.eq', initialSubtitle);
        });
      });
  });

  it('interactivity range labels are displayed below the slider', () => {
    cy.get('[data-testid="historical-trends-display"]')
      .find('input[type="range"]')
      .parent()
      .find('.relative.text-muted-foreground span')
      .should('have.length.greaterThan', 0)
      .each(($span) => {
        expect($span.text()).to.match(/\d+/u);
      });
  });
});

describe('Historical Trends — Chinese route', () => {
  beforeEach(() => {
    cy.visit('/zh/historical', {
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
    cy.get('[data-testid="trend-chart-svg"] circle').first().click({ force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', '点击其他区域关闭')
      .invoke('text')
      .should('match', /\d{4}年/u);
  });

  it('localizes the Agentic sequence and run date in the chart caption', () => {
    const runDate = '2025-03-01';
    cy.fixture('api/availability.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/availability', {
        body: asAgenticRowsOn(rows, runDate),
      }).as('agenticAvailability');
    });
    cy.fixture('api/benchmarks.json').then((rows) => {
      cy.intercept('GET', '**/api/v1/benchmarks?*', {
        body: asAgenticRowsOn(rows, runDate),
      }).as('agenticBenchmarks');
    });

    cy.visit(
      `/zh/historical?g_model=DeepSeek-R1-0528&i_seq=agentic-traces&i_prec=fp4&g_rundate=${runDate}`,
    );
    cy.wait('@agenticAvailability');
    cy.wait('@agenticBenchmarks');
    cy.get('[data-testid="historical-trend-figure"] [data-testid="result-context"]')
      .first()
      .should('contain.text', '智能体')
      .and('contain.text', '2025年3月1日')
      .and('not.contain.text', runDate);
  });

  it('shows a settled Chinese empty state instead of leaving the skeleton mounted', () => {
    cy.intercept('GET', '**/api/v1/benchmarks?*', []).as('emptyBenchmarks');
    cy.reload();
    cy.wait('@emptyBenchmarks');
    cy.contains('所选模型和序列暂无交互性图表数据。').should('be.visible');
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
      cy.contains('历史基准测试数据加载失败。').should('be.visible');
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
    cy.fixture('api/benchmarks-history.json').then((historyRows) => {
      let attempts = 0;
      cy.intercept('GET', '**/api/v1/benchmarks/history?*', (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2
            ? { statusCode: 500, body: { error: 'secondary-history-internal-detail' } }
            : { body: historyRows },
        );
      }).as('secondaryHistory');

      cy.reload();
      cy.wait('@secondaryHistory');
      cy.wait('@secondaryHistory');
      cy.get('[data-testid="historical-trend-error"]')
        .should('contain.text', '历史趋势数据加载失败。')
        .and('not.contain.text', '历史基准测试数据加载失败。')
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
