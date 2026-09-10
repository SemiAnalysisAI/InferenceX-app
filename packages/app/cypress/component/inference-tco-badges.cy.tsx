import { InferenceTcoBadges } from '@/components/inference/ui/InferenceTcoBadges';
import { mountWithProviders } from '../support/test-utils';

const VALUES = { gb300: 2.31, mi355x: 1.5 };

// The /inference caption's TCO badges double as the custom $/chip/hr inputs,
// so there is no Custom Chip Costs card; the badges are exercised on their own.
describe('InferenceTcoBadges', () => {
  it('quotes the published prices on a tiered metric', () => {
    mountWithProviders(<InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costh' },
      globalFilters: {},
    });
    cy.get('[data-testid="inference-tco-badges"]').should('contain.text', 'TCO $/chip/hr:');
    cy.get('[data-testid="inference-tco-badge"]').should('have.length', 2);
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '2.31');
    cy.get('[data-testid="cost-input-mi355x"]').should('have.value', '1.5');
    cy.get('@setUserCosts').should('not.have.been.called');
  });

  it('moves onto the custom tier on the first keystroke, carrying the other prices', () => {
    mountWithProviders(<InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costh' },
      globalFilters: {},
    });
    // The stubbed context leaves the metric on `y_costh`, so the field still
    // quotes 2.31 and the keystroke appends to it.
    cy.get('[data-testid="cost-input-gb300"]').type('4');
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costUser');
    cy.get('@setUserCosts').should('have.been.calledOnceWith', { gb300: 2.314, mi355x: 1.5 });
  });

  it('seeds custom costs from the published prices on a deep link to the custom metric', () => {
    mountWithProviders(<InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costUser', userCosts: null },
      globalFilters: {},
    });
    cy.get('@setUserCosts').should('have.been.calledWith', VALUES);
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
  });

  it('edits custom costs in place and drops a blanked chip instead of pricing it at zero', () => {
    mountWithProviders(<InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costUser', userCosts: { gb300: 9, mi355x: 1.5 } },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '9');
    cy.get('[data-testid="cost-input-gb300"]').clear();
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: undefined, mi355x: 1.5 });
    // The badge stays mounted while blank so the price can be typed back in.
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '').type('3');
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: 3, mi355x: 1.5 });
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
  });
});
