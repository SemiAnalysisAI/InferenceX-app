// The Agentic Workload Explorer reads a separate ProxyTrace snapshot database
// that is not available in CI, so its page-owned API is stubbed with small
// responses captured from the snapshot (cypress/fixtures/agentic-workload-explorer).
const API = '/api/v1/agentic-workload-explorer';

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
});
