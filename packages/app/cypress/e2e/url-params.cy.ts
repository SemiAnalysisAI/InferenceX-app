/**
 * Tests that URL parameters correctly drive UI state and that user interactions
 * update the visible output (selector text, SVG axis labels).
 * Merged from url-params.cy.ts + chart-filter-effects.cy.ts + high-contrast.cy.ts.
 */
describe('URL Parameter Persistence', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('page loads without error with unknown params', () => {
    cy.visit('/inference?unknown_param=test');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  describe('Inference legend', () => {
    it('i_legend=0 collapses the sidebar legend on load', () => {
      cy.visit('/inference?i_legend=0');
      cy.get('.sidebar-legend').first().should('be.visible');
      cy.get('.sidebar-legend').first().should('not.have.class', 'bg-accent');
    });
  });

  describe('Inference Y-axis metric', () => {
    it('i_metric URL param pre-selects the metric and updates SVG axis label', () => {
      cy.visit('/inference?i_metric=y_costh');

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
      cy.visit('/inference');

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
      cy.visit('/inference');
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
      cy.visit('/inference');
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
      cy.visit('/inference?i_metric=y_tpPerMw');

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
      cy.visit('/reliability?r_range=last-7-days');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 7 days');
    });

    it('r_range=last-3-months pre-selects "Last 3 months"', () => {
      cy.visit('/reliability?r_range=last-3-months');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').should('contain.text', 'Last 3 months');
    });

    it('changing reliability date range updates displayed selection', () => {
      cy.visit('/reliability');
      cy.url().should('include', '/reliability');
      cy.get('[data-testid="reliability-date-range"]').click({ force: true });
      cy.contains('[role="option"]', 'Last month').click({ force: true });
      cy.get('[data-testid="reliability-date-range"]').should('contain', 'Last month');
    });
  });

  describe('High contrast mode', () => {
    it('page loads without high contrast by default', () => {
      cy.visit('/inference');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 applies high contrast on load', () => {
      cy.visit('/inference?i_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('multiple high contrast params can coexist in URL', () => {
      cy.visit('/inference?i_hc=1&r_hc=1&e_hc=1');
      cy.get('[data-testid="scatter-graph"]').should('exist');
      cy.get('#scatter-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('r_hc=1 applies to reliability chart', () => {
      cy.visit('/reliability?r_hc=1');
      cy.get('[data-testid="reliability-chart-display"]').should('exist');
      cy.get('#reliability-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('e_hc=1 applies to evaluation chart', () => {
      cy.visit('/evaluation?e_hc=1');
      cy.get('[data-testid="evaluation-chart-display"]').should('exist');
      cy.get('[data-testid="evaluation-view-toggle"]').contains('Chart').click();
      cy.get('#eval-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });

    it('historical trends tab has high contrast switch off by default', () => {
      cy.visit('/historical');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'unchecked');
    });

    it('i_hc=1 enables historical trends high contrast', () => {
      cy.visit('/historical?i_hc=1');
      cy.get('[data-testid="historical-trends-display"]').should('exist');
      cy.get('#historical-high-contrast').first().should('have.attr', 'data-state', 'checked');
    });
  });
});
