import type { InferenceData } from '@/components/inference/types';

const setBestReplayScrubber = (value: number): Cypress.Chainable<JQuery<HTMLElement>> =>
  cy.get('[data-testid="replay-scrubber"]').then(($element) => {
    const element = $element[0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!;
    setter.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

const bestReplayHardwareKeys = (): Cypress.Chainable<InferenceData['hwKey'][]> =>
  cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path').then(($paths) =>
    [...$paths]
      .map((path) => path.dataset.hwKey)
      .filter((key): key is string => Boolean(key))
      .toSorted(),
  );

describe('Inference replay — Best per SKU', () => {
  it('recomputes the visible winning hwKeys as the MP4 playhead advances', () => {
    cy.intercept('GET', '/api/v1/availability', { fixture: 'api/availability.json' });
    cy.intercept('GET', '**/api/v1/benchmarks?*', { fixture: 'api/benchmarks.json' });
    cy.intercept('GET', '**/api/v1/benchmarks/history*', {
      fixture: 'api/benchmarks-history.json',
    });
    cy.intercept('GET', '/api/v1/workflow-info?*', { fixture: 'api/workflow-info.json' });

    cy.visit('/inference?g_model=DeepSeek-R1-0528&i_seq=1k%2F1k&i_prec=fp8&i_best=', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="chart-figure"]')
      .first()
      .within(() => {
        cy.get('[data-testid="scatter-best-per-sku"]').should('have.attr', 'data-state', 'checked');
        cy.get('[data-testid="export-button"]').click();
      });
    cy.get('[data-testid="export-mp4-button"]').first().click();
    cy.get('[data-testid="replay-scrubber"]', { timeout: 15_000 }).should('exist');

    setBestReplayScrubber(0);
    bestReplayHardwareKeys().then((startKeys) => {
      expect(startKeys.length, 'at least one SKU winner at the first date').to.be.greaterThan(0);
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path').each(($path) => {
        expect(
          $path.attr('stroke'),
          `${$path.data('hw-key')} reuses its current parent SKU color`,
        ).not.to.equal('var(--muted-foreground)');
      });
      setBestReplayScrubber(1000);
      bestReplayHardwareKeys().then((endKeys) => {
        expect(endKeys.length, 'at least one SKU winner at the last date').to.be.greaterThan(0);
        expect(endKeys, 'historical winners are not frozen to the first frame').not.to.deep.equal(
          startKeys,
        );
      });
    });
  });
});
