export function expectPermanentRedirect(from: string, to: string, visit = true): void {
  cy.request({ url: from, followRedirect: false }).then((response) => {
    expect(response.status, from).to.eq(308);
    const destination = new URL(
      String(response.headers.location),
      String(Cypress.config('baseUrl')),
    );
    expect(`${destination.pathname}${destination.search}`, from).to.eq(to);
    // A canonical target must resolve directly, not begin another redirect.
    cy.request({ url: to, followRedirect: false }).its('status').should('eq', 200);
  });
  if (visit) {
    cy.visit(from);
    cy.location('pathname').should('eq', to.split('?')[0]);
  }
}
