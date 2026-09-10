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

    it('switches to the custom axis and seeds the per-chip $/hr from the current tier', () => {
      cy.get('[data-testid="cost-tier-selector"]').click('right');
      cy.get('[data-testid="cost-tier-custom"]').click();
      cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costUser');
      // `userCosts` starts null, so the custom tier would otherwise draw an
      // empty chart until every chip had been typed in.
      cy.get('@setUserCosts').should('have.been.calledOnce');
      cy.get('@setUserCosts').then((stub) => {
        const seeded = (stub as unknown as { firstCall: { args: unknown[] } }).firstCall
          .args[0] as Record<string, number>;
        expect(seeded).to.have.property('gb300');
        expect(seeded).to.have.property('mi355x');
        for (const value of Object.values(seeded)) expect(value).to.be.greaterThan(0);
      });
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

  it('does not reseed $/hr the reader has already entered', () => {
    mountWithProviders(<CostTierSelector />, {
      inference: { selectedYAxisMetric: 'y_costh', userCosts: { gb300: 9 } },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-tier-selector"]').click('right');
    cy.get('[data-testid="cost-tier-custom"]').click();
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costUser');
    cy.get('@setUserCosts').should('not.have.been.called');
  });

  it('shows the rental tier on rental-tier metrics', () => {
    mountWithProviders(<CostTierSelector />, {
      inference: { selectedYAxisMetric: 'y_tokensPerDollarR' },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-tier-selector"]').should('contain.text', 'Rent - 3 Year Commit');
  });
});
