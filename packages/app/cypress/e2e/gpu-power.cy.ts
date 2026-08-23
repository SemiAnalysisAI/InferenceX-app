/** Send the ↑↑↓↓ unlock sequence to reveal the Hidden popover. */
function unlockPowerX() {
  cy.get('body').type('{uparrow}{uparrow}{downarrow}{downarrow}');
}

/** Open the Hidden popover (must be unlocked first) and click the PowerX link. */
function openPowerX() {
  cy.get('[data-testid="tab-trigger-hidden"]').click();
  cy.get('[data-testid="tab-trigger-gpu-metrics"]').click();
}

describe('PowerX', () => {
  beforeEach(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
  });

  it('Hidden popover (and PowerX link inside it) is not present by default', () => {
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('not.exist');
  });

  it('↑↑↓↓ key sequence reveals the Hidden popover containing PowerX', () => {
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    unlockPowerX();
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('contain.text', 'PowerX');
  });

  it('unlock persists across page reloads via localStorage', () => {
    unlockPowerX();
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.reload();
    cy.get('[data-testid="tab-trigger-hidden"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-hidden"]').click();
    cy.get('[data-testid="tab-trigger-gpu-metrics"]').should('be.visible');
  });

  describe('(unlocked)', () => {
    beforeEach(() => {
      cy.visit('/inference', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          win.localStorage.setItem('inferencex-feature-gate', '1');
        },
      });
    });

    it('clicking the gpu-metrics tab activates it and shows content', () => {
      openPowerX();
      cy.url().should('include', '/gpu-metrics');
      cy.get('[data-testid="gpu-metrics-display"]').find('h2').should('contain.text', 'PowerX');
    });

    it('navigates to gpu-metrics URL path', () => {
      openPowerX();
      cy.url().should('include', 'gpu-metrics');
    });

    it('renders the run ID input pre-filled and Load button enabled', () => {
      openPowerX();
      cy.get('[data-testid="gpu-metrics-run-input"]').should('not.have.value', '');
      cy.get('[data-testid="gpu-metrics-load-button"]').should('not.be.disabled');
      cy.get('[data-testid="gpu-metrics-load-button"]').should('contain.text', 'Load');
    });

    it('disables Load button when input is cleared', () => {
      openPowerX();
      cy.get('[data-testid="gpu-metrics-run-input"]').clear();
      cy.get('[data-testid="gpu-metrics-load-button"]').should('be.disabled');
    });

    it('shows error card with message when invalid run ID is submitted', () => {
      openPowerX();
      cy.get('[data-testid="gpu-metrics-run-input"]').clear().type('invalid-id');
      cy.get('[data-testid="gpu-metrics-load-button"]').click();
      cy.get('[data-testid="gpu-metrics-error"]').should('be.visible');
      cy.get('[data-testid="gpu-metrics-error"]').find('p').should('contain.text', 'numeric');
    });

    it('renders description text and PowerX heading', () => {
      openPowerX();
      cy.get('[data-testid="gpu-metrics-display"]').find('h2').should('contain.text', 'PowerX');
      cy.get('[data-testid="gpu-metrics-display"]')
        .should('contain.text', 'gpu_metrics')
        .and('contain.text', 'GitHub Actions run ID');
    });
  });
});

const gpuMetricsResponse = {
  runInfo: {
    id: 12345,
    name: 'GPU metrics test',
    branch: 'feat/test',
    sha: 'abc123',
    createdAt: '2026-08-23T10:00:00Z',
    url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345',
    conclusion: 'success',
    status: 'completed',
  },
  artifacts: [
    {
      name: 'gpu_metrics_h200_test',
      data: [
        {
          timestamp: '2026-08-23T10:00:00Z',
          index: 0,
          power: 250,
          temperature: 65,
          smClock: 1900,
          memClock: 1500,
          gpuUtil: 90,
          memUtil: 70,
        },
        {
          timestamp: '2026-08-23T10:00:01Z',
          index: 0,
          power: 260,
          temperature: 66,
          smClock: 1910,
          memClock: 1500,
          gpuUtil: 92,
          memUtil: 71,
        },
      ],
    },
  ],
};

