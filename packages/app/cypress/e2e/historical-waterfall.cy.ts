describe('Historical improvement waterfall', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/v1/benchmarks/history?*', {
      fixture: 'api/benchmarks-history.json',
    }).as('history');
    cy.visit('/historical?g_model=DeepSeek-R1-0528');
    cy.wait('@history');
    cy.get('[data-testid="historical-trend-figure"] svg').should('be.visible');
  });

  it('keeps the line chart default, switches views, and changes series', () => {
    cy.get('[data-testid="historical-view-line"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('[data-testid="waterfall-chart-svg"]').should('be.visible');
    cy.get('[data-testid="waterfall-step"][data-kind="baseline"]').should('have.length', 1);
    cy.get('[data-testid="waterfall-step"][data-kind="best"]').should('have.length', 1);
    cy.get('[data-testid="waterfall-series"] option').then(($options) => {
      if ($options.length > 1) {
        cy.get('[data-testid="waterfall-series"]').select($options.eq(1).val() as string);
      }
    });
    cy.get('[data-testid="historical-view-line"]').click();
    cy.get('[data-testid="trend-chart-svg"]').should('be.visible');
    cy.get('[data-testid="waterfall-chart-svg"]').should('not.exist');
  });

  it('uses internal horizontal scrolling without widening a 375px page', () => {
    cy.viewport(375, 844);
    cy.get('[data-testid="historical-view-waterfall"]').click();
    cy.get('[data-testid="waterfall-chart-svg"]').should('exist');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
    });
    cy.get('[data-chart-scroll]').should('have.attr', 'tabindex', '0');
  });
});
