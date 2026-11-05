import ReliabilityBarChartD3 from '@/components/reliability/ui/BarChartD3';
import { mountWithProviders } from '../support/test-utils';
import { registerAnalyticsClient } from '@/lib/analytics/analytics';

describe('ReliabilityBarChartD3', () => {
  it('tracks retry and requests reliability data again', () => {
    const capture = cy.stub();
    const refetch = cy.stub().resolves();
    registerAnalyticsClient({ capture });
    mountWithProviders(<ReliabilityBarChartD3 />, {
      reliability: { error: 'Server error', chartData: [], refetch },
    });
    cy.get('[data-testid="reliability-error"]')
      .should('contain.text', 'Failed to load reliability data')
      .find('button')
      .should('have.text', 'Retry')
      .click();

    cy.then(() => {
      expect(capture).to.have.been.calledWith('reliability_retry_clicked');
      expect(refetch.callCount).to.eq(1);
    });
  });
});
