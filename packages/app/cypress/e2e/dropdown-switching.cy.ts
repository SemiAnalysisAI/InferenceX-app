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

    cy.get('[data-testid="scenario-selector"]').click();

    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="scenario-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-select-option]').should('have.length.greaterThan', 0);
  });

  it('only one MultiSelect content panel is open at a time when switching dropdowns', () => {
    // The default model is FP4-only, so Precision is disabled. Wait for
    // the multi-precision model's availability to enable the combobox.
    cy.visit('/inference?g_model=DeepSeek-R1-0528');
    cy.get('[data-testid="inference-chart-display"]').should('exist');

    // Frame both controls below the sticky header. Start with the lower
    // control so its open menu does not physically cover the next trigger.
    cy.get('[data-testid="precision-multiselect"][role="combobox"]:enabled')
      .scrollIntoView({ offset: { top: -240, left: 0 } })
      .click({ scrollBehavior: false });
    cy.get('[data-slot="select-content"]').should('have.length', 1);

    cy.get('[data-testid="model-selector"]').click({ scrollBehavior: false });
    cy.get('[data-slot="select-content"]').should('have.length', 1);
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="precision-multiselect"]').should('have.attr', 'aria-expanded', 'false');
  });

  it('Escape closes an open MultiSelect dropdown', () => {
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'true');

    cy.get('body').type('{esc}');

    cy.get('[data-testid="model-selector"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-slot="select-content"]').should('not.exist');
  });

  it('marks the featured AgentX models with a NEW pill in the dropdown', () => {
    cy.get('[data-testid="model-selector"]').click();

    // A featured AgentX model carries the pill… (MiniMax M3 rather than the
    // Kimi K3 default because the availability fixtures don't ship kimik3 rows)
    cy.contains('[role="option"]', 'MiniMax M3 428B')
      .find('[data-new-badge="model-option"]')
      .should('be.visible')
      .and('have.text', 'NEW');
    // …while non-featured models render without one.
    cy.contains('[role="option"]', 'DeepSeek R1 0528 671B')
      .find('[data-new-badge="model-option"]')
      .should('not.exist');
  });

  it('separates maintenance-mode models from deprecated models', () => {
    cy.get('[data-testid="model-selector"]').click();

    cy.contains('Maintenance Mode').scrollIntoView().should('be.visible');
    cy.contains('[role="option"]', 'DeepSeek R1 0528 671B').scrollIntoView().should('be.visible');
    cy.contains('Deprecated').scrollIntoView().should('be.visible');
    cy.contains('[role="option"]', 'gpt-oss 120B').scrollIntoView().should('be.visible');
    cy.contains('[role="option"]', 'Kimi K2.5/2.6/2.7-Code 1T')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[role="option"]', 'Llama 3.3 70B Instruct').scrollIntoView().should('be.visible');
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
