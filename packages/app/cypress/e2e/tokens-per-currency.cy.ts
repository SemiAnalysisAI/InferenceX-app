/**
 * The dashboard opens on Hyperscaler ownership Total Tokens per $1 TCO, so
 * the first view ranks hardware on infrastructure purchasing power without
 * assuming a token sale price. Token Revenue per GPU Hour stays available from
 * the metric selector, and selecting it reveals the token sale price source.
 * Fixed-sequence Quick Filters remain available from the chart legend.
 */
describe('Tokens per currency and agentic controls', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('defaults the y-axis to TCO total tokens per dollar and preserves hardware comparison', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Total Tokens per $1 TCO (Owning - Hyperscaler)',
    );
    // The default axis derives from measured throughput and TCO alone, so the
    // token sale price source does not apply and stays hidden.
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 1);
  });

  it('reveals the token sale price source once Token Revenue per GPU Hour is selected', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
    cy.get('[role="option"]').contains('Token Revenue per GPU Hour').click({ force: true });
    cy.get('[data-testid="token-revenue-price-source"]').should('contain.text', 'Normalized');
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
      .contains('Total Tokens per ¥1 TCO (Owning - Hyperscaler)')
      .click({ force: true });
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('keeps Quick Filters for a fixed-sequence scenario', () => {
    cy.visit('/inference?i_seq=8k%2F1k');
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-spec-mtp"]').should('exist');
  });
});
