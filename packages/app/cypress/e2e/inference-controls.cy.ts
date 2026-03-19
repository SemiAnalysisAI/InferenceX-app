describe('Inference Chart Controls', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
    cy.get('[data-testid="model-selector"]').should('be.visible');
  });

  it('model selector has selectable options', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('sequence selector is visible', () => {
    cy.get('[data-testid="sequence-selector"]').should('be.visible');
  });

  it('sequence selector has options', () => {
    cy.get('[data-testid="sequence-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('Y-axis metric selector is visible', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
  });

  it('Y-axis metric selector has grouped options', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 1);
    cy.get('body').type('{esc}');
  });

  it('precision multi-select is visible', () => {
    cy.get('[data-testid="precision-multiselect"]').should('be.visible');
  });

  it('GPU comparison multi-select is visible', () => {
    cy.get('[data-testid="gpu-multiselect"]').should('be.visible');
  });

  // These tests mutate state — they change selector values.
  // Order matters: run them last.

  it('changing model selector updates the displayed value', () => {
    cy.get('[data-testid="model-selector"]')
      .invoke('text')
      .then((initialText) => {
        cy.get('[data-testid="model-selector"]').click();
        // Pick the last option to ensure it differs from the default (first)
        cy.get('[role="option"]').last().click();
        cy.get('[data-testid="model-selector"]')
          .invoke('text')
          .should('not.eq', initialText.trim());
      });
  });

  it('selecting a different Y-axis metric updates the displayed value', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.get('[role="option"]')
      .eq(2)
      .then(($option) => {
        const optionText = $option.text().trim();
        cy.wrap($option).click();
        cy.get('[data-testid="yaxis-metric-selector"]')
          .invoke('text')
          .should('include', optionText);
      });
  });
});
