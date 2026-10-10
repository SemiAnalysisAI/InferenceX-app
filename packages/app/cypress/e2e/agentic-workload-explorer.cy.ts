// The Agentic Workload Explorer reads a separate ProxyTrace snapshot database
// that is not available in CI, so its page-owned API is stubbed with small
// responses captured from the snapshot (cypress/fixtures/agentic-workload-explorer).
const API = '/api/v1/agentic-workload-explorer';

// Synthetic daily rollup: deterministic coverage without the private snapshot DB.
function stubTrends() {
  const days = ['2026-09-23', '2026-09-24', '2026-09-25'];
  cy.intercept('GET', `${API}/trends?*`, {
    dailyModel: days.flatMap((day, index) =>
      ['model-a', 'model-b'].map((model) => ({
        day,
        model,
        requestCount: 100 + index * 20,
        inputTokens: 10000,
        outputTokens: 2000,
        cacheReadInputTokens: 30000,
        cacheWriteTokens: 1000,
      })),
    ),
    dailyCompaction: days.map((day) => ({
      day,
      requestCount: 1000,
      sessionCount: 10,
      candidateCount: 2,
    })),
    dailyCliVersion: days.map((day) => ({ day, cliVersion: '2.0.0', sessionCount: 10 })),
    dailyLatency: days.map((day) => ({
      day,
      durationP50: 1000,
      durationP95: 1500,
      ttftP50: 500,
      sampleCount: 100,
      streamingSampleCount: 100,
    })),
    meta: {
      compactionWindowDays: 30,
      latencyWindowDays: 30,
      compactionIdleGapMs: 60000,
      compactionMinPrevCacheRead: 1000,
      compactionCliffDropRatio: 0.5,
      generatedAt: '2026-09-26T08:07:00Z',
    },
  }).as('trends');
  cy.intercept('GET', `${API}/trends/harness-versions*`, []).as('harnessVersions');
}

function stubExplorerApi() {
  cy.intercept('GET', `${API}/overview*`, {
    fixture: 'agentic-workload-explorer/overview.json',
  }).as('overview');
  cy.intercept('GET', `${API}/sessions?*`, {
    fixture: 'agentic-workload-explorer/sessions.json',
  }).as('sessions');
}

describe('Agentic Workload Explorer', () => {
  beforeEach(stubExplorerApi);

  it('renders the overview inside the dashboard shell and navigates to sessions', () => {
    cy.visit('/agentic-workload-explorer');
    cy.wait('@overview');
    cy.get('[data-testid="agentic-workload-explorer"]')
      .should('contain.text', 'Agentic Workload Explorer')
      .and('contain.text', 'Frozen snapshot');
    // The explorer has its own section nav, so the dashboard tab strip is hidden.
    cy.get('[data-testid="chart-section-tabs"]').should('not.exist');
    cy.get('[data-testid="mobile-chart-select"]').should('not.exist');
    cy.get('nav[aria-label="Agentic Workload Explorer sections"]')
      .contains('a', 'Overview')
      .should('have.attr', 'aria-current', 'page');

    cy.get('nav[aria-label="Agentic Workload Explorer sections"]')
      .contains('a', 'Sessions')
      .click();
    cy.location('pathname').should('eq', '/agentic-workload-explorer/sessions');
    cy.wait('@sessions');
    cy.get('a[href^="/agentic-workload-explorer/sessions/"]').should('have.length.at.least', 1);
  });

  it('keeps Chinese pages and in-explorer links under /zh', () => {
    cy.visit('/zh/agentic-workload-explorer/sessions');
    cy.wait('@sessions');
    cy.get('[data-testid="agentic-workload-explorer"]').should('contain.text', '冻结快照');
    cy.get('nav[aria-label="Agentic Workload Explorer 分区"]')
      .contains('a', '会话')
      .should('have.attr', 'aria-current', 'page');
    cy.get('a[href^="/zh/agentic-workload-explorer/sessions/"]').should('have.length.at.least', 1);
  });

  it('renders shared D3 layers and supports shared zoom, reset and expansion', () => {
    stubTrends();
    cy.visit('/agentic-workload-explorer/trends');
    cy.wait('@trends');
    cy.get('[data-testid="d3-chart-svg"]').should('have.length', 6);
    cy.get('.stacked-segment').should('have.length', 6);
    cy.get('.line-path').should('have.length.at.least', 1);
    cy.get('button[aria-label="Expand chart: Model Mix Over Time"]').click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('.stacked-segment')
        .first()
        .invoke('attr', 'height')
        .then((height) => {
          cy.get('[data-testid="d3-chart-svg"]').trigger('wheel', {
            deltaY: -350,
            shiftKey: true,
            clientX: 400,
            clientY: 400,
          });
          cy.get('.stacked-segment')
            .first()
            .should(($bar) => {
              expect(Number($bar.attr('height'))).to.be.greaterThan(Number(height));
            });
          cy.get('[data-testid="zoom-reset-button"]').click();
          cy.get('.stacked-segment')
            .first()
            .should(($bar) => {
              expect(Number($bar.attr('height'))).to.be.closeTo(Number(height), 0.01);
            });
        });
      cy.get('[data-testid="export-button"]').should('be.enabled');
      cy.contains('button', 'Close').click();
    });
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('keeps the shared version selector keyboard-accessible on Chinese mobile pages', () => {
    stubTrends();
    cy.viewport(375, 900);
    cy.visit('/zh/agentic-workload-explorer/trends');
    cy.wait('@trends');
    cy.get('[role="combobox"]').first().focus().type('{enter}');
    cy.get('[role="option"]').should('have.length.at.least', 2);
    cy.get('[role="option"]').last().click();
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('[data-testid="d3-chart-svg"]').should('have.length', 6);
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(375);
    });
  });
});
