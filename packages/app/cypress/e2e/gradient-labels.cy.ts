import { expandLegendAdvanced } from '../support/legend-advanced';

describe('Gradient Labels Toggle', () => {
  before(() => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
    expandLegendAdvanced();
  });

  it('both toggles can be enabled simultaneously', () => {
    cy.get('#scatter-parallelism-labels').then(($el) => {
      if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
    });
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');

    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-parallelism-labels').click();
  });

  it('URL param i_gradlabel=1 enables gradient labels on load', () => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_gradlabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
  });
});

const selectMetricAndEnableGradient = (metricLabel: string | RegExp) => {
  cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
  cy.contains('[data-slot="select-item"]', metricLabel).click({ force: true });

  cy.get('[data-testid="scatter-graph"]').should('be.visible');
  cy.get('[data-testid="scatter-graph"]').should('not.contain.text', 'No data available');

  cy.get('#scatter-gradient-labels').click();
  cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
};

describe('Gradient Labels with non-default Y-axis metrics', () => {
  before(() => {
    cy.visit('/inference?g_model=DeepSeek-V4-Pro', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('gradient defs render for cost metric (lower_right roofline)', () => {
    selectMetricAndEnableGradient(/^Cost per Million Total Tokens$/u);

    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
    cy.get('[data-testid="scatter-graph"] svg g.parallelism-label').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('gradient defs render for energy metric (lower_right roofline)', () => {
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('All-in Provisioned Joules per Total Token');

    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
    cy.get('[data-testid="scatter-graph"] svg g.parallelism-label').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('gradient defs render for throughput metric (upper_right roofline)', () => {
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('Token Throughput per Chip');

    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
  });
});
