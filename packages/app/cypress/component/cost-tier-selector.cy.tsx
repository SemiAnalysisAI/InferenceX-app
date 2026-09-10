import 'cypress-axe';
import { CostTierSelector } from '@/components/inference/ui/CostTierSelector';
import { mountWithProviders } from '../support/test-utils';

// The Cost Tier selector renders inline in the chart caption (ResultContext),
// not in the Chart Configuration panel, so it is exercised on its own here.
describe('CostTierSelector', () => {
  it('renders nothing for metrics without a pricing basis', () => {
    // Default mock: selectedYAxisMetric = y_tpPerGpu
    mountWithProviders(<CostTierSelector />, { inference: {}, globalFilters: {} });
    cy.get('[data-testid="cost-tier-selector"]').should('not.exist');
  });

  describe('on a hyperscaler-tier cost metric', () => {
    beforeEach(() => {
      mountWithProviders(<CostTierSelector />, {
        inference: { selectedYAxisMetric: 'y_costh' },
        globalFilters: {},
      });
    });

    it('shows published tiers, custom values and locked rental terms', () => {
      cy.get('[data-testid="cost-tier-selector"]')
        .should('be.visible')
        .and('contain.text', 'Owning at Large Hyperscaler Volume')
        .click('right');
      cy.get('[data-slot="select-item"]').then(($items) => {
        const labels = [...$items].map((item) => item.textContent?.trim() ?? '');
        expect(labels).to.deep.equal([
          'Owning at Large Hyperscaler Volume',
          'Rent - 3 Year Commit',
          'Custom User Values',
          // The lock badge carries a screen-reader "Locked" label.
          'Rent - On DemandLocked',
          'Rent - 1 Month CommitLocked',
          'Rent - 6 Month CommitLocked',
          'Rent - 1 Year CommitLocked',
          'Rent - 2 Year CommitLocked',
        ]);
      });
      cy.get('[data-testid="locked-tier-badge"]').should('have.length', 5);
      cy.get('[data-testid="cost-tier-rental"]').click();
      cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costr');
    });

    it('switches to the custom axis', () => {
      cy.get('[data-testid="cost-tier-selector"]').click('right');
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costUser');
    });

    it('opens the TCO model dialog for locked rental tiers instead of changing the axis', () => {
      cy.get('[data-testid="cost-tier-selector"]').click('right');
      cy.get('[data-testid="cost-tier-locked-rent_1_year"]')
        .should('contain.text', 'Rent - 1 Year Commit')
        .click();
      cy.get('[data-testid="tco-model-dialog"]')
        .should('be.visible')
        .and('contain.text', 'Rent - 1 Year Commit');
      cy.get('[data-testid="tco-model-dialog-link"]')
        .should('have.attr', 'href', 'https://semianalysis.com/ai-cloud-tco-model/')
        .and('have.attr', 'target', '_blank');
      cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
      cy.contains('button', 'Not now').click();
      cy.get('[data-testid="tco-model-dialog"]').should('not.exist');
    });

    it('has no detectable a11y violations', () => {
      cy.injectAxe();
      cy.checkA11y('[data-testid="cost-tier-selector"]');
    });
  });

  it('shows the rental tier on rental-tier metrics', () => {
    mountWithProviders(<CostTierSelector />, {
      inference: { selectedYAxisMetric: 'y_tokensPerDollarR' },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-tier-selector"]').should('contain.text', 'Rent - 3 Year Commit');
  });
});
