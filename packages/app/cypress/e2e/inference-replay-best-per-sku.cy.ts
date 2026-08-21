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
  it('keeps changing winner geometry continuous and offers Best-per-SKU-only speeds through 5×', () => {
    cy.intercept('GET', '/api/v1/availability', { fixture: 'api/availability.json' });
    cy.intercept('GET', '**/api/v1/benchmarks?*', { fixture: 'api/benchmarks.json' });
    cy.intercept('GET', '**/api/v1/benchmarks/history*', {
      fixture: 'api/benchmarks-history.json',
    });
    cy.intercept('GET', '/api/v1/workflow-info?*', { fixture: 'api/workflow-info.json' });

    cy.visit('/inference?g_model=DeepSeek-R1-0528&i_seq=1k%2F1k&i_prec=fp8&i_best=', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        const nativeMatchMedia = win.matchMedia.bind(win);
        win.matchMedia = (query: string) => {
          if (query !== '(prefers-reduced-motion: reduce)') return nativeMatchMedia(query);
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        };
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

    // Regression: the runtime that exposed the bug reports reduced motion.
    // Best-per-SKU MP4 mode is an explicit animation request, so it must use
    // continuous fractions instead of the reduced-motion 1.2s slideshow.
    cy.window().then((win) => {
      expect(win.matchMedia('(prefers-reduced-motion: reduce)').matches).to.equal(true);
    });
    cy.get('[data-testid="replay-reset"]').click();
    cy.get('[data-testid="replay-play-pause"]').click();
    cy.wait(300);
    cy.get('[data-testid="replay-scrubber"]')
      .invoke('val')
      .then((value) => {
        expect(
          Number(value),
          'continuous Best-per-SKU animation advances before 1.2s',
        ).to.be.greaterThan(0);
      });
    cy.get('[data-testid="replay-play-pause"]').click();
    cy.get('[data-testid="replay-reset"]').click();

    setBestReplayScrubber(0);
    bestReplayHardwareKeys().then((startKeys) => {
      expect(startKeys.length, 'at least one SKU winner at the first date').to.be.greaterThan(0);
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path').then(($startPaths) => {
        const startPaths = [...$startPaths].map((node) => ({
          node: node as unknown as SVGPathElement,
          hwKey: node.dataset.hwKey,
          seriesKey: node.dataset.seriesKey,
          d: node.getAttribute('d'),
        }));
        for (const path of startPaths) {
          expect(
            path.node.getAttribute('stroke'),
            `${path.hwKey} reuses its current parent SKU color`,
          ).not.to.equal('var(--muted-foreground)');
        }

        setBestReplayScrubber(1000);
        cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path').then(($endPaths) => {
          const endPaths = [...$endPaths] as unknown as SVGPathElement[];
          const moved = startPaths.find((start) => {
            const reused = endPaths.find((end) => end === start.node);
            return reused && reused.dataset.hwKey !== start.hwKey;
          });
          expect(
            moved,
            'one physical SKU reuses its roofline when the winner changes',
          ).not.to.equal(undefined);
          const movedNode = moved!.node;
          expect(movedNode.dataset.seriesKey).to.equal(moved!.seriesKey);
          cy.wrap(movedNode).should(() => {
            expect(
              movedNode.getAttribute('d'),
              'the stable roofline receives the deterministic MP4-frame geometry',
            ).not.to.equal(moved!.d);
          });
        });

        bestReplayHardwareKeys().then((endKeys) => {
          expect(endKeys.length, 'at least one SKU winner at the last date').to.be.greaterThan(0);
          expect(endKeys, 'historical winners are not frozen to the first frame').not.to.deep.equal(
            startKeys,
          );
        });
      });
    });

    cy.get('[data-testid="replay-speed-select"]').click();
    cy.get('[data-testid="replay-speed-5x"]').should('be.visible').click();
    cy.get('[data-testid="replay-speed-select"]').should('contain.text', '5×');

    cy.get('[data-testid="replay-panel-chart-0"] [data-testid="scatter-best-per-sku"]').click();
    cy.get('[data-testid="replay-speed-select"]').should('contain.text', '2×').click();
    cy.get('[data-testid="replay-speed-5x"]').should('not.exist');
  });
});
