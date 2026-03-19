describe('Chart Export and Share', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
    cy.get('[data-testid="chart-figure"]').should('exist');
  });

  it('shows export button on inference chart', () => {
    cy.get('[data-testid="export-button"]').first().should('exist');
  });

  it('shows zoom reset button on inference chart', () => {
    cy.get('[data-testid="zoom-reset-button"]').first().should('exist');
  });

  it('shows share button in inference chart controls', () => {
    cy.get('[data-testid="share-button"]').first().should('be.visible');
  });

  it('clicking share button copies a URL', () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').resolves();
    });
    cy.get('[data-testid="share-button"]').first().click();
    // After clicking, button should briefly show "Copied" state
    cy.get('[data-testid="share-button"]').first().should('contain', 'Copied');
  });

  it('share button reverts to Share after copy', () => {
    // Previous test already clicked share; just wait for revert
    cy.get('[data-testid="share-button"]').first().should('contain', 'Share');
  });

  it('shows share button on reliability tab', () => {
    cy.visit('/reliability');
    cy.get('[data-testid="share-button"]').should('be.visible');
  });

  it('shows share button on evaluation tab', () => {
    cy.visit('/evaluation');
    cy.get('[data-testid="share-button"]').should('be.visible');
  });
});
