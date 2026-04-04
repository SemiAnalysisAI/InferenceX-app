describe('Land acknowledgement', () => {
  it('navigates from the footer to the land acknowledgement page', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="footer-link-land-acknowledgement"]').scrollIntoView().click();

    cy.location('pathname').should('eq', '/land-acknowledgement');
    cy.get('[data-testid="land-acknowledgement-page"]').within(() => {
      cy.get('h1').should('contain.text', 'Indigenous homelands');
      cy.get('[data-testid="land-acknowledgement-san-jose"]').should(
        'contain.text',
        'Muwekma Ohlone Tribe',
      );
      cy.get('[data-testid="land-acknowledgement-los-angeles"]').should('contain.text', 'Tongva');
      cy.get('[data-testid="land-acknowledgement-chicago"]').should(
        'contain.text',
        'Council of the Three Fires',
      );
    });
  });
});
