describe('Chart Section Tabs', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
  });

  it('shows the tabs list on desktop', () => {
    cy.get('[data-testid="chart-section-tabs"]').should('be.visible');
  });

  it('has three tab triggers: Inference, Evaluation, Reliability', () => {
    cy.get('[data-testid="tab-trigger-inference"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-evaluation"]').should('be.visible');
    cy.get('[data-testid="tab-trigger-reliability"]').should('be.visible');
  });

  it('Inference Performance tab is active by default', () => {
    cy.get('[data-testid="tab-trigger-inference"]').should('have.attr', 'data-state', 'active');
  });

  it('Evaluation and Reliability tabs are inactive by default', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').should('have.attr', 'data-state', 'inactive');
    cy.get('[data-testid="tab-trigger-reliability"]').should('have.attr', 'data-state', 'inactive');
  });

  it('clicking Evaluation tab makes it active', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.get('[data-testid="tab-trigger-evaluation"]').should('have.attr', 'data-state', 'active');
    cy.get('[data-testid="tab-trigger-inference"]').should('have.attr', 'data-state', 'inactive');
  });

  it('switching to Evaluation shows Accuracy Evals content', () => {
    // Already on evaluation from previous test
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');
  });

  it('clicking Reliability tab makes it active', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').click();
    cy.get('[data-testid="tab-trigger-reliability"]').should('have.attr', 'data-state', 'active');
  });

  it('switching to Reliability shows GPU Reliability content', () => {
    // Already on reliability from previous test
    cy.get('[data-testid="reliability-chart-display"]').should('exist');
  });

  it('clicking back to Inference tab works', () => {
    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.get('[data-testid="tab-trigger-inference"]').should('have.attr', 'data-state', 'active');
  });

  it('switching to Inference shows Inference Performance content', () => {
    // Already on inference from previous test
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('updates the URL path when switching tabs', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.url().should('include', '/evaluation');

    cy.get('[data-testid="tab-trigger-reliability"]').click();
    cy.url().should('include', '/reliability');

    cy.get('[data-testid="tab-trigger-inference"]').click();
    cy.url().should('include', '/inference');
  });

  it('shows mobile chart select dropdown on small viewport', () => {
    cy.viewport(375, 812);
    cy.visit('/');
    cy.get('[data-testid="mobile-chart-select"]').should('be.visible');
  });
});
