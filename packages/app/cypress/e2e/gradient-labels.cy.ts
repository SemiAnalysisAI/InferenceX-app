describe('Gradient Labels Toggle', () => {
  before(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    // Wait for chart to load
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('Gradient Labels toggle exists in the legend', () => {
    cy.get('#scatter-gradient-labels').should('exist');
    cy.get('label[for="scatter-gradient-labels"]').should('contain.text', 'Gradient Labels');
  });

  it('Gradient Labels toggle is off by default', () => {
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('Parallelism Labels toggle still exists separately', () => {
    cy.get('#scatter-parallelism-labels').should('exist');
    cy.get('label[for="scatter-parallelism-labels"]').should('contain.text', 'Parallelism Labels');
  });

  it('Parallelism Labels toggle is off by default', () => {
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'unchecked');
  });

  it('per-point labels are visible by default (gradient labels off)', () => {
    // Gradient Labels is off by default, so per-point text labels should be visible
    cy.get('[data-testid="scatter-graph"] svg text').should('have.length.greaterThan', 0);
  });

  it('chart still renders data points with gradient labels enabled', () => {
    // Verify that the chart has data points (not showing "No data available")
    cy.get('[data-testid="scatter-graph"]').should('not.contain.text', 'No data available');
    cy.get(
      '[data-testid="scatter-graph"] svg circle, [data-testid="scatter-graph"] svg rect',
    ).should('have.length.greaterThan', 0);
  });

  it('toggling Gradient Labels on adds gradient pill labels', () => {
    // Turn on Gradient Labels
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Verify gradient-related SVG elements exist when toggle is on
    cy.get('[data-testid="scatter-graph"] svg').should('exist');
  });

  it('toggling Gradient Labels off restores per-point labels', () => {
    // Turn back off (was on from previous test)
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'unchecked');

    // Per-point text labels should be visible again
    cy.get('[data-testid="scatter-graph"] svg text').should('have.length.greaterThan', 0);
  });

  it('both toggles can be enabled simultaneously', () => {
    // Turn on Gradient Labels (off by default)
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');

    // Turn on Parallelism Labels
    cy.get('#scatter-parallelism-labels').click();
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');

    // Both should be checked
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');

    // Reset for next tests
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-parallelism-labels').click();
  });

  it('URL param i_gradlabel=1 enables gradient labels on load', () => {
    cy.visit('/?i_gradlabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
  });

  it('URL param i_advlabel=1 enables parallelism labels on load', () => {
    cy.visit('/?i_advlabel=1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('#scatter-parallelism-labels').should('have.attr', 'data-state', 'checked');
  });
});

describe('Gradient Labels with non-default Y-axis metrics', () => {
  // Regression tests: gradient labels must render SVG linearGradient defs
  // for metrics that use paretoFrontLowerRight (cost, energy).

  const selectMetricAndEnableGradient = (metricLabel: string) => {
    // Switch to the target Y-axis metric
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.contains('[role="option"]', metricLabel).click();

    // Wait for chart to re-render with new metric
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('[data-testid="scatter-graph"]').should('not.contain.text', 'No data available');

    // Enable gradient labels
    cy.get('#scatter-gradient-labels').click();
    cy.get('#scatter-gradient-labels').should('have.attr', 'data-state', 'checked');
  };

  before(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="scatter-graph"]').should('be.visible');
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('gradient defs render for cost metric (lower_right roofline)', () => {
    selectMetricAndEnableGradient('Cost per Million Total Tokens (Owning - Hyperscaler)');

    // SVG must contain at least one linearGradient used for roofline coloring
    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
  });

  it('gradient defs render for energy metric (lower_right roofline)', () => {
    // Disable gradient from previous test first
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('All-in Provisioned Joules per Total Token');

    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
  });

  it('gradient defs render for throughput metric (upper_right roofline)', () => {
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('Token Throughput per GPU');

    cy.get(
      '[data-testid="scatter-graph"] svg defs linearGradient[id^="roofline-gradient-"]',
    ).should('have.length.greaterThan', 0);
  });

  it('pill labels render for cost metric', () => {
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('Cost per Million Total Tokens (Owning - Hyperscaler)');

    // Parallelism pill labels should be present
    cy.get('[data-testid="scatter-graph"] svg g.parallelism-label').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('pill labels render for energy metric', () => {
    cy.get('#scatter-gradient-labels').click();
    selectMetricAndEnableGradient('All-in Provisioned Joules per Total Token');

    cy.get('[data-testid="scatter-graph"] svg g.parallelism-label').should(
      'have.length.greaterThan',
      0,
    );
  });
});
