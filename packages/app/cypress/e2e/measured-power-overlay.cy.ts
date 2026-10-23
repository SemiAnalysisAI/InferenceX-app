describe('Measured power on unofficial-run overlay', () => {
  beforeEach(() => {
    cy.visit('/inference?unofficialrun=26312107787', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('exposes both measured families and selects average power on the overlay view', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-slot="select-content"]').should('exist');

    cy.contains('[data-slot="select-item"]', /^Measured Power$/u)
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
      .scrollIntoView()
      .should('be.visible');

    cy.contains('[data-slot="select-item"]', /^Measured Power$/u)
      .scrollIntoView()
      .click();
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.get('[data-testid="measured-power-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-power-statistic-average"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-power-display"]').should('contain.text', 'W/chip');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Average Power per Chip',
    );

    cy.screenshot('measured-power-selected', { capture: 'viewport' });

    cy.get('[data-testid="inference-chart-display"] svg').should('exist');

    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
      .scrollIntoView()
      .click();
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.get('[data-testid="measured-energy-denominator"]').should('contain.text', 'Output token');
    cy.get('[data-testid="measured-energy-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-energy-unit"]').should('not.exist');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Joules per Output Token',
    );
    cy.screenshot('measured-joules-selected', { capture: 'viewport' });
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
  });
});
