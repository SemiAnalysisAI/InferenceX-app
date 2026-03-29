describe('TTFT X-Axis Toggle (E2E chart)', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 2);
  });

  it('shows the x-axis dropdown in the e2e chart heading', () => {
    cy.get('[data-testid="chart-figure"]')
      .eq(1)
      .find('h2 button')
      .should('contain.text', 'vs.')
      .and('contain.text', 'Latency');
  });

  it('opens popover with three x-axis options', () => {
    cy.get('[data-testid="chart-figure"]').eq(1).find('h2 button').click();
    cy.get('[data-slot="popover-content"]').within(() => {
      cy.contains('End-to-end Latency').should('exist');
      cy.contains('P99 TTFT').should('exist');
      cy.contains('Median TTFT').should('exist');
    });
  });

  it('switches x-axis to P99 TTFT and updates the heading', () => {
    cy.get('[data-slot="popover-content"]').contains('P99 TTFT').click();
    cy.get('[data-testid="chart-figure"]').eq(1).find('h2').should('contain.text', 'P99 TTFT');
  });

  it('switches x-axis to Median TTFT and updates the heading', () => {
    cy.get('[data-testid="chart-figure"]').eq(1).find('h2 button').click();
    cy.get('[data-slot="popover-content"]').contains('Median TTFT').click();
    cy.get('[data-testid="chart-figure"]').eq(1).find('h2').should('contain.text', 'Median TTFT');
  });

  it('switches back to End-to-end Latency', () => {
    cy.get('[data-testid="chart-figure"]').eq(1).find('h2 button').click();
    cy.get('[data-slot="popover-content"]').contains('End-to-end Latency').click();
    cy.get('[data-testid="chart-figure"]')
      .eq(1)
      .find('h2')
      .should('contain.text', 'End-to-end Latency');
  });
});
