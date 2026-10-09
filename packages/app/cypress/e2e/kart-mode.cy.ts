import { cycleToTheme as choose } from '../support/theme';

describe('Mario Kart mode', () => {
  for (const theme of ['light', 'dark']) {
    it(`keeps Kart code, CSS and assets off the ${theme} initial path`, () => {
      cy.visit('/about', {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', theme);
        },
      });
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('include', theme);
      cy.get(
        '[data-testid="kart-scene"], [data-testid="kart-game"], [data-testid="kart-launch"]',
      ).should('not.exist');
      cy.window().then((win) => {
        const resources = win.performance.getEntriesByType('resource');
        expect(resources.filter((r) => r.name.includes('/decorative/kart/'))).to.have.length(0);
        for (const r of resources.filter((resource) =>
          /\.(?:js|css)(?:\?|$)/.test(resource.name),
        )) {
          cy.request(r.name)
            .its('body')
            .should(
              'not.match',
              /Loading Luigi Circuit|THREE\.WebGLRenderer|\.kart-scene|\.kart-game/,
            );
        }
      });
      cy.request({ url: '/about', headers: { 'User-Agent': 'Googlebot' } }).then(({ body }) => {
        const doc = new DOMParser().parseFromString(body, 'text/html');
        expect(doc.title).not.to.equal('');
        expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).not.to.equal(
          '',
        );
        expect(doc.querySelector('link[rel="canonical"]')).not.to.equal(null);
        expect(doc.querySelector('h1, h2')).not.to.equal(null);
        expect(
          doc.querySelector('[data-testid="kart-launch"], [data-testid="kart-game"]'),
        ).to.equal(null);
      });
    });
  }
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
        win.performance
          .getEntriesByType('resource')
          .filter((r) => /\.(?:gltf|glb|bin)$/.test(r.name)),
      ).to.have.length(0),
    );
    cy.get('[data-testid="kart-launch"]').click();
    cy.get('[data-testid="kart-game"]', { timeout: 30000 }).should(
      'have.attr',
      'data-status',
      'ready',
    );
    cy.get('[data-testid="kart-pick-luigi"]').click().should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="kart-start"]').click();
    cy.get('[data-testid="kart-game"]').should('have.attr', 'data-phase', 'countdown');
    cy.window().then((win) => {
      const text = (win as unknown as { render_game_to_text?: () => string }).render_game_to_text;
      if (text) expect(JSON.parse(text()).player.character).to.equal('luigi');
    });
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
