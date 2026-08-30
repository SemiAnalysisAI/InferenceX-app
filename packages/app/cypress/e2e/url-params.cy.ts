/**
 * Tests that URL parameters correctly drive UI state and that user interactions
 * update the visible output (selector text, SVG axis labels).
 * Merged from url-params.cy.ts + chart-filter-effects.cy.ts + high-contrast.cy.ts.
 */
import { expandLegendAdvanced } from '../support/legend-advanced';
const visitWithDismissedModal = (path: string) => {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
};

const visitWithErrorSpy = (path: string) => {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      cy.stub(win.console, 'error').as('consoleError');
    },
  });
};

const assertNoHydrationMismatch = () => {
  cy.get('[data-testid="scenario-selector"]').should('be.visible');
  cy.get('@consoleError').then((spy) => {
    const calls = (spy as unknown as { args: unknown[][] }).args;
    const hydration = calls.filter((args) =>
      args.some((a) => typeof a === 'string' && /hydrat(?:ion|ed) (?:mismatch|failed)/iu.test(a)),
    );
    expect(hydration, JSON.stringify(hydration)).to.have.length(0);
  });
};

describe('URL Parameter Persistence', () => {
  it('page loads without error with unknown params', () => {
    visitWithDismissedModal('/inference?unknown_param=test');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  describe('Inference legend', () => {
    it('i_legend=0 hides the sidebar legend on load and the reopen button restores it', () => {
      visitWithDismissedModal('/inference?i_legend=0');
      cy.get('[data-testid="legend-open-button"]').first().should('be.visible');
      cy.get('.sidebar-legend').should('not.exist');

      cy.get('[data-testid="legend-open-button"]').first().click();
      cy.get('.sidebar-legend').first().should('be.visible');
      cy.get('[data-testid="legend-open-button"]').should('not.exist');
    });

    // The address bar is deliberately left clean after load (see url-state.ts)
    // — filter changes like closing the legend only reach the in-memory share
    // state, so this asserts the UI transition rather than location.search.
    it('legend close button hides the panel and the reopen button restores it', () => {
      visitWithDismissedModal('/inference');
      cy.get('.sidebar-legend').first().should('be.visible');

      cy.get('[data-testid="legend-close-button"]').first().click();
      cy.get('.sidebar-legend').should('not.exist');
      cy.get('[data-testid="legend-open-button"]').first().should('be.visible');

      cy.get('[data-testid="legend-open-button"]').first().click();
      cy.get('.sidebar-legend').first().should('be.visible');
      cy.get('[data-testid="legend-open-button"]').should('not.exist');
    });

    it('preserves a legend subset when chart metrics change', () => {
      visitWithDismissedModal('/inference');

      cy.get('[data-testid="chart-legend"] input[type="checkbox"]:checked').should(
        'have.length.greaterThan',
        1,
      );
      cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide "]')
        .first()
        .closest('li')
        .find('input[type="checkbox"]')
        .invoke('attr', 'id')
        .then((hiddenInputId) => {
          expect(hiddenInputId).to.be.a('string');
          expect(hiddenInputId).to.have.length.greaterThan(0);
          const selector = `#${CSS.escape(hiddenInputId!)}`;

          cy.get(selector).parent().find('[role="button"][aria-label^="Hide "]').click();
          cy.get(selector).should('not.be.checked');

          cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
          cy.contains('[role="option"]', 'All-in Provisioned Joules per Total Token').click({
            force: true,
          });
          cy.get(selector).should('not.be.checked');

          cy.get('[data-testid="x-axis-mode-ttft"]').click();
          cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
          cy.get(selector).should('not.be.checked');
        });
    });

    it('refreshes the automatic Best per SKU selection when the metric changes', () => {
      visitWithDismissedModal('/inference');

      // Best per SKU lives in the Quick Filters dialog now.
      cy.get('[data-testid="scatter-quick-filters"]').click();
      cy.get('[data-testid="quick-filter-best-per-sku"]').should(
        'have.attr',
        'data-state',
        'checked',
      );
      cy.contains('button', 'Done').click();
      cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');

      cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked')
        .then(($inputs) => [...$inputs].map((input) => input.id).toSorted())
        .then((before) => {
          cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
          cy.contains(
            '[role="option"]',
            'Cost per Million Total Tokens (Owning - Hyperscaler)',
          ).click({ force: true });

          cy.get('[data-testid="scatter-quick-filters"]').click();
          cy.get('[data-testid="quick-filter-best-per-sku"]').should(
            'have.attr',
            'data-state',
            'checked',
          );
          cy.contains('button', 'Done').click();
          cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
          cy.get('[data-testid="x-axis-mode-ttft"]').click();
          cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
          cy.get('[data-testid="chart-legend"] ul input[type="checkbox"]:checked').then(
            ($inputs) => {
              const after = [...$inputs].map((input) => input.id).toSorted();
              expect(after, 'metric-specific Best per SKU winners').not.to.deep.equal(before);
            },
          );
        });
    });
  });

  describe('Provider remount state', () => {
    it('preserves filters across a standalone dashboard route', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'Qwen3.5 397B').click();
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
      // Navigate immediately to cover pending writes inside the debounce window.
      cy.get('[data-testid="tab-trigger-gpu-specs"]').click();
      cy.url().should('include', '/gpu-specs');
      cy.get('[data-testid="tab-trigger-inference"]').click();

      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
    });

    it('preserves the newest pending model across a retained-provider tab switch', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'MiniMax M3 428B').click();
      cy.get('[data-testid="model-selector"]').should('contain.text', 'MiniMax M3 428B');
      cy.wait(200);

      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'Qwen3.5 397B').click();
      cy.get('[data-testid="tab-trigger-evaluation"]').click();
      cy.location('pathname').should('eq', '/evaluation');
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.location('pathname').should('eq', '/inference');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Qwen3.5 397B');
    });
  });

  describe('Inference Y-axis metric', () => {
    it('i_metric URL param pre-selects the metric and updates SVG axis label', () => {
      visitWithDismissedModal('/inference?i_metric=y_costh');

      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Cost per Million Total Tokens (Owning - Hyperscaler)',
      );

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Cost per Million Total Tokens ($)');
    });

    it('changing Y-axis metric via dropdown updates SVG axis label', () => {
      visitWithDismissedModal('/inference');

      // The dashboard opens on normalized token revenue so fixed-price
      // scenarios still compare hardware before switching metrics.
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('contain.text', 'Token Revenue per GPU Hour at Normalized Pricing');

      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.contains('[role="option"]', 'Cost per Million Total Tokens (Owning - Hyperscaler)').click({
        force: true,
      });

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Cost per Million Total Tokens ($)');
    });

    it('maps the removed API-pricing URL to Neocloud infrastructure spend', () => {
      visitWithDismissedModal('/inference?i_metric=y_tokensPerDollar');

      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Total Tokens per $1 of Infrastructure Spend (Owning - Neocloud Giant)',
      );
      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Total Tokens per $1 of Infrastructure Spend (tok/$)');
    });

    it('keeps the legacy i_metric=y alias on raw throughput', () => {
      visitWithDismissedModal('/inference?i_metric=y');

      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Token Throughput per Chip',
      );
    });

    it('selecting a Y-axis metric updates the displayed value', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.get('[role="option"]')
        .eq(1)
        .then(($option) => {
          const optionText = $option.text().trim();
          cy.wrap($option).click({ force: true });
          cy.get('[data-testid="yaxis-metric-selector"]')
            .invoke('text')
            .should('include', optionText);
        });
    });

    it('switching to energy metric updates SVG axis label to joules', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="scatter-graph"]').first().should('be.visible');

      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.contains('[role="option"]', 'All-in Provisioned Joules per Total Token').click({
        force: true,
      });

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'All-in Provisioned J per Total Token (J/tok)');
    });

    it('i_metric=y_tpPerMw pre-selects throughput-per-MW', () => {
      visitWithDismissedModal('/inference?i_metric=y_tpPerMw');

      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Token Throughput per All in Utility MW',
      );

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('contain.text', 'Token Throughput per All in Utility MW');
    });

    it('keeps tooltip rulers aligned after a zoomed metric switch', () => {
      visitWithDismissedModal('/inference?i_metric=y_tpPerGpu');
      expandLegendAdvanced();
      cy.get('#scatter-log-scale').first().click();

      cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]')
        .first()
        .then(($svg) => {
          const svg = $svg[0] as unknown as SVGSVGElement & { __zoom?: { k: number } };
          const bounds = svg.getBoundingClientRect();
          for (let i = 0; i < 2; i += 1) {
            svg.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: -240,
                clientX: bounds.x + bounds.width / 2,
                clientY: bounds.y + bounds.height / 2,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
          expect(svg.__zoom?.k, 'active zoom scale').to.be.greaterThan(1);
        });

      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.contains('[role="option"]', 'Input Token Throughput per Chip').click({ force: true });
      cy.get('[data-testid="yaxis-metric-selector"]').should(
        'contain.text',
        'Input Token Throughput per Chip',
      );

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .within(() => {
          cy.get<SVGGElement>('.dot-group')
            .first()
            .then(($point) => {
              const match = $point
                .attr('transform')
                ?.match(/translate\((?<x>[^,]+),(?<y>[^)]+)\)/u);
              expect(match, 'point transform').not.to.equal(null);
              const pointX = Number(match?.groups?.x);
              const pointY = Number(match?.groups?.y);

              cy.wrap($point).trigger('mouseenter', { force: true });
              cy.get('.vertical-ruler')
                .invoke('attr', 'x1')
                .then((x) => expect(Number(x)).to.be.closeTo(pointX, 1));
              cy.get('.horizontal-ruler')
                .invoke('attr', 'y1')
                .then((y) => expect(Number(y)).to.be.closeTo(pointY, 1));
            });
        });
    });
  });

  describe('Reliability date range', () => {
    it('r_range=last-7-days pre-selects date range', () => {
      visitWithDismissedModal('/reliability?r_range=last-7-days');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 7 days');
    });

    it('r_range=last-3-months pre-selects "Last 3 months"', () => {
      visitWithDismissedModal('/reliability?r_range=last-3-months');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 3 months');
    });

    it('changing reliability date range updates displayed selection', () => {
      visitWithDismissedModal('/reliability');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').click({ force: true });
      cy.contains('[role="option"]', 'Last month').click({ force: true });
      cy.get('[data-testid="reliability-date-range"]').should('contain', 'Last month');
    });
  });

  describe('Hydration on shared-link entry', () => {
    // Regression coverage for GlobalFilterContext.tsx (layout-effect URL override)
    // and compare/[slug]/page.tsx (server-side searchParams threading). Both
    // were introduced to silence a SSR/CSR hydration mismatch.

    it('/inference?i_seq=1k/1k seeds the sequence without a hydration error', () => {
      visitWithErrorSpy('/inference?i_seq=1k/1k');
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '1K / 1K');
      assertNoHydrationMismatch();
    });

    it('/compare/[slug] with ?i_seq=1k/1k seeds the sequence without a hydration error', () => {
      // Visit the canonical model-prefixed slug so the assertion is directly
      // about the rendered page, not about a bare-slug redirect interleaving.
      visitWithErrorSpy('/compare/deepseek-r1-h100-vs-h200?i_seq=1k/1k');
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '1K / 1K');
      assertNoHydrationMismatch();
    });

    it('/compare/[slug] with invalid ?i_seq=junk falls back to the seeded default', () => {
      visitWithErrorSpy('/compare/deepseek-r1-h100-vs-h200?i_seq=junk');
      cy.get('[data-testid="scenario-selector"]')
        .invoke('text')
        .should('not.contain', 'junk')
        .and('match', /[18]K . [18]K/u);
      assertNoHydrationMismatch();
    });

    it('/inference?g_model=gpt-oss-120b seeds the model without a hydration error', () => {
      visitWithErrorSpy('/inference?g_model=gpt-oss-120b');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'gpt-oss 120B');
      assertNoHydrationMismatch();
    });

    it('/inference with invalid ?g_model=junk falls back to the default', () => {
      visitWithErrorSpy('/inference?g_model=junk');
      cy.get('[data-testid="model-selector"]').invoke('text').should('not.contain', 'junk');
      assertNoHydrationMismatch();
    });

    it('/inference?i_prec=fp8 seeds the precision without a hydration error', () => {
      // Pair `i_prec=fp8` with a model that actually has FP8 in availability.
      // The default model (DeepSeek-V4-Pro) is FP4-only in the test fixtures,
      // so `effectivePrecisions` would otherwise intersect the URL selection
      // with the available set and fall back to FP4.
      visitWithErrorSpy('/inference?g_model=DeepSeek-R1-0528&i_prec=fp8');
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP8');
      assertNoHydrationMismatch();
    });

    it('/inference with invalid ?i_prec=junk falls back to the default', () => {
      // Pair with a multi-precision model — the FP4-only default model hides
      // the precision selector entirely, leaving nothing to assert against.
      visitWithErrorSpy('/inference?g_model=DeepSeek-R1-0528&i_prec=junk');
      cy.get('[data-testid="precision-multiselect"]').invoke('text').should('not.contain', 'junk');
      assertNoHydrationMismatch();
    });

    it('/inference?g_rundate=2026-01-15 accepts the validated date without a hydration error', () => {
      // The regex validator allows YYYY-MM-DD; we only assert no hydration error
      // because the date picker UI doesn't expose a stable selector for assertion.
      visitWithErrorSpy('/inference?g_rundate=2026-01-15');
      assertNoHydrationMismatch();
    });

    it('/inference with invalid ?g_rundate=not-a-date is dropped by the regex (no hydration error)', () => {
      visitWithErrorSpy('/inference?g_rundate=not-a-date');
      assertNoHydrationMismatch();
    });

    it('/inference?g_runid=run-12345 accepts the validated run id without a hydration error', () => {
      visitWithErrorSpy('/inference?g_runid=run-12345');
      assertNoHydrationMismatch();
    });

    it('/inference with invalid ?g_runid=$%^$ is dropped by the regex (no hydration error)', () => {
      visitWithErrorSpy('/inference?g_runid=$%^$');
      assertNoHydrationMismatch();
    });

    it('/inference with multiple URL params seeds all of them without a hydration error', () => {
      // Use a model + precision combination that the data supports, otherwise
      // `effectivePrecisions` intersects the selection with available precisions
      // and the UI may render the fallback. dsr1 + fp8 + 1k/1k is supported.
      visitWithErrorSpy('/inference?i_seq=1k/1k&g_model=DeepSeek-R1-0528&i_prec=fp8');
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '1K / 1K');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek');
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP8');
      assertNoHydrationMismatch();
    });
  });

  describe('High contrast mode', () => {
    it('inference loads with high contrast off by default', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=0 disables high contrast on load', () => {
      visitWithDismissedModal('/inference?i_hc=0');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 applies high contrast on load', () => {
      visitWithDismissedModal('/inference?i_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('multiple high contrast params can coexist in URL', () => {
      visitWithDismissedModal('/inference?i_hc=1&r_hc=1&e_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('r_hc=1 applies to reliability chart', () => {
      visitWithDismissedModal('/reliability?r_hc=1');
      cy.get('[data-testid="reliability-chart-display"]').should('exist');
      cy.get('#reliability-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('e_hc=1 applies to evaluation chart', () => {
      visitWithDismissedModal('/evaluation?e_hc=1');
      cy.get('[data-testid="evaluation-chart-display"]').should('exist');
      cy.get('[data-testid="evaluation-view-toggle"]').contains('Chart').click();
      cy.get('#eval-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('historical trends tab shares the inference high-contrast default (off)', () => {
      // Historical reads highContrast from the shared inference display domain,
      // so it inherits the default-off behavior.
      visitWithDismissedModal('/historical');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 enables historical trends high contrast', () => {
      visitWithDismissedModal('/historical?i_hc=1');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });
  });

  describe('Default toggle states (share-link correctness)', () => {
    it('a bare /inference link with neither param renders high contrast AND parallelism labels off', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
      cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1&i_advlabel=1 enables both high contrast and parallelism labels on load', () => {
      visitWithDismissedModal('/inference?i_hc=1&i_advlabel=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      expandLegendAdvanced();
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
      cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
    });
  });
});
