/**
 * The dashboard now opens on tokens purchasable per $1 USD, and the same
 * quantities are also available priced in yuan. Quick Filters drop out of the
 * agentic scenario, where the curve is already collapsed to one series per
 * model, SKU, and engine.
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
      .contains('Total Tokens per ¥1 (Owning - Hyperscaler)')
      .click({ force: true });
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('keeps Quick Filters for a fixed-sequence scenario', () => {
    // The agentic half of this rule lives in
    // cypress/component/inference-chart-controls.cy.tsx: `?i_seq=agentic-traces`
    // only sticks when the model has agentic availability, which the e2e
    // fixture set does not carry, so the sequence falls back here.
    cy.visit('/inference?i_seq=8k%2F1k');
    cy.get('[data-testid="quick-filters"]').should('exist');
  });
});
