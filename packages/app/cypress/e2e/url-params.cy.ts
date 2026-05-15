/**
 * Tests that URL parameters correctly drive UI state and that user interactions
 * update the visible output (selector text, SVG axis labels).
 * Merged from url-params.cy.ts + chart-filter-effects.cy.ts + high-contrast.cy.ts.
 */
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
  cy.get('[data-testid="sequence-selector"]').should('be.visible');
  cy.get('@consoleError').then((spy) => {
    const calls = (spy as unknown as { args: unknown[][] }).args;
    const hydration = calls.filter((args) =>
      args.some((a) => typeof a === 'string' && /hydrat(ion|ed) (mismatch|failed)/iu.test(a)),
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
    it('i_legend=0 collapses the sidebar legend on load', () => {
      visitWithDismissedModal('/inference?i_legend=0');
      cy.get('.sidebar-legend').first().should('be.visible');
      cy.get('.sidebar-legend').first().should('not.have.class', 'bg-accent');
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

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('contain.text', 'Throughput');

      cy.get('[data-testid="yaxis-metric-selector"]').click({ force: true });
      cy.contains('[role="option"]', 'Cost per Million Total Tokens (Owning - Hyperscaler)').click({
        force: true,
      });

      cy.get('[data-testid="scatter-graph"]')
        .first()
        .find('svg text[transform="rotate(-90)"]')
        .should('have.text', 'Cost per Million Total Tokens ($)');
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
      cy.get('[data-testid="sequence-selector"]').should('contain.text', '1K / 1K');
      assertNoHydrationMismatch();
    });

    it('/compare/[slug] with ?i_seq=1k/1k seeds the sequence without a hydration error', () => {
      visitWithErrorSpy('/compare/h100-vs-h200?i_seq=1k/1k');
      cy.get('[data-testid="sequence-selector"]').should('contain.text', '1K / 1K');
      assertNoHydrationMismatch();
    });

    it('/compare/[slug] with invalid ?i_seq=junk falls back to the seeded default', () => {
      visitWithErrorSpy('/compare/h100-vs-h200?i_seq=junk');
      cy.get('[data-testid="sequence-selector"]')
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
      visitWithErrorSpy('/inference?i_prec=fp8');
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP8');
      assertNoHydrationMismatch();
    });

    it('/inference with invalid ?i_prec=junk falls back to the default', () => {
      visitWithErrorSpy('/inference?i_prec=junk');
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
      cy.get('[data-testid="sequence-selector"]').should('contain.text', '1K / 1K');
      cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek');
      cy.get('[data-testid="precision-multiselect"]').should('contain.text', 'FP8');
      assertNoHydrationMismatch();
    });
  });

  describe('High contrast mode', () => {
    it('page loads without high contrast by default', () => {
      visitWithDismissedModal('/inference');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 applies high contrast on load', () => {
      visitWithDismissedModal('/inference?i_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('multiple high contrast params can coexist in URL', () => {
      visitWithDismissedModal('/inference?i_hc=1&r_hc=1&e_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
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

    it('historical trends tab has high contrast switch off by default', () => {
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
});
