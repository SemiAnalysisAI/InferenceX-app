import { unlockAgenticGate } from '../support/e2e';

const distribution = (values: {
  median: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
}) => ({
  bins: [
    { x0: 0, x1: 10, count: 5 },
    { x0: 10, x1: 100, count: 15 },
  ],
  stats: {
    count: 20,
    min: 0,
    mean: 40,
    ...values,
  },
});

const LAYOUT_DATASET = {
  id: 'layout-dataset',
  slug: 'layout-dataset',
  label: 'Layout dataset',
  variant: 'full',
  description: null,
  hf_url: null,
  license: 'apache-2.0',
  conversation_count: 0,
  summary: {},
  chart_data: {},
  ingested_at: '2026-06-23T00:00:00Z',
};

describe('Dataset distribution percentiles', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets/test-dataset', {
      body: {
        id: 'test-dataset',
        slug: 'test-dataset',
        label: 'Test dataset',
        variant: 'full',
        description: null,
        hf_url: null,
        license: 'apache-2.0',
        conversation_count: 1,
        summary: {
          mainTurns: 20,
          subagentGroups: 0,
          subagentTurns: 0,
          medianRequestsPerConversation: 12,
          meanRequestsPerConversation: 14.6,
          medianSubagentsPerTrace: 3,
          meanSubagentsPerTrace: 4.8,
          cachedPct: 0.5,
          totalIn: 1000,
          totalOut: 200,
        },
        chart_data: {
          version: 2,
          inputTokensPerTurn: distribution({
            median: 100,
            p75: 200,
            p90: 300,
            p95: 400,
            max: 500,
          }),
          outputTokensPerTurn: distribution({
            median: 10,
            p75: 20,
            p90: 30,
            p95: 40,
            max: 50,
          }),
          uncachedInputTokensPerTurn: distribution({
            median: 0,
            p75: 64,
            p90: 128,
            p95: 256,
            max: 512,
          }),
          subagentInputTokensPerRequest: distribution({
            median: 1000,
            p75: 2000,
            p90: 3000,
            p95: 4000,
            max: 5000,
          }),
          subagentOutputTokensPerRequest: distribution({
            median: 100,
            p75: 200,
            p90: 300,
            p95: 400,
            max: 500,
          }),
          turnsPerConversation: distribution({
            median: 12,
            p75: 20,
            p90: 30,
            p95: 40,
            max: 50,
          }),
        },
        ingested_at: '2026-06-23T00:00:00Z',
      },
    });
    cy.intercept('GET', '/api/v1/datasets/test-dataset/conversations*', {
      body: { total: 0, items: [] },
    });
    cy.visit('/agentx/test-dataset', { onBeforeLoad: unlockAgenticGate });
  });

  it('shows P50/P75/P90/P95 for ISL, OSL, and uncached input', () => {
    const expected = [
      ['Input tokens per turn', ['p50 100', 'p75 200', 'p90 300', 'p95 400']],
      ['Output tokens per turn', ['p50 10', 'p75 20', 'p90 30', 'p95 40']],
      ['Uncached input tokens per request', ['p50 0', 'p75 64', 'p90 128', 'p95 256']],
    ] as const;

    for (const [title, percentiles] of expected) {
      cy.contains('[data-slot="card"]', title).within(() => {
        for (const percentile of percentiles) cy.contains(percentile).should('be.visible');
        cy.get('svg line[stroke="#3b82f6"]').should('exist');
        cy.get('svg line[stroke="#22c55e"]').should('exist');
        cy.get('svg line[stroke="#f59e0b"]').should('exist');
        cy.get('svg line[stroke="#ef4444"]').should('exist');
      });
    }
  });

  it('shows median and mean model requests per conversation', () => {
    cy.contains('dt', 'Median requests / convo').next('dd').should('have.text', '12');
    cy.contains('dt', 'Mean requests / convo').next('dd').should('have.text', '14.6');
  });

  it('summarizes subagents per trace instead of charting group counts', () => {
    cy.contains('dt', 'Median subagents / trace').next('dd').should('have.text', '3');
    cy.contains('dt', 'Mean subagents / trace').next('dd').should('have.text', '4.8');
    cy.contains('Subagent groups per conversation').should('not.exist');
  });

  it('shows ISL and OSL distributions for inner subagent requests only', () => {
    const expected = [
      ['Subagent request ISL', ['p50 1.0k', 'p75 2.0k', 'p90 3.0k', 'p95 4.0k']],
      ['Subagent request OSL', ['p50 100', 'p75 200', 'p90 300', 'p95 400']],
    ] as const;

    for (const [title, percentiles] of expected) {
      cy.contains('[data-slot="card"]', title).within(() => {
        cy.contains('Inner subagent requests only').should('be.visible');
        for (const percentile of percentiles) cy.contains(percentile).should('be.visible');
      });
    }
  });

  it('localizes Chinese distribution units, statistics, and conversation controls', () => {
    cy.visit('/zh/agentx/test-dataset', { onBeforeLoad: unlockAgenticGate });

    cy.get('input[aria-label="搜索对话"]').should('have.attr', 'placeholder', '按 ID 搜索…');
    cy.get('button[aria-label="对话排序"]').should('exist');
    cy.contains('[data-slot="card"]', '每对话轮次数').within(() => {
      cy.contains('最大值 50 轮次').should('be.visible');
      cy.contains('max').should('not.exist');
      cy.get('[data-testid="distribution-unit"]').should('have.text', '轮次');
      cy.get('rect[role="slider"]')
        .should('have.attr', 'aria-label', '每对话轮次数')
        .focus()
        .should('have.attr', 'aria-valuetext')
        .and('include', '范围：0–10 轮次');
      cy.get('[role="tooltip"]').should('be.visible').and('contain.text', '数量5');
    });
  });

  it('keeps the conversation table reachable through internal scrolling on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/agentx/test-dataset', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="dataset-conversations-table-scroll"]').should(($scroll) => {
      const element = $scroll[0];
      expect(getComputedStyle(element).overflowX).to.eq('auto');
      expect(element.scrollWidth).to.be.greaterThan(element.clientWidth);
    });
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
    });
  });
});

