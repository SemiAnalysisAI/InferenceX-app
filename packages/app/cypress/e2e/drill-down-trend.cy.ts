/**
 * Tests for the "Performance Over Time" drill-down feature.
 * Users double-click scatter chart data points to track configs over time,
 * which opens a modal dialog with TrendCharts.
 */
describe('Drill-Down Trend Chart Modal', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
    // Wait for scatter graph to render with data points
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('modal is not visible initially', () => {
    cy.contains('Performance Over Time').should('not.exist');
  });

  it('double-clicking a scatter point opens the Performance Over Time modal', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .dblclick({ force: true });

    cy.contains('Performance Over Time').should('be.visible');
  });

  it('shows tracked config badge after double-clicking a point', () => {
    // Modal is still open from previous test
    cy.get('[data-testid="tracked-config-badge"]').should('have.length.at.least', 1);
  });

  it('shows two trend chart SVGs (Y-axis and X-axis metrics) in the modal', () => {
    cy.get('[role="dialog"]').find('[data-testid="trend-chart-svg"]').should('have.length', 2);
  });

  it('shows the helper text about double-clicking points', () => {
    cy.contains(
      'Double-click points on the scatter chart to track configurations over time',
    ).should('be.visible');
  });

  it('tracked point gets a visual ring indicator on the scatter chart', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .tracked-ring')
      .should('have.length.at.least', 1);
  });

  it('removing a config badge via its X button removes just that config', () => {
    // Click the X button on the config badge — with only one tracked, modal closes
    cy.get('[data-testid="tracked-config-badge"]').first().find('button').click();
    cy.contains('Performance Over Time').should('not.exist');
  });

  it('double-clicking the same point again un-tracks it', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .dblclick({ force: true });

    cy.contains('Performance Over Time').should('be.visible');
    cy.get('[data-testid="tracked-config-badge"]').should('have.length', 1);

    // Dispatch a raw dblclick event on the same element to avoid click handler interference
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .then(($el) => {
        $el[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      });

    // After un-tracking the only config, modal should close
    cy.contains('Performance Over Time').should('not.exist');
  });

  it('closing the modal via X button clears tracked configs', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .first()
      .dblclick({ force: true });

    cy.contains('Performance Over Time').should('be.visible');

    // Close the dialog via the X button
    cy.get('[role="dialog"]').find('button').filter(':has(svg)').last().click();

    cy.contains('Performance Over Time').should('not.exist');
  });
});
