import { expandLegendAdvanced } from '../support/legend-advanced';
import { assertShareLinkParams } from '../support/share-link';

describe('Framework Line Label', () => {
  it('defaults on and persists independently of Line Labels through share links', () => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro');
    cy.get('[data-testid="scatter-graph"]', { timeout: 60000 }).should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-framework-label').should('have.attr', 'data-state', 'checked');
    cy.get('.line-label .ll-engine').should('have.length.greaterThan', 0);
    cy.get('.roofline-path').then(($curves) => {
      const paths = [...$curves].map((curve) => curve.getAttribute('d'));
      cy.get('#scatter-framework-label').click();
      cy.get('.line-label .ll-engine').should('not.exist');
      cy.get('.line-label .ll-gpu').should('have.length.greaterThan', 0);
      cy.get('.roofline-path').should(($after) => {
        expect([...$after].map((curve) => curve.getAttribute('d'))).to.deep.equal(paths);
      });
    });
    assertShareLinkParams({ i_frameworklabel: '0' });
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_frameworklabel=0');
    cy.reload();
    cy.get('[data-testid="scatter-graph"]', { timeout: 60000 }).should('be.visible');
    expandLegendAdvanced();
    cy.get('#scatter-framework-label').should('have.attr', 'data-state', 'unchecked');
    cy.get('.line-label .ll-engine').should('not.exist');
    cy.get('#scatter-line-labels').click();
    cy.get('.line-label').should('not.exist');
    cy.get('#scatter-line-labels').click();
    cy.get('.line-label .ll-gpu').should('have.length.greaterThan', 0);
    cy.get('.line-label .ll-engine').should('not.exist');
    cy.get('#scatter-framework-label').click();
    cy.get('.line-label .ll-engine').should('have.length.greaterThan', 0);
    assertShareLinkParams({ i_frameworklabel: null });
  });
});
