describe('Compare canonical slug redirect', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('redirects a non-canonical (reversed) slug to the alphabetical canonical form', () => {
    // 'h100-vs-gb200' is non-canonical; canonical orders alphabetically → 'gb200-vs-h100'
    cy.visit('/compare/h100-vs-gb200');
    cy.location('pathname').should('eq', '/compare/gb200-vs-h100');
  });

  it('serves a canonical slug without redirecting', () => {
    cy.visit('/compare/gb200-vs-h100');
    cy.location('pathname').should('eq', '/compare/gb200-vs-h100');
  });
});
