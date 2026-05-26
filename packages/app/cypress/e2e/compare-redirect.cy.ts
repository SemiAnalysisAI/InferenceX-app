describe('Compare canonical slug redirect', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('serves a fully canonical slug without redirecting', () => {
    cy.visit('/compare/deepseek-r1-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a non-canonical (reversed) GPU order to alphabetical canonical', () => {
    // canonical alphabetical orders the GPUs → 'gb200-vs-h100', not 'h100-vs-gb200'
    cy.visit('/compare/deepseek-r1-h100-vs-gb200');
    cy.location('pathname').should('eq', '/compare/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a bare GPU pair (no model prefix) to the deepseek-r1 default', () => {
    // PR #351 backward-compat: pre-existing inbound links of the form
    // `/compare/{a}-vs-{b}` get a one-hop 308 to the deepseek-r1-prefixed URL.
    cy.visit('/compare/gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a bare reversed GPU pair through both normalizations in one hop', () => {
    cy.visit('/compare/h100-vs-gb200');
    cy.location('pathname').should('eq', '/compare/deepseek-r1-gb200-vs-h100');
  });

  it('redirects a family-level alias model slug to the canonical version slug', () => {
    cy.visit('/compare/kimi-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/kimi-k26-gb200-vs-h100');
  });

  it('redirects an older-version alias slug to the latest-version canonical slug', () => {
    // kimi-k25 redirects to kimi-k26 (same family, newer point release)
    cy.visit('/compare/kimi-k25-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/kimi-k26-gb200-vs-h100');
  });

  it('redirects glm-5 alias to glm-5-1 (same architecture)', () => {
    cy.visit('/compare/glm-5-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/glm-5-1-gb200-vs-h100');
  });

  it('preserves query params across the bare-slug redirect', () => {
    cy.visit('/compare/h100-vs-h200?i_seq=1k/1k');
    cy.location('pathname').should('eq', '/compare/deepseek-r1-h100-vs-h200');
    cy.location('search').should('contain', 'i_seq=1k%2F1k');
  });

  it('serves a non-deepseek canonical slug without redirecting', () => {
    cy.visit('/compare/kimi-k26-gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/kimi-k26-gb200-vs-h100');
  });
});
