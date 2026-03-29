/**
 * Tests for the "Historical Trends" tab.
 * Shows interpolated GPU performance over time at a user-selected interactivity level.
 */
describe('Historical Trends Tab', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/historical');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
  });

  it('renders the Historical Trends tab content', () => {
    cy.get('[data-testid="historical-trends-display"]').should('contain.text', 'Over Time');
  });

  it('renders a slider for target interactivity', () => {
    cy.get('[data-testid="historical-trends-display"]').find('input[type="range"]').should('exist');
  });

  it('renders a number input for precise interactivity value', () => {
    cy.get('[data-testid="historical-trends-display"]')
      .find('input[type="number"]')
      .should('exist');
  });

  it('renders a trend chart SVG after data loads', () => {
    cy.get('[data-testid="historical-trends-display"]').find('svg').should('exist');
  });

  it('tab trigger is visible in desktop navigation', () => {
    cy.get('[data-testid="tab-trigger-historical"]').should('contain.text', 'Historical Trends');
  });
});

describe('Historical Trends — Content & Interactions', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/historical');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
  });

  it('renders SVG trend line paths after data loads', () => {
    cy.get('[data-testid="trend-chart-svg"]').should('exist');
    cy.get('[data-testid="trend-chart-svg"] path.line-path').should('have.length.greaterThan', 0);
  });

  it('renders data point circles on trend lines', () => {
    cy.get('[data-testid="trend-chart-svg"] circle').should('have.length.greaterThan', 0);
  });

  it('target interactivity slider value updates when the number input is changed', () => {
    cy.get('[data-testid="historical-trends-display"]').find('input[type="number"]').as('numInput');
    cy.get('@numInput').clear().type('50');
    cy.get('[data-testid="historical-trends-display"]')
      .find('input[type="range"]')
      .should('have.value', '50');
  });

  it('chart title includes "Over Time" and "Interactivity" reflecting the operating point', () => {
    cy.get('[data-testid="historical-trend-figure"]')
      .find('h2')
      .invoke('text')
      .should('include', 'Over Time')
      .and('include', 'Interactivity');
  });

  it('model selector is present and has selectable options', () => {
    // Clear any stale Radix scroll lock from prior Select interactions
    cy.document().then((doc) => {
      doc.body.removeAttribute('data-scroll-locked');
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="model-selector"]').should('be.visible');
    // Radix Select may need a brief settle after scroll lock removal
    cy.wait(100);
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('sequence selector is present and has selectable options', () => {
    cy.document().then((doc) => {
      doc.body.removeAttribute('data-scroll-locked');
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="sequence-selector"]').should('be.visible');
    cy.get('[data-testid="sequence-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 0);
    cy.get('body').type('{esc}');
  });

  it('precision multi-select is present', () => {
    cy.get('[data-testid="precision-multiselect"]').should('be.visible');
  });

  it('legend sidebar renders with hardware items matching visible trend lines', () => {
    cy.get('[data-testid="historical-trend-figure"]')
      .find('.sidebar-legend')
      .should('exist')
      .find('li')
      .should('have.length.greaterThan', 0);
  });

  it('Log Scale switch exists in the legend and can be toggled', () => {
    cy.document().then((doc) => {
      doc.body.removeAttribute('data-scroll-locked');
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="historical-trend-figure"]')
      .find('.sidebar-legend')
      .contains('label', 'Log Scale')
      .should('exist');

    cy.get('#historical-log-scale').click();
    cy.get('#historical-log-scale').should('have.attr', 'data-state', 'checked');

    cy.get('#historical-log-scale').click();
    cy.get('#historical-log-scale').should('have.attr', 'data-state', 'unchecked');
  });

  it('GPU Config multi-select is hidden (Historical Trends uses hideGpuComparison)', () => {
    cy.get('[data-testid="gpu-multiselect"]').should('not.exist');
  });

  it('Y-axis metric selector is present and can be changed', () => {
    cy.document().then((doc) => {
      doc.body.removeAttribute('data-scroll-locked');
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="yaxis-metric-selector"]').should('be.visible');
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.get('[role="option"]').should('have.length.greaterThan', 1);

    cy.get('[data-testid="yaxis-metric-selector"]')
      .invoke('text')
      .then((initialText) => {
        cy.get('[role="option"]').eq(2).click();
        cy.get('[data-testid="yaxis-metric-selector"]')
          .invoke('text')
          .should('not.eq', initialText.trim());
      });
  });

  it('changing model updates the chart title to reflect the new model', () => {
    cy.document().then((doc) => {
      doc.body.removeAttribute('data-scroll-locked');
      doc.body.style.removeProperty('pointer-events');
    });
    cy.get('[data-testid="historical-trend-figure"]').should('exist');
    cy.wait(100);

    cy.get('[data-testid="historical-trend-figure"] figcaption p')
      .first()
      .invoke('text')
      .then((initialSubtitle) => {
        cy.get('[data-testid="model-selector"]').click();
        cy.get('[role="option"]').then(($options) => {
          if ($options.length <= 1) return;
          cy.wrap($options).last().click();

          cy.get('[data-testid="historical-trend-figure"] figcaption p')
            .first()
            .invoke('text')
            .should('not.eq', initialSubtitle);
        });
      });
  });

  it('interactivity range labels are displayed below the slider', () => {
    cy.get('[data-testid="historical-trends-display"]')
      .find('input[type="range"]')
      .parent()
      .find('.relative.text-muted-foreground span')
      .should('have.length.greaterThan', 0)
      .each(($span) => {
        expect($span.text()).to.match(/\d+/);
      });
  });
});
