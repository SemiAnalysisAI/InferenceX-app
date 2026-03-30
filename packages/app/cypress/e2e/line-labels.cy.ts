describe('Line Labels Toggle', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    // Wait for chart to load
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('Line Labels toggle exists in the legend', () => {
    cy.get('#scatter-line-labels').should('exist');
    cy.get('label[for="scatter-line-labels"]').should('contain.text', 'Line Labels');
  });

  it('Line Labels toggle is off by default', () => {
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('toggling Line Labels on renders label elements on the chart', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    // Line label groups should appear in the SVG
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);
  });

  it('line labels have colored background rects and text', () => {
    // Each line label group should contain a background rect and text
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-bg').should(
      'have.length.greaterThan',
      0,
    );
    cy.get('[data-testid="scatter-graph"] svg g.line-label .ll-text').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('toggling Line Labels off removes label elements', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'unchecked');

    // Line label groups should no longer exist
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length', 0);
  });

  it('Line Labels can be enabled alongside Gradient Labels', () => {
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Both should be checked
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Line labels should still render
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);

    // Reset
    cy.get('#scatter-line-labels').click();
    cy.get('#scatter-gradient-labels').click();
  });

  it('URL param i_linelabel=1 enables line labels on load', () => {
    cy.visit('/inference?i_linelabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-line-labels').should('have.attr', 'data-state', 'checked');

    // Labels should be rendered
    cy.get('[data-testid="scatter-graph"] svg g.line-label').should('have.length.greaterThan', 0);
  });
});
