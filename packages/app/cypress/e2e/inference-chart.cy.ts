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
    cy.get('.sidebar-legend').should('be.visible');
  });
});
