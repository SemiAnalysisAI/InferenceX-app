describe('TCO Calculator', () => {
  // ---------------------------------------------------------------------------
  // Tab navigation (must start from / to test tab switching)
  // ---------------------------------------------------------------------------

  describe('tab navigation', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/inference');
    });

    it('shows the TCO Calculator tab trigger', () => {
      cy.get('[data-testid="tab-trigger-calculator"]').should('be.visible');
      cy.get('[data-testid="tab-trigger-calculator"]').should('contain.text', 'TCO Calculator');
    });

    it('clicking the calculator tab navigates to it', () => {
      cy.get('[data-testid="tab-trigger-calculator"]').click();
      cy.url().should('include', '/calculator');
    });

    it('switches back to inference tab and then returns to calculator', () => {
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.url().should('include', '/inference');
      cy.get('[data-testid="tab-trigger-calculator"]').click();
      cy.url().should('include', '/calculator');
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
    });
  });

  // ---------------------------------------------------------------------------
  // All remaining tests visit /calculator directly (once per describe)
  // ---------------------------------------------------------------------------

  describe('controls and chart rendering', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('renders the calculator controls section with heading', () => {
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
      cy.get('[data-testid="calculator-controls"]').should('contain.text', 'TCO Calculator');
    });

    it('renders Model selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-model').should('exist');
      });
    });

    it('renders Sequence selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-sequence').should('exist');
      });
    });

    it('renders Precision multi-selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.contains('Precision').should('exist');
      });
    });

    it('renders Cost Provider selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').should('exist');
      });
    });

    it('renders bar metric toggle buttons', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('[data-testid="calculator-metric-throughput"]').should('be.visible');
        cy.get('[data-testid="calculator-metric-power"]').should('be.visible');
        cy.get('[data-testid="calculator-metric-cost"]').should('be.visible');
      });
    });

    it('throughput metric is active by default', () => {
      cy.get('[data-testid="calculator-metric-throughput"]').should('have.class', 'bg-primary');
    });

    it('renders the Chart | Table view toggle', () => {
      cy.get('[data-testid="calculator-view-toggle"]').should('be.visible');
      cy.get('[data-testid="calculator-chart-view-btn"]').should('be.visible');
      cy.get('[data-testid="calculator-table-view-btn"]').should('be.visible');
    });

    it('chart view is selected by default', () => {
      cy.get('[data-testid="calculator-chart-view-btn"]').should(
        'have.attr',
        'aria-selected',
        'true',
      );
    });

    it('renders the bar chart with SVG bars', () => {
      cy.get('[data-testid="calculator-bar-chart"]').should('be.visible');
      cy.get('[data-testid="calculator-bar-chart"] svg').should('exist');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('does NOT show "No data available" when data loads', () => {
      cy.get('[data-testid="calculator-no-data"]').should('not.exist');
    });

    it('renders chart title matching the selected metric', () => {
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Total Token Throughput per GPU');
    });

    it('renders subtitle with source', () => {
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'SemiAnalysis InferenceX',
      );
    });

    it('renders the chart legend with GPU entries', () => {
      cy.get('.legend-container').scrollIntoView().should('exist');
      cy.get('.legend-container li').should('have.length.greaterThan', 0);
    });

    it('renders the target value slider and input', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]').should('exist');
        cy.get('input[type="number"]').should('exist');
      });
    });

    it('does not show badges when throughput metric is selected', () => {
      cy.get('[data-testid="calculator-cost-badges"]').should('not.exist');
    });

    it('bar chart SVG contains Y-axis tick labels (GPU names)', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .y-axis')
        .find('.tick text')
        .should('have.length.greaterThan', 0);
      cy.get('[data-testid="calculator-bar-chart"] svg .y-axis .tick text')
        .first()
        .invoke('text')
        .should('have.length.greaterThan', 0);
    });

    it('bar chart SVG contains value labels on bars', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .value-label').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="calculator-bar-chart"] svg .value-label')
        .first()
        .invoke('text')
        .should('match', /\d/);
    });
  });

  // ---------------------------------------------------------------------------
  // Metric switching and badges
  // ---------------------------------------------------------------------------

  describe('metric switching', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('clicking power metric button switches the chart metric', () => {
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-metric-power"]').should('have.class', 'bg-primary');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('shows power badges when tok/s/MW metric is selected', () => {
      // Still on power metric from previous test
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'All in Power/GPU');
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'kW');
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'SemiAnalysis Datacenter Industry Model',
      );
    });

    it('clicking cost metric button switches the chart metric', () => {
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-metric-cost"]').should('have.class', 'bg-primary');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('shows TCO badges when cost metric is selected', () => {
      // Still on cost metric from previous test
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'TCO $/GPU/hr');
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', '$');
    });

    it('displays chart title that updates when metric changes', () => {
      // Switch back to throughput
      cy.get('[data-testid="calculator-metric-throughput"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Total Token Throughput per GPU');
      // Switch to power
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Tokens per Provisioned All-in Megawatt');
      // Switch to cost
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Cost per Million');
    });
  });

  // ---------------------------------------------------------------------------
  // View toggle and table
  // ---------------------------------------------------------------------------

  describe('view toggle and table', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('switching to table view shows the results table', () => {
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-results-table"]').should('be.visible');
      cy.get('[data-testid="calculator-results-table"] table').should('exist');
      cy.get('[data-testid="calculator-results-table"] tbody tr').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="calculator-bar-chart"]').should('not.exist');
    });

    it('results table contains expected column headers', () => {
      // Still in table view from previous test
      cy.get('[data-testid="calculator-results-table"]').within(() => {
        cy.get('thead').should('contain.text', 'GPU');
        cy.get('thead').should('contain.text', 'tok/s/MW');
        cy.get('thead').should('contain.text', 'Concurrency');
      });
    });

    it('table view rows contain numeric throughput and cost values', () => {
      cy.get('[data-testid="calculator-results-table"] tbody tr')
        .first()
        .within(() => {
          cy.get('td').eq(0).invoke('text').should('have.length.greaterThan', 0);
          cy.get('td')
            .eq(1)
            .invoke('text')
            .should('match', /\d+\.\d/);
          cy.get('td')
            .eq(2)
            .invoke('text')
            .should('match', /\$\d+\.\d/);
          cy.get('td').eq(3).invoke('text').should('match', /\d+/);
          cy.get('td').eq(4).invoke('text').should('match', /~\d+/);
        });
    });

    it('switching back to chart view shows the bar chart', () => {
      cy.get('[data-testid="calculator-chart-view-btn"]').click();
      cy.get('[data-testid="calculator-bar-chart"]').should('be.visible');
    });

    it('table row count matches bar count', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .its('length')
        .then((barCount) => {
          cy.get('[data-testid="calculator-table-view-btn"]').click();
          cy.get('[data-testid="calculator-results-table"] tbody tr').should(
            'have.length',
            barCount,
          );
        });
    });
  });

  // ---------------------------------------------------------------------------
  // Selector interactions
  // ---------------------------------------------------------------------------

  describe('selector interactions', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    // Clear stale Radix scroll lock before each test to prevent pointer-events: none
    beforeEach(() => {
      cy.document().then((doc) => {
        doc.body.removeAttribute('data-scroll-locked');
        doc.body.style.removeProperty('pointer-events');
      });
    });

    it('model selector has selectable options', () => {
      // Wait for availability data to load — model selector value updates when data arrives
      cy.get('#calc-model').should('not.contain.text', 'Model');
      cy.wait(100);
      cy.get('#calc-model').click();
      cy.get('[role="option"]').should('have.length.greaterThan', 0);
      cy.get('body').type('{esc}');
    });

    it('sequence selector has selectable options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-sequence').click();
      });
      cy.get('[role="option"]').should('have.length.greaterThan', 0);
      cy.get('body').type('{esc}');
    });

    it('cost provider selector appears and has all three options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').click();
      });
      cy.get('[role="option"]').should('have.length', 3);
      cy.get('[role="option"]').eq(0).should('contain.text', 'Hyperscaler');
      cy.get('[role="option"]').eq(1).should('contain.text', 'Neocloud');
      cy.get('[role="option"]').eq(2).should('contain.text', '3yr Rental');
      cy.get('body').type('{esc}');
    });

    it('token type selector has Total, Input, and Output options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').should('have.length', 3);
      cy.get('[role="option"]').eq(0).should('contain.text', 'Total Tokens');
      cy.get('[role="option"]').eq(1).should('contain.text', 'Input Tokens');
      cy.get('[role="option"]').eq(2).should('contain.text', 'Output Tokens');
      cy.get('body').type('{esc}');
    });

    it('switching token type to Input updates the chart title text', () => {
      cy.get('[data-testid="calculator-chart-section"] h2').first().should('contain.text', 'Total');
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Input Tokens').click();
      cy.get('[data-testid="calculator-chart-section"] h2').first().should('contain.text', 'Input');
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('not.contain.text', 'Total');
    });

    it('switching token type to Output updates the chart title text', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Output Tokens').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Output');
    });

    it('switching token type updates table column headers', () => {
      // Switch to table view
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-results-table"] thead').should(
        'contain.text',
        'Output Throughput',
      );
      // Switch back to Total
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Total Tokens').click();
      cy.get('[data-testid="calculator-results-table"] thead').should(
        'contain.text',
        'Total Throughput',
      );
      // Switch back to chart view
      cy.get('[data-testid="calculator-chart-view-btn"]').click();
    });

    it('changing cost provider updates the cost metric chart title', () => {
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Owning - Hyperscaler');
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').click();
      });
      cy.get('[role="option"]').contains('Neocloud').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Owning - Neocloud');
    });
  });

  // ---------------------------------------------------------------------------
  // Target interactivity slider
  // ---------------------------------------------------------------------------

  describe('target interactivity slider', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('slider input value matches the number input value', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]')
          .invoke('val')
          .then((sliderVal) => {
            cy.get('input[type="number"]').should('have.value', String(sliderVal));
          });
      });
    });

    it('typing a new value in the number input updates the chart title', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="number"]').clear().type('50');
      });
      cy.get('[data-testid="calculator-controls"] input[type="number"]').blur();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', '50 tok/s/user');
    });

    it('slider shows min and max range labels', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]')
          .parent()
          .find('.relative.text-muted-foreground span')
          .should('have.length.greaterThan', 0)
          .each(($span) => {
            const text = $span.text().trim();
            expect(Number(text)).to.be.a('number');
            expect(Number.isNaN(Number(text))).to.equal(false);
          });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Legend interactions
  // ---------------------------------------------------------------------------

  describe('legend interactions', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('legend items have colored dot indicators and text labels', () => {
      cy.get('.legend-container li').each(($li) => {
        cy.wrap($li).find('span').first().should('have.css', 'background-color');
        cy.wrap($li).find('label').invoke('text').should('have.length.greaterThan', 0);
      });
    });

    it('toggling a legend item changes visible bar count', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .should('have.length.greaterThan', 1)
        .its('length')
        .then((initialCount) => {
          // Click first legend label to toggle visibility
          cy.get('.sidebar-legend label').first().click();
          // Bar count should change (fewer or zero if GPU has no data at this interactivity point)
          cy.get('[data-testid="calculator-bar-chart"] svg .bar').should(
            'have.length.lessThan',
            initialCount,
          );
        });
    });
  });

  // ---------------------------------------------------------------------------
  // Click-to-compare bars
  // ---------------------------------------------------------------------------

  describe('click-to-compare bars', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 1);
    });

    it('clicking one bar shows a comparison banner with "selected" text', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').first().click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('be.visible');
      cy.get('[data-testid="calculator-comparison-banner"]').should('contain.text', 'selected');
      cy.get('[data-testid="calculator-comparison-banner"]').should(
        'contain.text',
        'Click another bar to compare',
      );
    });

    it('selected bars have higher opacity than unselected bars', () => {
      // First bar still selected from previous test
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .first()
        .should('have.attr', 'opacity')
        .and('satisfy', (val: string) => parseFloat(val) > 0.5);
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .eq(1)
        .should('have.attr', 'opacity')
        .and('satisfy', (val: string) => parseFloat(val) < 0.5);
    });

    it('clicking two bars shows a comparison ratio', () => {
      // First bar already selected; click second
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').eq(1).click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('be.visible');
      cy.get('[data-testid="calculator-comparison-banner"]').should('contain.text', 'x more');
    });

    it('clear selection button dismisses the comparison banner', () => {
      cy.get('[data-testid="calculator-comparison-banner"]').contains('Clear selection').click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('not.exist');
    });
  });

  // ---------------------------------------------------------------------------
  // Direct URL navigation
  // ---------------------------------------------------------------------------

  describe('direct URL navigation', () => {
    it('navigating to /calculator directly loads the calculator tab with data', () => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.url().should('include', '/calculator');
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Metric-specific disclaimers
  // ---------------------------------------------------------------------------

  describe('metric-specific disclaimers', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('shows disaggregated throughput disclaimer for throughput metric', () => {
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'Disaggregated inference configurations',
      );
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'throughput per decode GPU',
      );
    });

    it('shows disaggregated cost disclaimer when cost metric is selected', () => {
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'cost per decode GPU',
      );
    });

    it('shows disaggregated throughput disclaimer for power metric', () => {
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'throughput per decode GPU',
      );
    });
  });
});
