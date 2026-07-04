import { DistributionCard } from '@/components/datasets/distribution-card';
import type { Distribution } from '@/hooks/api/use-datasets';

const distribution: Distribution = {
  bins: [
    { x0: 0, x1: 100, count: 5 },
    { x0: 100, x1: 200, count: 20 },
    { x0: 200, x1: 300, count: 12 },
    { x0: 300, x1: 400, count: 3 },
  ],
  stats: {
    count: 40,
    min: 10,
    max: 390,
    mean: 180,
    median: 175,
    p75: 250,
    p90: 320,
    p95: 360,
  },
};

describe('DistributionCard', () => {
  it('renders the title, summary stats, and one bar per bin', () => {
    cy.mount(
      <DistributionCard title="Input tokens per turn" unit="tok" distribution={distribution} />,
    );
    cy.contains('Input tokens per turn').should('be.visible');
    cy.contains('n=40').should('be.visible');
    cy.contains('p50 175').should('be.visible');
    cy.contains('p75 250').should('be.visible');
    cy.contains('p90 320').should('be.visible');
    cy.contains('p95 360').should('be.visible');
    cy.get(
      'line[stroke="#3b82f6"], line[stroke="#22c55e"], line[stroke="#f59e0b"], line[stroke="#ef4444"]',
    ).should('have.length', 8);
    // One filled bar rect per bin (ChartHover may add a transparent overlay rect).
    cy.get('rect[class*="fill-primary"]').should('have.length', distribution.bins.length);
  });

  it('shows a "No data" placeholder when no distribution is provided', () => {
    cy.mount(<DistributionCard title="Empty metric" unit="tok" />);
    cy.contains('Empty metric').should('be.visible');
    cy.contains('No data').should('be.visible');
    cy.get('rect[class*="fill-primary"]').should('not.exist');
  });

  it('marks the chart as log scale when scale="log"', () => {
    cy.mount(
      <DistributionCard
        title="Output tokens per turn"
        unit="tok"
        scale="log"
        distribution={distribution}
      />,
    );
    cy.contains('log scale').should('be.visible');
  });

  it('renders older v1 stats without unavailable percentile guides', () => {
    cy.mount(
      <DistributionCard
        title="Legacy metric"
        unit="tok"
        distribution={{
          bins: distribution.bins,
          stats: {
            count: 40,
            min: 10,
            max: 390,
            mean: 180,
            median: 175,
            p90: 320,
          },
        }}
      />,
    );
    cy.contains('p50 175').should('be.visible');
    cy.contains('p90 320').should('be.visible');
    cy.contains('NaN').should('not.exist');
  });
});
