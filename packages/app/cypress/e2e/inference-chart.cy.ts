import { unlockAgenticGate } from '../support/e2e';
import { interceptOverlayRun, OVERLAY_RUN_ID } from '../support/overlay-fixtures';

describe('Inference Chart', () => {
  before(() => {
    cy.viewport(1440, 900);
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('renders the inference chart display wrapper', () => {
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('shows the Inference Performance heading', () => {
    cy.contains('h2', 'Inference Performance').should('be.visible');
  });

  it('renders at least one chart figure', () => {
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('renders at least one scatter graph with an SVG', () => {
    cy.get('[data-testid="scatter-graph"]').should('have.length.at.least', 1);
    cy.get('[data-testid="scatter-graph"]').first().find('svg').should('exist');
  });

  it('hides the logo watermark when the unofficial-domain notice is shown', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="inference-chart-display"] pattern[id^="logo-pattern-"]').should(
      'not.exist',
    );
  });

  it('SVG contains data point circles', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg circle')
      .should('have.length.greaterThan', 0);
  });

  it('does not show "No data available" when data loads', () => {
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  it('shows a chart heading with metric title', () => {
    cy.get('[data-testid="chart-figure"]').first().find('h2').should('not.be.empty');
  });

  it('shows chart caption with model and source info', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('figcaption p')
      .should('contain', 'SemiAnalysis InferenceX');
  });

  it('shows the sidebar legend for GPU types', () => {
    cy.get('.sidebar-legend').should('be.visible');
  });

  it('renders quick filters and toggles a vendor pill', () => {
    cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-deployment-single-node"]').should('contain', 'Single-node');
    cy.get('[data-testid="quick-filter-deployment-multi-node"]').should('contain', 'Multi-node');
    cy.get('[data-testid="quick-filter-deployment-disagg"]').should('contain', 'Disaggregated');
    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]')
      .should('have.attr', 'aria-pressed', 'false')
      .click()
      .should('have.attr', 'aria-pressed', 'true')
      .click()
      .should('have.attr', 'aria-pressed', 'false');
  });

  it('plots OpenRouter-priced token revenue for official and unofficial runs', () => {
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              completion: '0.000003366',
            },
          },
        ],
      },
    }).as('openRouterPricing');
    interceptOverlayRun();
    cy.visit(
      `/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokenRevenuePerGpuHour&i_revenue=openrouter`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@unofficialRun');
    cy.wait('@openRouterPricing');

    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Token Revenue per GPU Hour',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should(
      'contain.text',
      'OpenRouter current pricing',
    );
    cy.get('[data-testid="openrouter-price-summary"]')
      .should('contain.text', 'Input $1.122/M tok')
      .and('contain.text', 'Output $3.366/M tok');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should('have.text', 'Input $1.122/M tok · Output $3.366/M tok')
      .then(($prices) => {
        const subtitle = $prices.parent().text();
        expect(subtitle.indexOf($prices.text())).to.be.lessThan(subtitle.indexOf('Updated:'));
      });
    cy.get('[data-testid="openrouter-pricing-link"]').should(
      'have.attr',
      'href',
      'https://openrouter.ai/deepseek/deepseek-v4-pro-0813',
    );
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', 'Token Revenue per GPU Hour at OpenRouter Pricing');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid^="axis-metric-row-y-"]').first().click();
    cy.get('[data-testid^="axis-metric-body-y-"]')
      .first()
      .should('contain.text', 'OpenRouter')
      .and('contain.text', '$/GPU/hr =');
  });

  it('ships OpenRouter-priced token revenue in Chinese', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', {
      statusCode: 200,
      body: {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              completion: '0.000003366',
            },
          },
        ],
      },
    }).as('openRouterPricingZh');
    interceptOverlayRun();
    cy.visit(
      `/zh/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokenRevenuePerGpuHour&i_revenue=openrouter`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@unofficialRun');
    cy.wait('@openRouterPricingZh');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      '每 GPU 小时 token 收入',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should(
      'contain.text',
      'OpenRouter 当前价格',
    );
    cy.get('[data-testid="openrouter-price-summary"]')
      .should('contain.text', '输入 $1.122/百万 token')
      .and('contain.text', '输出 $3.366/百万 token');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should('have.text', '输入 $1.122/百万 token · 输出 $3.366/百万 token')
      .then(($prices) => {
        const subtitle = $prices.parent().text();
        expect(subtitle.indexOf($prices.text())).to.be.lessThan(subtitle.indexOf('更新时间：'));
      });
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', '按 OpenRouter 价格计算的每 GPU 小时 token 收入');
  });

  it('surfaces the error instead of an endless skeleton when availability fails', () => {
    cy.intercept('GET', '/api/v1/availability*', { statusCode: 500, body: {} }).as(
      'availabilityFailure',
    );
    cy.visit('/inference');
    cy.wait('@availabilityFailure');
    cy.contains('h2', 'Something went wrong!').should('be.visible');
  });
});

describe('Inference Chart — Simplified Chinese mobile path', () => {
  beforeEach(() => {
    cy.viewport(375, 900);
    cy.visit('/zh/inference?g_model=DeepSeek-R1-0528', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('be.visible');
  });

  it('keeps chart controls reachable and localizes the complete table click path', () => {
    cy.contains('h2', '推理性能').should('be.visible');
    cy.get('[data-testid="x-axis-mode-buttons"]').should('have.attr', 'aria-label', '图表横轴指标');
    cy.get('[data-testid="share-button"]')
      .should('be.visible')
      .and('have.attr', 'title', '分享当前视图');
    cy.get('[data-testid="inference-view-toggle-0"]').should('be.visible').contains('表格').click();
    cy.get('[data-testid="inference-results-table"]')
      .should('contain.text', '芯片')
      .and('contain.text', '精度')
      .and('contain.text', '并发数');
    cy.get('[data-testid="export-button"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', '下载图表');
    cy.document().then((doc) => {
      const viewportWidth = doc.documentElement.clientWidth;
      const overflow = [...doc.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({
          element,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ bounds }) => bounds.right > viewportWidth + 0.5)
        .map(
          ({ element, bounds }) =>
            `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
              element.className && typeof element.className === 'string'
                ? `.${element.className.split(/\s+/u).filter(Boolean).join('.')}`
                : ''
            }=${bounds.left.toFixed(1)}..${bounds.right.toFixed(1)} text=${JSON.stringify(
              element.textContent?.trim().slice(0, 24),
            )} parent=${element.parentElement?.getAttribute('class')}`,
        )
        .slice(0, 10);
      expect(
        doc.documentElement.scrollWidth,
        `overflowing elements: ${overflow.join(', ')}`,
      ).to.be.at.most(viewportWidth);
    });
  });

  it('localizes architecture and changelog overlays without changing technical model data', () => {
    cy.viewport(1440, 900);
    cy.get('[data-testid="model-architecture-toggle"]')
      .should('contain.text', '模型架构')
      .and('contain.text', 'MoE')
      .click();
    cy.contains('特性：').should('be.visible');
    cy.contains('发布方 DeepSeek').should('be.visible');
    cy.contains('button', '变更日志').should('be.visible').click();
    cy.contains('说明').should('be.visible');
  });
});
