describe('First-load navigation', () => {
  it('navigates with one click while the GitHub star prompt is visible', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        win.localStorage.removeItem('inferencex-star-modal-dismissed');
      },
    });

    cy.get('[data-testid="github-star-modal"]').should('be.visible');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');

    cy.get('[data-testid="nav-link-blog"]').click();
    cy.location('pathname').should('eq', '/blog');
  });
});
