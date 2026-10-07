const chooseTheme = (theme: string) => {
  cy.get('[data-testid="theme-toggle"]')
    .should('have.attr', 'aria-label')
    .and('include', 'currently');
  cy.get('[data-testid="theme-toggle"]').click();
  cy.get(`[data-testid="theme-option-${theme}"]`).click();
};

const gameResources = (win: Window) =>
  win.performance
    .getEntriesByType('resource')
    .filter((r) => r.name.includes('/decorative/minecraft/game/'));

describe('Playable Minecraft', () => {
  for (const theme of ['light', 'dark']) {
    it(`keeps the game code and assets off the ${theme} initial path`, () => {
      cy.visit('/about', {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', theme);
        },
      });
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('include', theme);
      cy.get('[data-testid="minecraft-launch"], [data-testid="minecraft-game"]').should(
        'not.exist',
      );
      cy.window().then((win) => {
        expect(gameResources(win)).to.have.length(0);
        for (const r of win.performance
          .getEntriesByType('resource')
          .filter((resource) => /\.(?:js|css)(?:\?|$)/.test(resource.name))) {
          cy.request(r.name)
            .its('body')
            .should('not.match', /\.mc-hotbar-wrap|mc-panorama-cube|inferencex-minecraft-worlds/);
        }
      });
    });
  }

  it('launches from the theme, creates a world, pauses and closes with focus restored', () => {
    cy.visit('/about', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        win.localStorage.removeItem('inferencex-minecraft-worlds');
      },
    });
    chooseTheme('minecraft');
    cy.get('[data-testid="minecraft-play-banner"]').should('be.visible');
    cy.get('[data-testid="minecraft-game"]').should('not.exist');
    // Only the banner art is fetched before the game is opened.
    cy.window().then((win) =>
      expect(
        gameResources(win).filter(
          (r) => !/(?:title\.png|panorama-0\.jpg|button(?:-highlighted)?\.png)$/.test(r.name),
        ),
      ).to.have.length(0),
    );
    cy.get('[data-testid="minecraft-launch"]').click();
    cy.get('[data-testid="minecraft-title"]', { timeout: 30000 }).should('be.visible');
    cy.get('[data-testid="minecraft-singleplayer"]').click();
    cy.get('[data-testid="minecraft-create-world"]').click();
    cy.get('[data-testid="minecraft-world-name"]').clear().type('Cypress World');
    cy.get('[data-testid="minecraft-world-seed"]').type('inferencex');
    cy.get('[data-testid="minecraft-create-confirm"]').click();
    cy.get('[data-testid="minecraft-game"]', { timeout: 90000 }).should(
      'have.attr',
      'data-status',
      'playing',
    );
    cy.window().then((win) => {
      const text = (win as unknown as { render_game_to_text?: () => string }).render_game_to_text;
      if (text) {
        const state = JSON.parse(text());
        expect(state.mode).to.equal('survival');
        expect(state.chunks).to.be.greaterThan(0);
      }
      const saved = JSON.parse(win.localStorage.getItem('inferencex-minecraft-worlds') ?? '[]');
      expect(saved.map((w: { name: string }) => w.name)).to.include('Cypress World');
    });
    // Escape in-game opens the pause menu instead of closing the dialog.
    cy.get('body').type('{esc}');
    cy.get('[data-testid="minecraft-pause"]').should('be.visible');
    cy.get('[data-testid="minecraft-save-quit"]').click();
    cy.get('[data-testid="minecraft-title"]').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="minecraft-game"]').should('not.exist');
    cy.get('[data-testid="minecraft-launch"]').should('have.focus');
    chooseTheme('dark');
    cy.get('[data-testid="minecraft-play-banner"]').should('not.exist');
  });

  it('offers the launcher and title screen in Chinese on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/about', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'minecraft');
      },
    });
    cy.get('[data-testid="minecraft-launch"]').should('have.text', '开始游戏').click();
    cy.get('[data-testid="minecraft-singleplayer"]', { timeout: 30000 }).should(
      'have.text',
      '单人游戏',
    );
  });
});
