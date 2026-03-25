describe('Favorite Presets', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="model-selector"]').should('be.visible');
  });

  it('renders the favorites dropdown toggle', () => {
    cy.get('[data-testid="favorites-toggle"]').should('be.visible');
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Favorites');
  });

  it('opens the preset panel on click', () => {
    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get('[data-testid="favorites-panel"]').should('be.visible');
  });

  it('shows all 6 preset cards', () => {
    cy.get('[data-testid^="favorite-preset-"]').should('have.length', 6);
  });

  it('each preset card has a title and description', () => {
    cy.get('[data-testid^="favorite-preset-"]').each(($card) => {
      cy.wrap($card).find('p').first().should('not.be.empty');
      cy.wrap($card).find('p').eq(1).should('not.be.empty');
    });
  });

  it('each preset card has at least one tag badge', () => {
    cy.get('[data-testid^="favorite-preset-"]').each(($card) => {
      cy.wrap($card).find('.flex-wrap').children().should('have.length.greaterThan', 0);
    });
  });

  // Scatter preset: b200-vs-h200
  it('activating b200-vs-h200 shows Active badge and renders data', () => {
    cy.get('[data-testid="favorite-preset-b200-vs-h200"]').click();
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'B200 vs H200');
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Active');

    // Chart should render with data points (not empty)
    cy.get('[data-testid="scatter-graph"]').first().find('svg .dot-group').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  // Deactivate preset
  it('clicking the active preset again deactivates it', () => {
    cy.get('[data-testid="favorite-preset-b200-vs-h200"]').click();
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Favorites');
    cy.get('[data-testid="favorites-toggle"]').should('not.contain.text', 'Active');

    // Chart should still render (not empty)
    cy.get('[data-testid="scatter-graph"]').first().find('svg').should('exist');
  });

  // Scatter preset: amd-generations
  it('activating amd-generations shows AMD preset and renders data', () => {
    cy.get('[data-testid="favorite-preset-amd-generations"]').click();
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'AMD');
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Active');

    cy.get('[data-testid="scatter-graph"]').first().find('svg .dot-group').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  // Switch directly to another preset
  it('switching from one preset to another updates the active state', () => {
    cy.get('[data-testid="favorite-preset-gb200-vs-b200"]').click();
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'GB200');
    cy.get('[data-testid="favorites-toggle"]').should('contain.text', 'Active');
  });

  // Clean up: deactivate and close
  it('deactivate and close the panel', () => {
    cy.get('[data-testid="favorite-preset-gb200-vs-b200"]').click();
    cy.get('[data-testid="favorites-toggle"]').should('not.contain.text', 'Active');
    cy.get('[data-testid="favorites-toggle"]').click();
    cy.get('[data-testid="favorites-panel"]').should('not.exist');
  });
});
