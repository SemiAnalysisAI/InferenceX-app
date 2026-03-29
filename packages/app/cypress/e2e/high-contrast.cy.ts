describe('High Contrast Mode', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="scatter-graph"]').should('exist');
  });

  it('page loads without high contrast by default', () => {
    cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
  });

  it('visiting with i_hc=1 applies high contrast on load', () => {
    cy.visit('/inference?i_hc=1');
    cy.get('[data-testid="scatter-graph"]').should('exist');
    cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });

  it('multiple high contrast params can coexist in URL', () => {
    cy.visit('/inference?i_hc=1&r_hc=1&e_hc=1');
    cy.get('[data-testid="scatter-graph"]').should('exist');
    cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });

  it('visiting reliability with r_hc=1 applies to reliability chart', () => {
    cy.visit('/reliability?r_hc=1');
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
    cy.get('#reliability-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });

  it('visiting evaluation with e_hc=1 applies to evaluation chart', () => {
    cy.visit('/evaluation?e_hc=1');
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');
    cy.get('#eval-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });

  it('historical trends tab has high contrast switch', () => {
    cy.visit('/historical');
    cy.get('[data-testid="historical-trends-display"]').should('exist');
    cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
  });

  it('historical trends high contrast toggle enables HC via URL', () => {
    cy.visit('/historical?i_hc=1');
    cy.get('[data-testid="historical-trends-display"]').should('exist');
    cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });
});
