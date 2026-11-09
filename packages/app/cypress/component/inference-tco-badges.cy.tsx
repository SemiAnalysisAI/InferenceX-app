import { useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import { CostTierSelector } from '@/components/inference/ui/CostTierSelector';
import { InferenceTcoBadges } from '@/components/inference/ui/InferenceTcoBadges';
import { PricesSourceLink } from '@/components/ui/chart-display-helpers';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { TcoPriceTable } from '@/components/ui/editable-tco-badges';
import { ResultContext } from '@/components/ui/result-context';
import { getGpuSpecs } from '@/lib/catalog/constants';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { createMockInferenceContextValues } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const VALUES = { gb300: 2.31, mi355x: 1.5 };
const BASES = Object.keys(VALUES);
const REGISTRY_BASES = Object.keys(HW_REGISTRY);
const PUBLISHED = Object.fromEntries(
  REGISTRY_BASES.map((base) => [base, getGpuSpecs(base, 'external').costh]),
);
const GB300_INPUT = '[data-testid="cost-input-gb300"]';

const a = () => cy.get(`[data-testid="figure-a"] ${GB300_INPUT}`);

const b = () => cy.get(`[data-testid="figure-b"] ${GB300_INPUT}`);

describe('InferenceTcoBadges', () => {
  for (const count of [2, 12]) {
    it(`exports all ${count} prices without scrollbars in every PNG layout`, () => {
      cy.viewport(375, 900);
      const items = [
        { base: 'gb200', label: 'GB200', value: '1.86' },
        { base: 'tpu7x', label: 'TPU7x', value: '1.21' },
        ...REGISTRY_BASES.filter((base) => !['gb200', 'tpu7x'].includes(base))
          .slice(0, count - 2)
          .map((base) => ({ base, label: base.toUpperCase(), value: '2.31' })),
      ];
      mountWithProviders(
        <div className="p-4">
          <ChartButtons chartId="price-export" />
          <D3Chart
            chartId="price-export"
            data={[]}
            layers={[]}
            height={400}
            xScale={{ type: 'linear', domain: [0, 1] }}
            yScale={{ type: 'linear', domain: [0, 1] }}
            footer={
              <ResultContext
                locale="en"
                layout="footer"
                costTier="Owning at large hyperscaler volume"
                costTierControl={<button type="button">Cost tier</button>}
                priceTable={
                  <TcoPriceTable
                    items={items}
                    editable
                    testId="export-prices"
                    cellTestId="export-price"
                    inputIdPrefix="export-price-input"
                  />
                }
                metaEnd={<PricesSourceLink />}
              />
            }
          />
        </div>,
      );
      const liveTable = '#price-export [data-testid="export-prices"]';
      let liveScroll = 0;
      cy.get(liveTable).should('have.css', 'overflow-x', 'auto');
      if (count > 2) {
        cy.get(liveTable)
          .scrollTo('right')
          .then(($table) => {
            liveScroll = $table[0].scrollLeft;
            expect(liveScroll).to.be.greaterThan(0);
          });
      }
      let png = '';
      let captureCount = 0;
      cy.window().then((win) => {
        cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(function (
          this: HTMLAnchorElement,
        ) {
          if (!this.download.endsWith('.png')) return;
          png = this.href;
          captureCount++;
          const root = win.document.querySelector('#price-export-export')!;
          const wrapper = root.querySelector<HTMLElement>('[data-testid="export-prices"]')!;
          expect(win.getComputedStyle(wrapper).overflowX, 'no exported scroll viewport').to.eq(
            'visible',
          );
          expect(wrapper.scrollWidth, 'all columns fit').to.be.at.most(wrapper.clientWidth + 1);
          expect(wrapper.querySelectorAll('td')).to.have.length(count);
          expect(wrapper.querySelector('tbody th')!.textContent).to.contain(
            'Owning at large hyperscaler volume',
          );
          const frame = root.getBoundingClientRect();
          for (const cell of wrapper.querySelectorAll('th, td')) {
            const bounds = cell.getBoundingClientRect();
            expect(bounds.left).to.be.at.least(frame.left);
            expect(bounds.right).to.be.at.most(frame.right);
            expect(bounds.bottom).to.be.at.most(frame.bottom);
          }
          expect(root.querySelector('[data-testid="tco-prices-source"]')!.textContent).to.contain(
            'SemiAnalysis Market',
          );
        });
      });
      ['auto', '16:9', '1:1'].forEach((ratio, index) => {
        cy.get('[data-testid="export-button"]').click();
        cy.get('[data-testid="png-aspect-ratio"]').select(ratio);
        cy.get('[data-testid="export-png-button"]').click();
        cy.window().should(() => {
          expect(captureCount).to.eq(index + 1);
          expect(png).to.match(/^data:image\/png;base64,/u);
        });
        cy.window().then(async (win) => {
          const image = new win.Image();
          image.src = png;
          await image.decode();
          expect(image.naturalWidth).to.be.greaterThan(0);
          if (ratio !== 'auto') {
            expect(image.naturalWidth / image.naturalHeight).to.be.closeTo(
              ratio === '16:9' ? 16 / 9 : 1,
              0.001,
            );
          }
        });
        cy.get(liveTable)
          .should('have.css', 'overflow-x', 'auto')
          .and(($table) => {
            expect($table[0].scrollLeft).to.eq(liveScroll);
            expect($table.find('input')).to.have.length(count);
          });
      });
    });
  }

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
    cy.get('[data-testid="inference-tco-badges"] [data-testid="inference-tco-reset"]').should(
      'not.exist',
    );
    cy.get('[data-testid="inference-tco-badges"]').then(($table) => {
      cy.get('[data-testid="inference-tco-reset"]').should(($reset) => {
        const table = $table[0].getBoundingClientRect();
        const reset = $reset[0].getBoundingClientRect();
        expect(reset.top).to.be.at.least(table.bottom);
        expect(Math.abs(reset.left - table.left)).to.be.lessThan(1);
      });
    });
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
    it(`puts the cost tier in the price table row and the source under it at ${width}px`, () => {
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
        const grid = $table[0].querySelector('table')!.getBoundingClientRect();
        if (grid.width < width) expect(table.right - grid.right).to.be.closeTo(1, 0.5);
        cy.get('[data-testid="result-context"]').should(($context) => {
          expect(Math.abs(table.left - $context[0].getBoundingClientRect().left)).to.be.lessThan(1);
        });
        cy.get('[data-testid="tco-prices-source"]').should(($source) => {
          const source = $source[0].getBoundingClientRect();
          expect(source.top).to.be.at.least(table.bottom);
          expect(Math.abs(source.left - table.left)).to.be.lessThan(1);
          expect(source.right).to.be.at.most(width);
        });
        cy.get('[data-testid="result-context"] dd.tabular-nums').should(($date) => {
          const doc = $date[0].ownerDocument;
          const date = $date[0].getBoundingClientRect();
          const source = doc
            .querySelector('[data-testid="tco-prices-source"]')!
            .getBoundingClientRect();
          expect($date[0].textContent).to.equal('Nov 7, 2026');
          if (width >= 1440) {
            const context = doc
              .querySelector('[data-testid="result-context"]')!
              .getBoundingClientRect();
            const meta = $date[0].closest('dl')!.parentElement!.getBoundingClientRect();
            expect(date.left).to.be.greaterThan(table.right);
            expect(Math.abs(meta.right - context.right)).to.be.lessThan(1);
            expect(Math.abs(source.bottom - date.bottom)).to.be.lessThan(3);
          } else {
            expect(date.top).to.be.at.least(source.bottom);
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
