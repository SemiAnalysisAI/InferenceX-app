describe('First-load navigation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        win.localStorage.removeItem('inferencex-star-modal-dismissed');
      },
    });

    cy.get('[data-testid="github-star-modal"]').should('be.visible');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles with one click while the GitHub star prompt is visible', () => {
    cy.get('[data-testid="nav-link-blog"]').click();
    cy.location('pathname').should('eq', '/blog');
  });

  it('navigates to dashboard from the header with one click', () => {
    cy.get('[data-testid="nav-link-dashboard"]').click();
    cy.location('pathname').should('eq', '/inference');
  });

  it('navigates to dashboard from the landing CTA with one click', () => {
    cy.contains('a', 'Open Dashboard').click();
    cy.location('pathname').should('eq', '/inference');
  });
});
