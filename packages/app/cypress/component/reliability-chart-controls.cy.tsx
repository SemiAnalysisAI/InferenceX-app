import ReliabilityChartControls from '@/components/reliability/ui/ChartControls';
import { mountWithProviders } from '../support/test-utils';

describe('Reliability ChartControls', () => {
  beforeEach(() => {
    mountWithProviders(<ReliabilityChartControls />, { reliability: {} });
  });

  it('renders the date range selector', () => {
    cy.get('[data-testid="reliability-date-range"]').should('be.visible');
  });

  it('shows the current date range value from context', () => {
    // Default mock context has dateRange = 'last-7-days'
    cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 7 days');
  });

  it('displays all date range options', () => {
    cy.get('[data-testid="reliability-date-range"]').click();

    const expected = ['Last 3 days', 'Last 7 days', 'Last month', 'Last 3 months', 'All time'];
    for (const label of expected) {
      cy.contains('[role="option"]', label).should('exist');
    }
  });

  it('calls setDateRange when an option is selected', () => {
    cy.get('[data-testid="reliability-date-range"]').click();
    cy.contains('[role="option"]', 'Last 3 months').click();
    cy.get('@setDateRange').should('have.been.calledOnceWith', 'last-3-months');
  });

  it('calls setDateRange with "all-time" value', () => {
    cy.get('[data-testid="reliability-date-range"]').click();
    cy.contains('[role="option"]', 'All time').click();
    cy.get('@setDateRange').should('have.been.calledOnceWith', 'all-time');
  });
});
