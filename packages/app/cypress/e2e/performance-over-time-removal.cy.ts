/** Regression coverage for removal of the inference-chart trend drill-down. */
describe('Performance Over Time removal', () => {
  beforeEach(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('does not open a trend popup when a scatter point is double-clicked', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .dblclick({ force: true });

    cy.contains('Performance Over Time').should('not.exist');
    cy.get('[data-testid="tracked-config-badge"]').should('not.exist');
  });

  it('does not offer Track Over Time in a pinned point tooltip', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .click({ force: true });

    cy.contains('Track Over Time').should('not.exist');
  });
});
