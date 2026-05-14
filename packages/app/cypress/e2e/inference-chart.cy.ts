/** Opens dropdown without hitting chip remove controls (they stopPropagation). */
function openGpuMultiselect() {
  cy.get('[data-testid="gpu-multiselect-trigger"]').find('svg').last().click();
}

describe('Inference Chart', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
  });

  it('renders the inference chart display wrapper', () => {
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('shows the Inference Performance heading', () => {
    cy.contains('h2', 'Inference Performance').should('be.visible');
  });

  it('renders at least one chart figure', () => {
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('renders at least one scatter graph with an SVG', () => {
    cy.get('[data-testid="scatter-graph"]').should('have.length.at.least', 1);
    cy.get('[data-testid="scatter-graph"]').first().find('svg').should('exist');
  });

  it('SVG contains data point circles', () => {
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg circle')
      .should('have.length.greaterThan', 0);
  });

  it('does not show "No data available" when data loads', () => {
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.contains('No data available').should('not.exist');
  });

  it('shows a chart heading with metric title', () => {
    cy.get('[data-testid="chart-figure"]').first().find('h2').should('not.be.empty');
  });

  it('shows chart caption with model and source info', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .find('figcaption p')
      .should('contain', 'SemiAnalysis InferenceX');
  });

  it('shows the sidebar legend for GPU types', () => {
    // GpuComparisonCard sits above charts; first chart legend may be below the fold.
    cy.get('.sidebar-legend').first().scrollIntoView();
    cy.get('.sidebar-legend').first().should('be.visible');
  });
});

describe('GPU Comparison Card', () => {
  beforeEach(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="gpu-comparison-card"]').should('be.visible');
  });

  it('starts collapsed; expanding shows GPU comparison controls', () => {
    cy.contains('Select one or more GPUs for date range comparison.').should('not.exist');
    cy.get('[data-testid="gpu-comparison-expand-toggle"]').should(
      'have.attr',
      'aria-expanded',
      'false',
    );
    cy.get('[data-testid="gpu-comparison-expand-toggle"]').click();
    cy.get('[data-testid="gpu-comparison-expand-toggle"]').should(
      'have.attr',
      'aria-expanded',
      'true',
    );
    cy.contains('Select one or more GPUs for date range comparison.').should('be.visible');
    cy.get('[data-testid="gpu-multiselect-trigger"]').should('be.visible');
  });

  describe('when expanded', () => {
    beforeEach(() => {
      cy.get('[data-testid="gpu-comparison-expand-toggle"]').click();
    });

    it('renders the GPU comparison card with a single GPU multiselect', () => {
      cy.get('[data-testid="gpu-multiselect"]').should('be.visible');
      cy.get('[data-testid="gpu-multiselect-trigger"]').should('be.visible');
    });

    it('shows date range shortcuts that are disabled until a GPU is selected', () => {
      cy.get('[data-testid="date-range-shortcuts"]').should('be.visible');
      cy.get('[data-testid="date-shortcut-all-time"]').should('be.disabled');
    });

    it('selects one GPU and verifies date range controls unlock', () => {
      openGpuMultiselect();
      cy.get('[role="option"]').first().click();

      // "All Time" stays disabled when the selected GPU has only one date in fixtures.
      cy.get('#gpu-comparison-date-picker').should('not.be.disabled');
    });

    it('selects two GPUs and verifies date range auto-defaults', () => {
      openGpuMultiselect();
      cy.get('[role="option"]').first().click();

      // Pick eq(2) so the second GPU is a different family (e.g. b300) with a
      // distinct date — eq(1) can be the MTP pair of eq(0) sharing one date.
      openGpuMultiselect();
      cy.get('[role="option"]').eq(2).click();

      cy.get('[data-testid="date-shortcut-all-time"]').should('not.be.disabled');
      cy.get('#gpu-comparison-date-picker').should('not.be.disabled');
    });

    it('selecting a third GPU adds a third removable chip to the multiselect', () => {
      openGpuMultiselect();
      cy.get('[role="option"]').first().click();
      openGpuMultiselect();
      cy.get('[role="option"]').eq(1).click();
      openGpuMultiselect();
      cy.get('[role="option"]').eq(2).click();
      cy.get('[data-testid="gpu-multiselect"]')
        .find('[aria-label^="Remove "]')
        .should('have.length', 3);
    });
  });
});
