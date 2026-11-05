import ReliabilityChartControls from '@/components/reliability/ui/ChartControls';
import { mountWithProviders } from '../support/test-utils';

describe('Reliability ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<ReliabilityChartControls />, { reliability: {} });
  });

  it('calls setDateRange when an option is selected', () => {
    cy.get('[data-testid="reliability-date-range"]').click();
    cy.contains('[role="option"]', 'Last 3 months').click();
    cy.get('@setDateRange').should('have.been.calledOnceWith', 'last-3-months');
  });
});
