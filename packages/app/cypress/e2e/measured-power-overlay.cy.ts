describe('Measured power on unofficial-run overlay', () => {
  beforeEach(() => {
    cy.visit('/powerx?unofficialrun=26312107787', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('opens on average power and switches to energy on the overlay view', () => {
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Average Power per Chip',
    );
    cy.get('[data-testid="powerx-advanced"]').should('not.exist');
    cy.get('[data-testid="measured-power-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-power-statistic-average"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-power-basis"]').should('not.exist');
    cy.get('[data-testid="measured-power-display"]').should('not.exist');
    cy.get('[data-testid="measured-power-compare"]').should('not.exist');
    cy.contains('[data-testid="powerx-unit"] button', 'W per chip').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');

    cy.get('[data-testid="powerx-tab-energy"]').click();
    cy.contains('[data-testid="powerx-energy-per"] button', 'Output token').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-energy-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-energy-denominator"]').should('not.exist');
    cy.get('[data-testid="measured-energy-unit"]').should('not.exist');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Joules per Output Token',
    );
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
  });
});
