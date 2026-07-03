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

describe('Dataset distribution percentiles', () => {
  before(() => {
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
        },
        ingested_at: '2026-06-23T00:00:00Z',
      },
    });
    cy.intercept('GET', '/api/v1/datasets/test-dataset/conversations*', {
      body: { total: 0, items: [] },
    });
    cy.visit('/datasets/test-dataset', { onBeforeLoad: unlockAgenticGate });
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
});
