import { useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import { InferenceTcoBadges } from '@/components/inference/ui/InferenceTcoBadges';
import { getGpuSpecs } from '@/lib/constants';
import { createMockInferenceContextValues } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const VALUES = { gb300: 2.31, mi355x: 1.5 };
const REGISTRY_BASES = Object.keys(HW_REGISTRY);
const GB300_INPUT = '[data-testid="cost-input-gb300"]';

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
    // Every registry chip is seeded from the tier being left, not only the
    // two the caption shows, so a chip that joins the selection later is
    // priced too.
    cy.get('@setUserCosts').should('have.been.calledOnce');
    cy.get('@setUserCosts').then((stub) => {
      const seeded = (stub as unknown as { firstCall: { args: unknown[] } }).firstCall
        .args[0] as Record<string, number>;
      expect(Object.keys(seeded).sort()).to.deep.equal([...REGISTRY_BASES].sort());
      expect(seeded.gb300).to.equal(2.314);
      expect(seeded.mi355x).to.equal(getGpuSpecs('mi355x').costh);
      expect(seeded.b200).to.equal(getGpuSpecs('b200').costh);
    });
  });

  it('seeds every chip from the hyperscaler prices on a deep link to the custom metric', () => {
    mountWithProviders(<InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costUser', userCosts: null },
      globalFilters: {},
    });
    cy.get('@setUserCosts').should('have.been.calledOnce');
    cy.get('@setUserCosts').then((stub) => {
      const seeded = (stub as unknown as { firstCall: { args: unknown[] } }).firstCall
        .args[0] as Record<string, number>;
      expect(Object.keys(seeded).sort()).to.deep.equal([...REGISTRY_BASES].sort());
      for (const base of REGISTRY_BASES) expect(seeded[base]).to.equal(getGpuSpecs(base).costh);
    });
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

  it('keeps an empty badge for a chip blanked from the other figure', () => {
    // The blanked chip comes from the shared userCosts, not from this
    // figure's own typing, so the sibling /inference figure shows it too.
    mountWithProviders(
      <InferenceTcoBadges
        label="TCO $/chip/hr:"
        values={{ mi355x: 1.5 }}
        blankedBases={['gb300']}
      />,
      {
        inference: {
          selectedYAxisMetric: 'y_costUser',
          userCosts: { gb300: undefined, mi355x: 1.5 },
        },
        globalFilters: {},
      },
    );
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '');
    cy.get('[data-testid="cost-input-mi355x"]').should('have.value', '1.5');
    cy.get('[data-testid="cost-input-gb300"]').type('3');
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: 3, mi355x: 1.5 });
  });

  it('drops a typed draft once the shared costs are reseeded or edited elsewhere', () => {
    // Two figures share one userCosts, as on /inference. The provider here
    // holds real state so the second figure and a tier reseed reach the first.
    const base = createMockInferenceContextValues({ selectedYAxisMetric: 'y_costUser' });
    function Harness() {
      const [userCosts, setUserCosts] = useState<Record<string, number | undefined> | null>({
        gb300: 2.31,
        mi355x: 1.5,
      });
      const value = { ...base, userCosts, setUserCosts };
      return (
        <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
          <div data-testid="figure-a">
            <InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />
          </div>
          <div data-testid="figure-b">
            <InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />
          </div>
          <button type="button" onClick={() => setUserCosts({ gb300: 2.31, mi355x: 1.5 })}>
            reseed
          </button>
        </InferenceContextsProvider>
      );
    }
    mountWithProviders(<Harness />, { globalFilters: {} });
    const a = () => cy.get(`[data-testid="figure-a"] ${GB300_INPUT}`);
    const b = () => cy.get(`[data-testid="figure-b"] ${GB300_INPUT}`);
    a().clear().type('2.50');
    a().should('have.value', '2.50');
    b().should('have.value', '2.5');
    // The other figure edits the chip: figure A's "2.50" text is stale and goes.
    b().clear().type('3');
    a().should('have.value', '3');
    b().should('have.value', '3');
    // A tier change reseeds the shared costs: both figures quote the seed.
    cy.contains('button', 'reseed').click();
    a().should('have.value', '2.31');
    b().should('have.value', '2.31');
  });

  it('gives each mounted set of badges its own input ids', () => {
    mountWithProviders(
      <>
        <InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />
        <InferenceTcoBadges label="TCO $/chip/hr:" values={VALUES} />
      </>,
      { inference: { selectedYAxisMetric: 'y_costh' }, globalFilters: {} },
    );
    cy.get('[data-testid="cost-input-gb300"]').should('have.length', 2);
    cy.get('[data-testid="cost-input-gb300"]').then(($inputs) => {
      const ids = $inputs.toArray().map((el) => el.id);
      expect(ids[0]).to.not.equal(ids[1]);
      for (const id of ids) {
        cy.get(`label[for="${id}"]`).should('have.length', 1);
      }
    });
  });
});
