/**
 * Regression test: every Y-axis metric must render scatter points in the default view
 * without any user interaction beyond selecting the metric.
 * Catches bugs where custom-value metrics (costUser, powerUser) require clicking
 * "Calculate" before data appears.
 */
describe('Y-Axis Metrics All Render Data', () => {
  const metrics = [
    'Token Throughput per GPU',
    'Input Token Throughput per GPU',
    'Output Token Throughput per GPU',
    'Token Throughput per All in Utility MW',
    'Input Token Throughput per All in Utility MW',
    'Output Token Throughput per All in Utility MW',
    'Cost per Million Total Tokens (Owning - Hyperscaler)',
    'Cost per Million Total Tokens (Owning - Neocloud Giant)',
    'Cost per Million Total Tokens (3 Year Rental)',
    'Cost per Million Output Tokens (Owning - Hyperscaler)',
    'Cost per Million Output Tokens (Owning - Neocloud Giant)',
    'Cost per Million Output Tokens (3 Year Rental)',
    'Cost per Million Input Tokens (Owning - Hyperscaler)',
    'Cost per Million Input Tokens (Owning - Neocloud Giant)',
    'Cost per Million Input Tokens (3 Year Rental)',
    'Cost per Million Total Tokens (Custom User Values)',
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
