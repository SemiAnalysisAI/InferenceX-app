/**
 * The dashboard opens on Hyperscaler ownership Total Tokens per $1 TCO, so
 * the first view ranks hardware on infrastructure purchasing power without
 * assuming a token sale price. Token Revenue per GPU Hour stays available from
 * the metric selector, and selecting it reveals the token sale price source.
 * Fixed-sequence Quick Filters remain available from the chart legend.
 */
describe('Tokens per dollar and agentic controls', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('defaults the y-axis to TCO total tokens per dollar and preserves hardware comparison', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Total Tokens per $1 TCO',
    );
    cy.get('[data-testid="cost-tier-selector"]').should(
      'contain.text',
      'Owning at Large Hyperscaler Volume',
    );
    // The default axis derives from measured throughput and TCO alone, so the
    // token sale price source does not apply and stays hidden.
    cy.get('[data-testid="token-revenue-price-source"]').should('not.exist');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 1);

    cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
    cy.get('[data-slot="select-item"]')
      .contains('Token Revenue per GPU Hour')
      .click({ force: true });
    cy.get('[data-testid="token-revenue-price-source"]').should('contain.text', 'Normalized');
  });
});
