describe('Dropdown one-click switching', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.get('#chart-0 [data-testid="scenario-selector"]').should('be.visible');
  });

  it('clicking another selector closes the first and opens the second in one click', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[role="option"]').should('have.length.greaterThan', 0);

    cy.get('[data-testid="scenario-selector"]').click();

    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="scenario-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-select-option]').should('have.length.greaterThan', 0);
  });

  it('only one MultiSelect content panel is open at a time when switching dropdowns', () => {
    cy.visit('/infx/inference?g_model=DeepSeek-R1-0528');
    cy.get('[data-testid="inference-chart-display"]').should('exist');

    cy.get('[data-testid="precision-multiselect"][role="combobox"]:enabled')
      .scrollIntoView({ offset: { top: -240, left: 0 } })
      .click({ scrollBehavior: false });
    cy.get('[data-slot="select-content"]').should('have.length', 1);

    cy.get('[data-testid="model-selector"]').click({ scrollBehavior: false });
    cy.get('[data-slot="select-content"]').should('have.length', 1);
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="precision-multiselect"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('Escape closes the Y-axis SearchableSelect dropdown', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-slot="select-content"]').should('exist');

    cy.get('body').type('{esc}');

    cy.get('[data-testid="yaxis-metric-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-slot="select-content"]').should('not.exist');
  });
});
