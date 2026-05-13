describe('Embed — Scatter Chart', () => {
  describe('default URL', () => {
    before(() => {
      cy.visit('/embed/scatter');
    });

    it('renders the embed root container', () => {
      cy.get('[data-testid="embed-root"]').should('exist');
    });

    it('does not render the site header or footer', () => {
      cy.get('[data-testid="header"]').should('not.exist');
      cy.get('[data-testid="footer"]').should('not.exist');
    });

    it('renders an SVG chart with real data', () => {
      // Wait for chart to render — skeleton or figure
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.get('[data-testid="embed-scatter-figure"]').find('svg').should('exist');
      cy.contains('No data available').should('not.exist');
    });

    it('shows the SemiAnalysis InferenceX attribution link', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('exist')
        .should('contain.text', 'SemiAnalysis InferenceX');
    });

    it('attribution link points to the canonical /inference URL with seeded params', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('have.attr', 'href')
        .and('include', '/inference?')
        .and('include', 'g_model=DeepSeek-R1-0528')
        .and('include', 'i_metric=y_tpPerGpu');
    });
  });

  describe('custom params', () => {
    before(() => {
      cy.visit('/embed/scatter?model=dsr1&isl=8192&osl=1024&precisions=fp4&y=costh');
    });

    it('renders chart with the custom y metric', () => {
      cy.get('[data-testid="embed-scatter-figure"]', { timeout: 15000 }).should('exist');
      cy.contains('No data available').should('not.exist');
    });

    it('canonical link reflects the y metric override', () => {
      cy.get('[data-testid="embed-attribution"]')
        .should('have.attr', 'href')
        .and('include', 'i_metric=y_costh');
    });
  });
});
