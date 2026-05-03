// Regression test for issue #274: clicking a second filter dropdown while
// another is open should close the first and open the second in a single click.
// Also covers the Escape-key close path, which was lost when these dropdowns
// migrated from Radix Select to MultiSelect.

describe('Dropdown one-click switching', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('clicking another selector closes the first and opens the second in one click', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[role="option"]').should('have.length.greaterThan', 0);

    cy.get('[data-testid="sequence-selector"]').click();

    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="sequence-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
  });

  it('only one MultiSelect content panel is open at a time when switching dropdowns', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[data-slot="select-content"]').should('have.length', 1);

    cy.get('[data-testid="precision-multiselect"]').click();
    cy.get('[data-slot="select-content"]').should('have.length', 1);
    cy.get('[data-testid="precision-multiselect"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('Escape closes an open MultiSelect dropdown', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');

    cy.get('body').type('{esc}');

    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-slot="select-content"]').should('not.exist');
  });

  it('Escape closes the Y-axis SearchableSelect dropdown', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-slot="select-content"]').should('exist');

    cy.get('body').type('{esc}');

    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-slot="select-content"]').should('not.exist');
  });
});
