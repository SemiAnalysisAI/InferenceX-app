describe('Chart Section Tabs — E2E', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/evaluation');

    cy.get('[data-testid="tab-trigger-historical"]').click();
    cy.url().should('include', '/historical');

    cy.get('[data-testid="tab-trigger-calculator"]').click();
    cy.url().should('include', '/calculator');

    cy.get('[data-testid="tab-trigger-reliability"]').click();
    cy.url().should('include', '/reliability');

    cy.get('[data-testid="tab-trigger-gpu-specs"]').click();
    cy.url().should('include', '/gpu-specs');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/inference');
  });

  it('shows mobile chart select dropdown on small viewport', () => {
    cy.viewport(375, 812);
    cy.visit('/inference');
    cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
  });
});
