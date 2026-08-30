/**
 * The dashboard opens on normalized token revenue per GPU hour so fixed-price
 * scenarios still compare hardware throughput. API and infrastructure
 * purchasing-power metrics remain available. Fixed-sequence Quick Filters
 * remain available from the chart legend.
 */
describe('Tokens per currency and agentic controls', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('defaults the y-axis to token revenue and preserves hardware comparison', () => {
    cy.visit('/inference');
    cy.get('[data-testid="yaxis-metric-selector"]').should(
      'contain.text',
      'Token Revenue per GPU Hour',
    );
    cy.get('[data-testid="token-revenue-price-source"]').should('contain.text', 'Normalized');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 1);
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
    cy.get('[data-testid="scatter-quick-filters"]').click();
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-spec-mtp"]').should('exist');
  });
});
