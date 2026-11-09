const exact = (label: string) =>
  new RegExp(`^${label.replaceAll(/[$()]/gu, (char) => `\\${char}`)}$`, 'u');

describe('Y-Axis Metrics All Render Data', () => {
  const metrics: { label: string; tier?: 'hyperscaler' | 'rental' | 'custom' }[] = [
    { label: 'Token Throughput per Chip' },
    { label: 'Output Token Throughput per Chip' },
    { label: 'Token Throughput per All in Utility MW' },
    { label: 'Cost per Million Total Tokens', tier: 'hyperscaler' },
    { label: 'Total Tokens per $1 TCO', tier: 'rental' },
    { label: 'Cost per Million Total Tokens', tier: 'custom' },
    { label: 'All-in Provisioned Joules per Total Token' },
  ];

  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/infx/inference?g_model=DeepSeek-V4-Pro');
    cy.scatterPoints().should('have.length.greaterThan', 0);
  });

  metrics.forEach(({ label, tier }) => {
    const name = tier ? `${label} [${tier}]` : label;
    it(`"${name}" renders scatter points without extra interaction`, () => {
      cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
      cy.get('[data-slot="select-item"]').contains(exact(label)).click({ force: true });
      if (tier) {
        cy.get('[data-testid="cost-tier-selector"]').first().click('right', { force: true });
        cy.get(`[data-testid="cost-tier-${tier}"]`).click({ force: true });
      }
      cy.scatterPoints().should('have.length.greaterThan', 0);
    });
  });
});
