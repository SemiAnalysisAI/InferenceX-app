describe('First-load navigation', () => {
  beforeEach(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-starred');
        win.localStorage.removeItem('inferencex-star-modal-dismissed');
        win.localStorage.removeItem('inferencex-dsv4-modal-dismissed');
      },
    });

    // dsv4 launch modal takes precedence over the GitHub star modal on first
    // load — only one modal shows at a time. Either is fine for this test, we
    // just need *a* first-load modal up to verify it doesn't block navigation.
    cy.get('[data-testid="dsv4-launch-modal"]').should('be.visible');
    cy.get('body').should('not.have.attr', 'data-scroll-locked');
  });

  it('navigates to articles with one click while the launch modal is visible', () => {
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
