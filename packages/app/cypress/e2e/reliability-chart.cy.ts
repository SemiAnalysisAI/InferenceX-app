describe('Retired chip reliability page', () => {
  for (const prefix of ['', '/zh']) {
    it(`removes the page and discovery links for ${prefix || 'English'}`, () => {
      for (const path of ['/infx/reliability', '/reliability']) {
        cy.request({
          url: `${prefix}${path}?r_range=all-time`,
          failOnStatusCode: false,
          followRedirect: false,
        })
          .its('status')
          .should('eq', 404);
      }

      cy.visit(`${prefix}/infx/gpu-specs`);
      cy.get('footer').should('exist');
      cy.get('a[href*="/reliability"]').should('not.exist');
      cy.get('[data-testid="tab-trigger-reliability"]').should('not.exist');
      cy.get('[data-testid="footer-link-gpu-specs"]').should('exist');
    });
  }

  it('keeps the read-only reliability API available without advertising a page', () => {
    cy.request('/api/v1/views/reliability?range=all-time').then(({ status, body }) => {
      expect(status).to.eq(200);
      expect(body.view).to.eq('reliability');
    });
    cy.request('/sitemap.xml').its('body').should('not.contain', '/infx/reliability');
  });
});
