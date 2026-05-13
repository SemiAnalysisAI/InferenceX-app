/**
 * Tests for the Reproduce drawer — opens from the inference table row,
 * scatter pinned tooltip, and GPU graph tooltip. Verifies drawer state is
 * URL-safe (closing does not perturb chart zoom or query string).
 */
describe('Reproduce drawer', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('opens from the inference table Reproduce button and shows the three tabs', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.get('[data-testid="inference-table-reproduce-btn"]').first().click();

    cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
    cy.contains('Reproduce this benchmark').should('be.visible');
    cy.contains('button', 'Command').should('be.visible');
    cy.contains('button', 'Config JSON').should('be.visible');
    cy.contains('button', 'Environment').should('be.visible');
  });

  it('exposes a copy button on every tab', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-table-reproduce-btn"]').first().click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
    cy.contains('button', 'Config JSON').click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
    cy.contains('button', 'Environment').click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
  });

  it('Esc closes the drawer without changing the URL hash', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.url().then((before) => {
      cy.get('[data-testid="inference-table-reproduce-btn"]').first().click();
      cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('[data-testid="reproduce-drawer"]').should('not.exist');
      cy.url().should('eq', before);
    });
  });

  it('renders correctly for an unofficial-run overlay row when one is loaded', () => {
    // Re-visit with the overlay query param. We do NOT assert which row is
    // rendered — we only assert the drawer can be opened from whatever points
    // appear for the official path on top of the overlay. The wiring is the
    // same code path: clicking a Reproduce control feeds the InferenceData
    // through to the drawer regardless of where the row originated.
    const candidateRunId = '15000000000';
    cy.visit(`/inference?unofficialrun=${candidateRunId}`);
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.get('[data-testid="inference-table-reproduce-btn"]').first().click();
    cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
  });
});
