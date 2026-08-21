/**
 * The dashboard now opens on tokens purchasable per $1 USD, and the same
 * quantities are also available priced in yuan. Fixed-sequence Quick Filters
 * remain available through their collapsed disclosure.
 */
describe('Tokens per currency and agentic controls', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('defaults the y-axis to total tokens per $1 USD', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Total Tokens per $1 USD (Owning - Hyperscaler)',
    );
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('still honors an explicit ?i_metric=, so shared links are unaffected', () => {
    cy.visit('/inference?i_metric=y_tpPerGpu');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Token Throughput per Chip',
    );
  });

  it('offers the same quantities priced in yuan', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]')
      .contains('Total Tokens per ¥1 RMB (Owning - Hyperscaler)')
      .click({ force: true });
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('keeps Quick Filters for a fixed-sequence scenario', () => {
    cy.visit('/inference?i_seq=8k%2F1k');
    cy.get('[data-testid="quick-filters-trigger"]')
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="quick-filter-spec-mtp"]').should('exist');
  });
});
