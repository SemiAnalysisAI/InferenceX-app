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

  it('shuffle colors button is hidden when high contrast is off', () => {
    cy.get('[data-testid="scatter-shuffle-colors"]').should('not.exist');
  });

  it('visiting with i_hc=1 applies high contrast on load', () => {
    cy.visit('/inference?i_hc=1');
    cy.get('[data-testid="scatter-graph"]').should('exist');
    cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
  });

  it('shuffle colors button appears when high contrast is enabled', () => {
    // Still on /?i_hc=1 from previous test
    cy.get('[data-testid="scatter-shuffle-colors"]').should('exist');
    cy.get('[data-testid="scatter-shuffle-colors"]').should('contain.text', 'Shuffle Colors');
  });

  it('clicking shuffle colors changes the point colors', () => {
    // Still on /?i_hc=1 from previous test
    cy.get('[data-testid="scatter-graph"] .visible-shape')
      .first()
      .invoke('attr', 'fill')
      .then((colorBefore) => {
        cy.get('[data-testid="scatter-shuffle-colors"]').first().click();
        cy.get('[data-testid="scatter-graph"] .visible-shape')
          .first()
          .invoke('attr', 'fill')
          .should('not.equal', colorBefore);
      });
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

  it('historical trends high contrast toggle enables HC and shows shuffle button', () => {
    cy.visit('/historical?i_hc=1');
    cy.get('[data-testid="historical-trends-display"]').should('exist');
    cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'checked');
    cy.get('[data-testid="historical-shuffle-colors"]').should('exist');
    cy.get('[data-testid="historical-shuffle-colors"]').should('contain.text', 'Shuffle Colors');
  });

  it('historical trends shuffle button is hidden when high contrast is off', () => {
    cy.visit('/historical');
    cy.get('[data-testid="historical-trends-display"]').should('exist');
    cy.get('[data-testid="historical-shuffle-colors"]').should('not.exist');
  });
});
