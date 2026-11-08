import { useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import { CostTierSelector } from '@/components/inference/ui/CostTierSelector';
import { InferenceTcoBadges } from '@/components/inference/ui/InferenceTcoBadges';
import { PricesSourceLink } from '@/components/ui/chart-display-helpers';
import { ResultContext } from '@/components/ui/result-context';
import { getGpuSpecs } from '@/lib/catalog/constants';
import { createMockInferenceContextValues } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const VALUES = { gb300: 2.31, mi355x: 1.5 };
const BASES = Object.keys(VALUES);
const REGISTRY_BASES = Object.keys(HW_REGISTRY);
const PUBLISHED = Object.fromEntries(
  REGISTRY_BASES.map((base) => [base, getGpuSpecs(base, 'external').costh]),
);
const GB300_INPUT = '[data-testid="cost-input-gb300"]';

describe('InferenceTcoBadges', () => {
  it('quotes the published prices on a tiered metric', () => {
    mountWithProviders(<InferenceTcoBadges bases={BASES} values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costh' },
      globalFilters: {},
    });
    cy.get('[data-testid="inference-tco-badges"]').should('contain.text', '$/chip/hr');
    cy.get('[data-testid="inference-tco-badges"] tbody th').should('have.text', 'TCO');
    cy.get('[data-testid="inference-tco-reset"]').should('not.exist');
    cy.get('[data-testid="inference-tco-badge"]').should('have.length', 2);
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '2.31');
    cy.get('[data-testid="cost-input-mi355x"]').should('have.value', '1.50');
    cy.get('@setUserCosts').should('not.have.been.called');
  });

  it('moves onto the custom tier on the first keystroke, carrying the other prices', () => {
    mountWithProviders(<InferenceTcoBadges bases={BASES} values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costh' },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-input-gb300"]').type('4');
    cy.get('@setSelectedYAxisMetric').should('have.been.calledOnceWith', 'y_costUser');
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
    mountWithProviders(<InferenceTcoBadges bases={BASES} values={VALUES} />, {
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
    mountWithProviders(<InferenceTcoBadges bases={BASES} values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costUser', userCosts: { gb300: 9, mi355x: 1.5 } },
      globalFilters: {},
    });
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '9.00');
    cy.get('[data-testid="cost-input-gb300"]').clear();
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: undefined, mi355x: 1.5 });
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '').type('3');
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: 3, mi355x: 1.5 });
    cy.get('@setSelectedYAxisMetric').should('not.have.been.called');
  });

  it('keeps an empty badge for a chip blanked from the other figure', () => {
    mountWithProviders(
      <InferenceTcoBadges bases={['mi355x', 'gb300']} values={{ mi355x: 1.5 }} />,
      {
        inference: {
          selectedYAxisMetric: 'y_costUser',
          userCosts: { gb300: undefined, mi355x: 1.5 },
        },
        globalFilters: {},
      },
    );
    cy.get('[data-testid="cost-input-gb300"]').should('have.value', '');
    cy.get('[data-testid="cost-input-mi355x"]').should('have.value', '1.50');
    cy.get('[data-testid="cost-input-gb300"]').type('3');
    cy.get('@setUserCosts').should('have.been.calledWith', { gb300: 3, mi355x: 1.5 });
  });

  it('drops a typed draft once the shared costs are reseeded or edited elsewhere', () => {
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
            <InferenceTcoBadges bases={BASES} values={VALUES} />
          </div>
          <div data-testid="figure-b" className="mb-6">
            <InferenceTcoBadges bases={BASES} values={VALUES} />
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
    b().should('have.value', '2.50');
    b().clear().type('3');
    a().should('have.value', '3.00');
    b().should('have.value', '3');
    cy.contains('button', 'reseed').click();
    a().should('have.value', '2.31');
    b().should('have.value', '2.31');
  });

  it('gives each mounted set of badges its own input ids', () => {
    mountWithProviders(
      <>
        <InferenceTcoBadges bases={BASES} values={VALUES} />
        <InferenceTcoBadges bases={BASES} values={VALUES} />
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

  it('marks overridden prices and resets to the published tier they came from', () => {
    const published = Object.fromEntries(
      REGISTRY_BASES.map((base) => [base, getGpuSpecs(base).costh]),
    );
    mountWithProviders(<InferenceTcoBadges bases={['mi355x', 'gb300']} values={VALUES} />, {
      inference: { selectedYAxisMetric: 'y_costUser', userCosts: { ...published, gb300: 9 } },
      globalFilters: {},
    });
    cy.get('[data-testid="inference-tco-badge"]').then(($cells) => {
      expect(
        $cells.toArray().map((cell) => cell.querySelector('input')?.dataset.testid),
      ).to.deep.equal(['cost-input-mi355x', 'cost-input-gb300']);
    });
    cy.get('[data-testid="cost-input-gb300"]').closest('td').should('have.attr', 'data-overridden');
    cy.get('[data-testid="cost-input-gb300"]').should('have.class', 'text-brand');
    cy.get('[data-testid="cost-input-mi355x"]')
      .closest('td')
      .should('not.have.attr', 'data-overridden');
    cy.get('[data-testid="inference-tco-badges"] thead th')
      .first()
      .find('[data-testid="inference-tco-reset"]')
      .should('be.visible');
    cy.get('[data-testid="inference-tco-reset"]').should('have.text', 'Reset').click();
    cy.get('@setUserCosts').should('have.been.calledWith', null);
    cy.get('@setSelectedYAxisMetric').should('have.been.calledWith', 'y_costh');
  });

  it('quotes read-only prices without inputs', () => {
    mountWithProviders(<InferenceTcoBadges bases={BASES} values={VALUES} editable={false} />, {
      inference: { selectedYAxisMetric: 'y_costhOutput' },
      globalFilters: {},
    });
    cy.get('[data-testid="inference-tco-badges"] input').should('not.exist');
    cy.get('[data-testid="inference-tco-badge"]').first().should('have.text', '2.31');
  });

  for (const width of [375, 768, 1440]) {
    it(`puts the cost tier in the price table row above one meta line at ${width}px`, () => {
      cy.viewport(width, 400);
      mountWithProviders(
        <ResultContext
          locale="en"
          layout="footer"
          costTier="Owning at large hyperscaler volume"
          costTierControl={<CostTierSelector footer />}
          priceTable={<InferenceTcoBadges bases={REGISTRY_BASES.slice(0, 9)} values={PUBLISHED} />}
          date="2026-11-07"
          source="SemiAnalysis InferenceX™"
          metaEnd={<PricesSourceLink />}
        />,
        { inference: { selectedYAxisMetric: 'y_tokensPerDollarH' }, globalFilters: {} },
      );
      cy.get('[data-testid="inference-tco-badges"] tbody th')
        .should('not.contain.text', 'TCO')
        .find('[data-testid="result-context-cost-tier"] [data-testid="cost-tier-selector"]')
        .should('be.visible')
        .and('contain.text', 'Owning at large hyperscaler volume');
      cy.get('[data-testid="cost-tier-selector"]').should('have.length', 1);
      cy.get('[data-testid="result-context-cost-tier"] .export-only')
        .should('have.text', 'Owning at large hyperscaler volume')
        .and('not.be.visible');
      cy.get('[data-testid="inference-tco-badges"]').then(($table) => {
        const table = $table[0].getBoundingClientRect();
        expect(table.right).to.be.at.most(width);
        cy.get('[data-testid="result-context"]').should(($context) => {
          const context = $context[0].getBoundingClientRect();
          const doc = $context[0].ownerDocument;
          const tier = doc.querySelector('[data-testid="cost-tier-selector"]')!;
          const date = doc.querySelector('[data-testid="result-context"] dd.tabular-nums')!;
          const source = doc
            .querySelector('[data-testid="tco-prices-source"]')!
            .getBoundingClientRect();
          expect(Math.abs(table.left - context.left)).to.be.lessThan(1);
          expect(Math.abs(tier.getBoundingClientRect().left - context.left)).to.be.lessThan(2);
          expect(getComputedStyle(tier).borderTopColor).to.equal('rgba(0, 0, 0, 0)');
          expect(getComputedStyle($table[0]).borderTopWidth).to.equal('0px');
          expect(date.textContent).to.equal('Nov 7, 2026');
          expect(date.getBoundingClientRect().top).to.be.at.least(table.bottom);
          expect(source.top).to.be.at.least(table.bottom);
          expect(source.right).to.be.at.most(width);
          if (width >= 1440) {
            expect(Math.abs(source.right - context.right)).to.be.lessThan(1);
            expect(Math.abs(source.bottom - date.getBoundingClientRect().bottom)).to.be.lessThan(3);
          }
        });
      });
      cy.get('[data-testid="tco-prices-source"]').should('have.length', 1);
      cy.get('[data-testid="inference-tco-badge"]')
        .first()
        .should(($cell) => expect($cell[0].getBoundingClientRect().right).to.be.at.most(width));
      cy.get(GB300_INPUT).scrollIntoView().should('be.visible');
      cy.document().should((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
    });
  }

  it('keeps the tier cell the same width whichever tier is selected', () => {
    cy.viewport(1440, 400);
    const widths: number[] = [];
    for (const [metric, label] of [
      ['y_tokensPerDollarH', 'Owning at large hyperscaler volume'],
      ['y_tokensPerDollarUser', 'Custom'],
    ] as const) {
      mountWithProviders(
        <ResultContext
          locale="en"
          layout="footer"
          costTier={label}
          costTierControl={<CostTierSelector footer />}
          priceTable={<InferenceTcoBadges bases={BASES} values={VALUES} />}
        />,
        { inference: { selectedYAxisMetric: metric, userCosts: VALUES }, globalFilters: {} },
      );
      cy.get('[data-testid="cost-tier-selector"]')
        .should('contain.text', label)
        .should(($trigger) => {
          expect($trigger[0].scrollWidth).to.be.at.most($trigger[0].clientWidth);
        });
      cy.get('[data-testid="inference-tco-badges"] tbody th').then(($cell) => {
        widths.push($cell[0].getBoundingClientRect().width);
      });
    }
    cy.then(() => {
      expect(widths[0]).to.equal(widths[1]);
      expect(widths[0]).to.be.lessThan(320);
    });
  });
});
