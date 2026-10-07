const featureCode =
  /THREE\.WebGLRenderer|LOS SANTOS 3D|minecraft-click\.mp3|ender-dragon\.mp3|Loading Luigi Circuit|b606a329-d010-4e4a-a228-638a718d71a1|\.csgo-scene|\.gta-scene|\.mc-dragon-flyacross|\.kart-scene|font-family:\s*["']?(?:Monocraft|Pricedown|ChaletComprime)/i;
const featureAsset =
  /\/decorative\/(?:minecraft|csgo|gta|kart)\/|minecraft-click\.mp3|youtube\.com|ytimg\.com|perplexity\.ai\/computer\/a\//;
const seo = (doc: Document) => [
  doc.title,
  doc.querySelector('meta[name="description"]')?.getAttribute('content'),
  doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  ...[...doc.querySelectorAll('link[hreflang], script[type="application/ld+json"]')].map(
    (node) => node.outerHTML,
  ),
  ...[...doc.querySelectorAll('h1, h2')].map((node) => node.textContent),
];

describe('optional themes stay off the default page', () => {
  for (const theme of ['minecraft', 'csgo', 'gta', 'kart']) {
    it(`suppresses a saved ${theme} theme on embeds`, () => {
      cy.visit('/embed/model/deepseek-r1?theme=dark', {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', theme);
        },
      });
      cy.get('html').should('have.attr', 'data-inferencex-embed');
      cy.get('[data-testid$="-theme-banner"], [data-testid="csgo-game-launch"], audio').should(
        'not.exist',
      );
      cy.window().then((win) => {
        expect(
          win.performance
            .getEntriesByType('resource')
            .filter((resource) => featureAsset.test(resource.name)),
        ).to.have.length(0);
      });
    });
  }

  for (const [theme, route, width] of [
    ['light', '/', 1440],
    ['dark', '/', 390],
    ['light', '/zh', 390],
    ['dark', '/zh', 1440],
    ['system', '/', 1440],
    ['fresh', '/zh', 390],
  ] as const) {
    it(`${theme} ${route} at ${width}px does not load theme code, assets or fonts`, () => {
      cy.viewport(width, 900);
      cy.visit(route, {
        onBeforeLoad(win) {
          if (theme === 'fresh') win.localStorage.removeItem('theme');
          else win.localStorage.setItem('theme', theme);
        },
      });
      if (theme === 'light' || theme === 'dark') cy.get('html').should('have.class', theme);
      else cy.get('html').should(($html) => expect($html.is('.light, .dark')).to.equal(true));
      cy.get('[data-testid="theme-toggle"]').should('be.visible');
      cy.window().then((win) => {
        const resources = win.performance.getEntriesByType('resource');
        expect(resources.filter((resource) => featureAsset.test(resource.name))).to.have.length(0);
        expect(
          [...win.document.fonts].filter((font) => /monocraft|pricedown|chalet/i.test(font.family)),
        ).to.have.length(0);
        const splash = win.document.querySelector('.splash-text');
        if (splash) expect(win.getComputedStyle(splash).animationName).to.equal('none');
        for (const resource of resources.filter((entry) =>
          /\.(?:js|css)(?:\?|$)/.test(entry.name),
        )) {
          cy.request(resource.name).its('body').should('not.match', featureCode);
        }
      });
      cy.get(
        '[data-testid="kart-game"], [data-testid="gta-theme-banner"], [data-testid="csgo-theme-banner"], .mc-dragon-flyacross',
      ).should('not.exist');
    });
  }

  for (const [route, label] of [
    ['/', 'Play CS:GO'],
    ['/zh', '试玩 CS:GO'],
  ] as const) {
    it(`offers the development game only on the selected CS:GO landing ${route}`, () => {
      cy.visit(route, {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', 'light');
        },
      });
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'currently');
      cy.document().then((doc) => {
        const baseline = seo(doc);
        cy.get('[data-testid="csgo-game-launch"]').should('not.exist');
        cy.get('[data-testid="theme-toggle"]').click();
        cy.get('[data-testid="theme-option-csgo"]').click();
        cy.get('[data-testid="csgo-game-launch"]')
          .should('have.text', label)
          .and('have.attr', 'target', '_blank');
        cy.get('[data-testid="csgo-game-launch"]').should(
          'have.attr',
          'rel',
          'noopener noreferrer nofollow',
        );
        cy.get('[data-testid="csgo-game-launch"]').trigger('mouseover').focus();
        cy.window().then((win) => {
          expect(
            win.performance
              .getEntriesByType('resource')
              .filter((resource) =>
                /perplexity\.ai\/computer\/a\/|\/csgo-assets\/|game\.html/.test(resource.name),
              ),
          ).to.have.length(0);
        });
        cy.get('iframe, canvas, audio, video').should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
        cy.get('[data-testid="theme-toggle"]').click();
        cy.get('[data-testid="theme-option-dark"]').click();
        cy.get('[data-testid="csgo-game-launch"]').should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
      });
    });
  }

  it('keeps crawler metadata and content independent of the optional themes', () => {
    for (const route of ['/', '/zh']) {
      cy.request({ url: route, headers: { 'User-Agent': 'Googlebot' } }).then(({ body }) => {
        const doc = new DOMParser().parseFromString(body, 'text/html');
        expect(doc.title).not.to.equal('');
        expect(doc.querySelector('meta[name="description"]')?.getAttribute('content'))
          .to.be.a('string')
          .and.not.equal('');
        expect(doc.querySelector('link[rel="canonical"]')).not.to.equal(null);
        expect(doc.querySelector('link[hreflang="zh-CN"]')).not.to.equal(null);
        expect(doc.querySelector('script[type="application/ld+json"]')).not.to.equal(null);
        expect(doc.querySelector('h1, h2')).not.to.equal(null);
        expect(
          doc.querySelector(
            '[data-testid="kart-game"], [data-testid="gta-theme-banner"], [data-testid="csgo-theme-banner"]',
          ),
        ).to.equal(null);
      });
    }
  });

  it('unmounts each selected theme and preserves metadata when switching back', () => {
    cy.visit('/about', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        win.localStorage.setItem('minecraft-music', 'false');
        win.localStorage.setItem('minecraft-sound', 'false');
      },
    });
    // The server-rendered trigger is visible before its click handler hydrates.
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label')
      .and('contain', 'currently');
    cy.document().then((doc) => {
      const baseline = seo(doc);
      for (const theme of ['csgo', 'gta', 'minecraft', 'kart']) {
        cy.get('[data-testid="theme-toggle"]').click();
        cy.get(`[data-testid="theme-option-${theme}"]`).click();
        if (theme === 'minecraft') cy.get('canvas').should('exist');
        else cy.get(`[data-testid="${theme}-theme-banner"]`).should('be.visible');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
        cy.get('[data-testid="theme-toggle"]').click();
        cy.get('[data-testid="theme-option-dark"]').click();
        cy.get(
          'canvas, audio, iframe, [data-testid$="-theme-banner"], .mc-dragon-flyacross',
        ).should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
      }
    });
  });
});
