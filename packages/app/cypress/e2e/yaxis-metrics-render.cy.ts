/**
 * Regression test: every Y-axis metric must render scatter points in the default view
 * without any user interaction beyond selecting the metric.
 * Catches bugs where custom-value metrics (costUser, powerUser) require clicking
 * "Calculate" before data appears.
 */
describe('Y-Axis Metrics All Render Data', () => {
  const metrics = [
    'Token Throughput per Chip',
    'Input Token Throughput per Chip',
    'Output Token Throughput per Chip',
    'Token Throughput per All in Utility MW',
    'Input Token Throughput per All in Utility MW',
    'Output Token Throughput per All in Utility MW',
    'Total Token Cost (Owning - Hyperscaler)',
    'Total Token Cost (Owning - Neocloud Giant)',
    'Total Token Cost (3 Year Rental)',
    'Output Token Cost (Owning - Hyperscaler)',
    'Output Token Cost (Owning - Neocloud Giant)',
    'Output Token Cost (3 Year Rental)',
    'Input Token Cost (Owning - Hyperscaler)',
    'Input Token Cost (Owning - Neocloud Giant)',
    'Input Token Cost (3 Year Rental)',
    'Total Token Cost (Custom User Values)',
    'Token Throughput per All in Utility MW (Custom User Values)',
    'All-in Provisioned Joules per Total Token',
    'All-in Provisioned Joules per Output Token',
    'All-in Provisioned Joules per Input Token',
  ];

  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  metrics.forEach((label) => {
    it(`"${label}" renders scatter points without extra interaction`, () => {
      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.get('[role="option"]').contains(label).click({ force: true });
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);
    });
  });
});
