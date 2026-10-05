const choose = (theme: string) => {
  cy.get('[data-testid="theme-toggle"]')
    .should('have.attr', 'aria-label')
    .and('include', 'currently');
  cy.get('[data-testid="theme-toggle"]').click();
  cy.get(`[data-testid="theme-option-${theme}"]`).click();
};
describe('Mario Kart mode', () => {
  it('loads only on selection, launches on demand, closes and restores focus', () => {
    cy.visit('/about', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      },
    });
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label')
      .and('include', 'light');
    cy.window().then((win) =>
      expect(
        win.performance
          .getEntriesByType('resource')
          .filter((r) => r.name.includes('/decorative/kart/')),
      ).to.have.length(0),
    );
    choose('kart');
    cy.get('[data-testid="kart-theme-banner"]').should('be.visible');
    // The decorative backdrop is intentionally behind the page's content.
    cy.get('[data-testid="kart-scene"] img').should(($img) => {
      expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0);
      expect(getComputedStyle($img[0]).display).not.to.equal('none');
    });
    cy.get('[data-testid="kart-game"]').should('not.exist');
    cy.window().then((win) =>
      expect(
        win.performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.gltf')),
      ).to.have.length(0),
    );
    cy.get('[data-testid="kart-launch"]').click();
    cy.get('[data-testid="kart-game"]', { timeout: 30000 }).should(
      'have.attr',
      'data-status',
      'ready',
    );
    cy.get('[data-testid="kart-start"]').click();
    cy.get('[data-testid="kart-canvas"]').should('have.focus').type('{esc}');
    cy.get('[data-testid="kart-game"]').should('not.exist');
    cy.get('[data-testid="kart-launch"]').should('have.focus');
    cy.reload();
    cy.get('html').should('have.class', 'kart');
    choose('dark');
    cy.get('[data-testid="kart-theme-banner"]').should('not.exist');
    cy.get('[data-testid="kart-scene"]').should('not.exist');
  });
  it('offers the same launcher in Chinese on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/about', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'kart');
      },
    });
    cy.get('[data-testid="kart-launch"]').should('have.text', '开始 3D 比赛 →').click();
    cy.get('[data-testid="kart-game"]', { timeout: 30000 }).should(
      'have.attr',
      'data-status',
      'ready',
    );
    cy.get('[data-testid="kart-start"]').should('have.text', '开始比赛');
  });
});
