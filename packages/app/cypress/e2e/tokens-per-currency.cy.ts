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
