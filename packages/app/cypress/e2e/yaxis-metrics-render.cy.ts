/**
 * Regression test: every Y-axis metric must render scatter points in the default view
 * without any user interaction beyond selecting the metric.
 * Catches bugs where custom-value metrics (costUser, powerUser) require clicking
 * "Calculate" before data appears.
 */
const exact = (label: string) =>
  new RegExp(`^${label.replaceAll(/[$()]/gu, (char) => `\\${char}`)}$`, 'u');

describe('Y-Axis Metrics All Render Data', () => {
  // Tiered metrics are one Y-axis option each; the Cost Tier selector picks
  // the pricing basis, so those entries name the tier option to click.
  const metrics: { label: string; tier?: 'hyperscaler' | 'rental' }[] = [
    { label: 'Token Throughput per Chip' },
    { label: 'Input Token Throughput per Chip' },
    { label: 'Output Token Throughput per Chip' },
    { label: 'Token Throughput per All in Utility MW' },
    { label: 'Input Token Throughput per All in Utility MW' },
    { label: 'Output Token Throughput per All in Utility MW' },
    { label: 'Cost per Million Total Tokens', tier: 'hyperscaler' },
    { label: 'Cost per Million Total Tokens', tier: 'rental' },
    { label: 'Cost per Million Output Tokens', tier: 'hyperscaler' },
    { label: 'Cost per Million Output Tokens', tier: 'rental' },
    { label: 'Cost per Million Input Tokens', tier: 'hyperscaler' },
    { label: 'Cost per Million Input Tokens', tier: 'rental' },
    { label: 'Total Tokens per $1 TCO', tier: 'hyperscaler' },
    { label: 'Total Tokens per $1 TCO', tier: 'rental' },
    { label: 'Output Tokens per $1 TCO', tier: 'hyperscaler' },
    { label: 'Output Tokens per $1 TCO', tier: 'rental' },
    { label: 'Input Tokens per $1 TCO', tier: 'hyperscaler' },
    { label: 'Input Tokens per $1 TCO', tier: 'rental' },
    { label: 'Cost per Million Total Tokens (Custom User Values)' },
    { label: 'Total Tokens per $1 TCO (Custom User Values)' },
    { label: 'Token Throughput per All in Utility MW (Custom User Values)' },
    { label: 'All-in Provisioned Joules per Total Token' },
    { label: 'All-in Provisioned Joules per Output Token' },
    { label: 'All-in Provisioned Joules per Input Token' },
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

  metrics.forEach(({ label, tier }) => {
    const name = tier ? `${label} [${tier}]` : label;
    it(`"${name}" renders scatter points without extra interaction`, () => {
      cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
      cy.get('[data-slot="select-item"]').contains(exact(label)).click({ force: true });
      if (tier) {
        cy.get('[data-testid="cost-tier-selector"]').click('right', { force: true });
        cy.get(`[data-testid="cost-tier-${tier}"]`).click({ force: true });
      }
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg .dot-group')
        .should('have.length.greaterThan', 0);
    });
  });
});