describe('PowerX Chinese route', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it('localizes metric registries, chart internals, controls, dates, legends, and statistics', () => {
    cy.intercept('GET', '**/api/gpu-metrics?runId=12345', gpuMetricsResponse).as('gpuMetrics');
    cy.visit('/zh/gpu-metrics?gm_runId=12345', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.wait('@gpuMetrics');
    cy.get('[data-testid="gpu-metrics-metric-select"]').should('contain.text', '功耗 (W)');
    cy.get('[data-testid="gpu-metrics-chart-container"] [role="tablist"]').should(
      'have.attr',
      'aria-label',
      '显示模式',
    );
    cy.get('[data-testid="gpu-metrics-share-button"]').should('have.attr', 'title', '复制分享链接');
    cy.get('[data-testid="gpu-metrics-display"]')
      .should('contain.text', '2026/8/23')
      .and('contain.text', '芯片 0')
      .and('contain.text', '每芯片统计信息')
      .and('contain.text', '样本数')
      .and('contain.text', '最小值');
    cy.get('[data-testid="gpu-metrics-chart-svg"] svg')
      .should('contain.text', '秒')
      .and('contain.text', '功耗 (W)');
    cy.get('[data-testid="gpu-metrics-chart-svg"]').should('contain.text', '点击数据点固定提示框');
    cy.get('[data-testid="gpu-metrics-chart-svg"] svg .point')
      .first()
      .trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', '芯片 0')
      .and('contain.text', '功耗：');
    cy.get('[data-testid="gpu-metrics-display"] table').contains('button', '样本数').click();
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/gpu-metrics');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/gpu-metrics');
  });

  it('supports the correlation click path at 1440px', () => {
    cy.viewport(1440, 900);
    cy.intercept('GET', '**/api/gpu-metrics?runId=12345', gpuMetricsResponse).as('gpuMetrics');
    cy.visit('/zh/gpu-metrics?gm_runId=12345', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.wait('@gpuMetrics');
    cy.get('button[title="相关性散点图"]').click();
    cy.get('[data-testid="gpu-metrics-correlation"] svg .point')
      .first()
      .trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', '功耗：')
      .and('contain.text', '温度：');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('hides upstream error details and retries the selected run', () => {
    let attempts = 0;
    cy.intercept('GET', '**/api/gpu-metrics?runId=12345', (req) => {
      attempts += 1;
      req.reply(
        attempts === 1
          ? { statusCode: 500, body: { error: 'sensitive upstream detail' } }
          : { statusCode: 200, body: gpuMetricsResponse },
      );
    }).as('gpuMetricsRetry');
    cy.visit('/zh/gpu-metrics?gm_runId=12345', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.wait('@gpuMetricsRetry');
    cy.get('[data-testid="gpu-metrics-error"]')
      .should('contain.text', '无法加载芯片指标。')
      .and('not.contain.text', 'sensitive upstream detail');
    cy.get('[data-testid="gpu-metrics-error"]').contains('button', '重试').click();
    cy.wait('@gpuMetricsRetry');
    cy.get('[data-testid="gpu-metrics-chart-container"]').should('be.visible');
  });

  it('shows a localized empty-artifact state and keeps mobile width bounded', () => {
    cy.intercept('GET', '**/api/gpu-metrics?runId=12345', {
      ...gpuMetricsResponse,
      artifacts: [],
    });
    cy.visit('/zh/gpu-metrics?gm_runId=12345', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="gpu-metrics-empty"]').should('contain.text', '没有可显示的芯片指标产物');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('keeps localized chart controls contained at 375px', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '**/api/gpu-metrics?runId=12345', gpuMetricsResponse).as('gpuMetrics');
    cy.visit('/zh/gpu-metrics?gm_runId=12345', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.wait('@gpuMetrics');
    cy.get('[data-testid="gpu-metrics-metric-select"]').should('contain.text', '功耗 (W)');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
