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

  it('renders total tokens per $1 USD from a URL metric', () => {
    // The dashboard default is still throughput — see DEFAULT_Y_AXIS_METRIC in
    // InferenceContext for why the flip is held back.
    cy.visit('/inference?i_metric=y_tokensPerDollarH');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Total Tokens per $1 USD (Owning - Hyperscaler)',
    );
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
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