describe('Dataset detail loading stability', () => {
  for (const path of ['/agentx/layout-dataset', '/zh/agentx/layout-dataset']) {
    it(`keeps the footer below the viewport while ${path} loads`, () => {
      cy.intercept('GET', '/api/v1/datasets/layout-dataset', {
        delay: 1500,
        body: LAYOUT_DATASET,
      }).as('dataset');
      cy.intercept('GET', '/api/v1/datasets/layout-dataset/conversations*', {
        body: { total: 0, items: [] },
      });

      cy.visit(path, { onBeforeLoad: unlockAgenticGate });
      cy.get('[data-testid="dataset-detail-loading"]').should('be.visible');
      cy.get('[data-testid="footer"]').then(($footer) => {
        cy.window().then((win) => {
          expect($footer[0].getBoundingClientRect().top).to.be.at.least(win.innerHeight);
        });
      });

      cy.wait('@dataset');
      cy.contains('h1', 'Layout dataset').should('be.visible');
    });
  }

  it('renders a localized request error separately from 404 and retries at 390px', () => {
    let attempts = 0;
    cy.intercept('GET', '/api/v1/datasets/layout-dataset', (request) => {
      attempts += 1;
      request.reply(
        attempts <= 2 ? { statusCode: 503, body: {} } : { statusCode: 200, body: LAYOUT_DATASET },
      );
    });
    cy.intercept('GET', '/api/v1/datasets/layout-dataset/conversations*', {
      body: { total: 0, items: [] },
    });

    cy.viewport(390, 844);
    cy.visit('/zh/agentx/layout-dataset', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="dataset-detail-error"]', { timeout: 10_000 })
      .should('have.attr', 'data-locale', 'zh')
      .and('have.attr', 'role', 'alert');
    cy.get('[data-testid="dataset-detail-not-found"]').should('not.exist');
    cy.get('[data-testid="dataset-detail-error"] a').should('have.attr', 'href', '/zh/agentx');
    cy.contains('[data-testid="dataset-detail-error"] button', '重试').click();
    cy.contains('h1', 'Layout dataset').should('be.visible');
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
    });
  });

  it('reserves the not-found state for a successful 404 response', () => {
    cy.intercept('GET', '/api/v1/datasets/missing-dataset', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/datasets/missing-dataset/conversations*', { statusCode: 404 });

    cy.viewport(1280, 800);
    cy.visit('/agentx/missing-dataset', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="dataset-detail-not-found"]')
      .should('have.attr', 'data-locale', 'en')
      .and('be.visible');
    cy.get('[data-testid="dataset-detail-error"]').should('not.exist');
  });
});
