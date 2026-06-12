describe('Compare-per-dollar canonical slug redirect', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('serves a fully canonical slug without redirecting', () => {
    cy.visit('/compare-per-dollar/deepseek-r1-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a non-canonical (reversed) GPU order to alphabetical canonical', () => {
    cy.visit('/compare-per-dollar/deepseek-r1-h100-vs-gb200');
    cy.location('pathname').should('eq', '/compare-per-dollar/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a bare GPU pair (no model prefix) to the deepseek-r1 default', () => {
    // Bare-slug fallback target must live under /compare-per-dollar/, not
    // /compare/ — the per-dollar route handles its own redirect chain.
    cy.visit('/compare-per-dollar/gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a bare reversed GPU pair through both normalizations in one hop', () => {
    cy.visit('/compare-per-dollar/h100-vs-gb200');
    cy.location('pathname').should('eq', '/compare-per-dollar/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a family-level alias model slug to the canonical version slug', () => {
    cy.visit('/compare-per-dollar/kimi-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/kimi-k26-gb200-vs-h100');
  });

  it('redirects an older-version alias slug to the latest-version canonical slug', () => {
    cy.visit('/compare-per-dollar/kimi-k25-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/kimi-k26-gb200-vs-h100');
  });

  it('redirects glm-5 alias to glm-5-1 (same architecture)', () => {
    cy.visit('/compare-per-dollar/glm-5-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/glm-5-1-gb200-vs-h100');
  });

  it('preserves query params across the bare-slug redirect', () => {
    cy.visit('/compare-per-dollar/h100-vs-h200?i_seq=1k/1k');
    // Assert pathname and search together so Cypress retries the pair atomically:
    // on Firefox, reading them as two separate commands can catch a window where the
    // redirect has landed but `search` momentarily reads empty mid-navigation.
    cy.location().should((loc) => {
      expect(loc.pathname).to.eq('/compare-per-dollar/deepseek-r1-h100-vs-h200');
      expect(loc.search).to.contain('i_seq=1k%2F1k');
    });
  });

  it('serves a non-deepseek canonical slug without redirecting', () => {
    cy.visit('/compare-per-dollar/kimi-k26-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare-per-dollar/kimi-k26-gb200-vs-h100');
  });
});
