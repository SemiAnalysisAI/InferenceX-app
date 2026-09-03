import { expectNoPageOverflow, unlockAgenticGate } from '../support/e2e';
import { interceptOverlayRun, OVERLAY_RUN_ID } from '../support/overlay-fixtures';

function openYAxisHelp(metric: string) {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($toggle) => {
    if ($toggle.is(':visible') && $toggle.attr('aria-expanded') === 'false') {
      cy.wrap($toggle).click();
    }
  });
  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.get(`[data-testid="option-help-${metric}"]`).scrollIntoView().click();
}

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

  it('leads the chart heading with the model and workload, without the cost tier', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      // The metric runs straight into the x-axis phrase: no "(Owning - …)" tier
      // between them. The scenario word varies with the default sequence.
      .should('contain.text', 'Total Tokens per $1 TCO vs.')
      .and('contain.text', 'Interactivity')
      .and('not.contain.text', '(Owning');
    // The heading names the model, so the caption no longer repeats it.
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .invoke('text')
      .then((heading) => {
        cy.get('[data-testid="model-selector"]')
          .invoke('text')
          .then((model) => {
            expect(heading.trim().startsWith(model.trim())).to.equal(true);
          });
      });
  });

  it('shows precision, cost tier, update date, and source in the caption', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context"]')
      .should('contain.text', 'Cost Tier: Owning Hyperscaler')
      .and('contain.text', 'Updated:')
      .and('contain.text', 'SemiAnalysis InferenceX')
      .and('not.contain.text', 'Model:')
      .and('not.contain.text', 'Workload:')
      .and('contain.text', 'Precision:')
      .and('not.contain.text', 'Metric:');
  });

  it('shows the sidebar legend for GPU types', () => {
    cy.get('.sidebar-legend').should('be.visible');
  });

  it('renders quick filters as visible toggles and toggles a vendor', () => {
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
    cy.get('body').type('{esc}');
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
              input_cache_read: '0.00000008',
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
      .should('contain.text', 'Uncached input $1.122/M tok')
      .and('contain.text', 'Cached input $0.08/M tok')
      .and('contain.text', 'Output $3.366/M tok');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should('have.text', 'Uncached $1.122/M tok · Cached $0.08/M tok · Output $3.366/M tok')
      .closest('[data-testid="result-context"]')
      .should('contain.text', 'Cost basis:')
      .and('contain.text', 'Updated:');
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
    openYAxisHelp('y_tokenRevenuePerGpuHour');
    cy.get('[data-testid="option-help-content-y_tokenRevenuePerGpuHour"]')
      .should('contain.text', 'OpenRouter')
      .and('contain.text', 'Agentic cache hit combines GPU and external cache')
      .and('contain.text', 'A partially measured cache frontier receives no cache discount.')
      .and('contain.text', '$/GPU/hr =')
      .and(($body) => {
        expect($body.text()).not.to.include('—');
      });
  });

  it('plots infrastructure total tokens per dollar for official and unofficial runs', () => {
    interceptOverlayRun();
    cy.visit(
      `/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokensPerDollarN`,
      {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          unlockAgenticGate(win);
        },
      },
    );
    cy.wait('@unofficialRun');

    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Total Tokens per $1 TCO (Owning - Neocloud Giant)',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', 'Total Tokens per $1 TCO')
      .and('not.contain.text', '(Owning');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context-cost-tier"]')
      .should('have.text', 'Owning Neocloud Giant');
    cy.get('[data-testid="inference-chart-display"] svg .dot-group').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    openYAxisHelp('y_tokensPerDollarN');
    cy.get('[data-testid="option-help-content-y_tokensPerDollarN"]')
      .should('contain.text', 'infrastructure spend')
      .and('contain.text', 'Neocloud Giant')
      .and('contain.text', 'all-in cost per chip-hour');
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
              input_cache_read: '0.00000008',
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
      .should('contain.text', '未缓存输入 $1.122/百万 token')
      .and('contain.text', '缓存输入 $0.08/百万 token')
      .and('contain.text', '输出 $3.366/百万 token');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="token-revenue-subtitle-prices"]')
      .should(
        'have.text',
        '未缓存 $1.122/百万 token · 缓存 $0.08/百万 token · 输出 $3.366/百万 token',
      )
      .closest('[data-testid="result-context"]')
      .should('contain.text', '成本口径:')
      .and('contain.text', '更新时间:');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', '按 OpenRouter 价格计算的每 GPU 小时 token 收入');
    openYAxisHelp('y_tokenRevenuePerGpuHour');
    cy.get('[data-testid="option-help-content-y_tokenRevenuePerGpuHour"]')
      .should(
        'contain.text',
        '已报告 external cache 时，Agentic 缓存命中率由 GPU 与 external cache 相加',
      )
      .and('contain.text', '缓存指标仅覆盖部分 frontier 数据点时，不应用缓存折扣。')
      .and(($body) => {
        expect($body.text()).not.to.include('—');
      });
  });

  it('ships infrastructure total tokens per dollar in Chinese', () => {
    cy.viewport(390, 844);
    interceptOverlayRun();
    cy.visit(
      `/zh/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90&i_metric=y_tokensPerDollarN`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@unofficialRun');

    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      '每 1 美元 TCO 对应的总 token 数（自有 - Neocloud Giant）',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('h2')
      .should('contain.text', '每 1 美元 TCO 对应的总 token 数')
      .and('not.contain.text', '（自有');
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('[data-testid="result-context-cost-tier"]')
      .should('have.text', '自有（Neocloud Giant）');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );
    openYAxisHelp('y_tokensPerDollarN');
    cy.get('[data-testid="option-help-content-y_tokensPerDollarN"]')
      .should('contain.text', '基础设施开支')
      .and('contain.text', 'Neocloud Giant')
      .and('contain.text', '每芯片小时全包成本');
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
    cy.get('[data-testid="inference-secondary-controls"] > button').click();
    cy.get('label[for="x-axis-mode-select"]').should('have.text', 'X 轴指标');
    cy.get('[data-testid="x-axis-mode-selector"]').click();
    cy.get('[data-testid="x-axis-mode-e2e"]').should('have.text', '端到端延迟').click();
    cy.get('[data-testid="x-axis-mode-selector"]')
      .should('contain.text', '端到端延迟')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', '端到端延迟');
    cy.get('[data-testid="share-button"]')
      .should('be.visible')
      .and('have.attr', 'title', '分享当前视图');
    cy.get('[data-testid="inference-view-toggle-0"]').should('be.visible').contains('表格').click();
    cy.get('[data-testid="inference-results-table"]')
      .should('contain.text', '芯片')
      .and('contain.text', '精度')
      .and('contain.text', '精度');
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="inference-results-table"]').should('contain.text', '并发数');
    cy.get('[data-testid="export-button"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', '下载图表');
    expectNoPageOverflow();
  });

  it('localizes architecture and changelog overlays without changing technical model data', () => {
    cy.viewport(1440, 900);
    cy.get('[data-testid="model-architecture-link"]')
      .should('have.attr', 'aria-label')
      .and('match', /^了解 .*DeepSeek.*模型架构$/u);
    cy.get('[data-testid="model-architecture-link"]')
      .should('have.attr', 'href')
      .and('match', /^\/zh\/model\//u);
    cy.contains('button', '变更日志').should('be.visible').click();
    cy.contains('说明').should('be.visible');
  });
});
