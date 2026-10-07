const featureCode =
  /THREE\.WebGLRenderer|WebGLRenderer:|LOS SANTOS 3D|minecraft-click\.mp3|ender-dragon\.mp3|Loading Luigi Circuit|inferencex-minecraft-worlds|mc-panorama-cube|\.mc-hotbar-wrap|\.csgo-scene|\.gta-scene|\.mc-dragon-flyacross|\.kart-scene|font-family:\s*["']?(?:Monocraft|Pricedown|ChaletComprime)/i;
const featureAsset =
  /\/decorative\/(?:minecraft|csgo|gta|kart)\/|minecraft-click\.mp3|Monocraft-|Pricedown|ChaletComprime|youtube(?:-nocookie)?\.com|ytimg\.com/i;
const featureElements =
  '[data-testid="minecraft-game"], [data-testid="minecraft-play-banner"], [data-testid="kart-game"], [data-testid$="-theme-banner"], .mc-dragon-flyacross';
const isFeatureAsset = (url: string) => featureAsset.test(decodeURIComponent(url));

function expectNoOptionalResources(requests: string[]) {
  cy.window().then((win) => {
    // Request interception catches in-flight requests too; resource timing only lists completed ones.
    expect(requests.filter(isFeatureAsset), 'optional requests started').to.deep.equal([]);
    const resources = win.performance.getEntriesByType('resource');
    expect(resources.filter((entry) => isFeatureAsset(entry.name))).to.have.length(0);
    expect(
      [...win.document.fonts].filter((font) => /monocraft|pricedown|chalet/i.test(font.family)),
    ).to.have.length(0);
    for (const resource of resources.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name)))
      cy.request(resource.name).its('body').should('not.match', featureCode);
  });
  cy.get(featureElements).should('not.exist');
}
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
  for (const [theme, route, width] of [
    ['light', '/', 1440],
    ['dark', '/', 390],
    ['light', '/zh', 390],
    ['dark', '/zh', 1440],
    ['default', '/', 390],
    ['system', '/zh', 1440],
  ] as const) {
    it(`${theme} ${route} at ${width}px does not load theme code, assets or fonts`, () => {
      const requests: string[] = [];
      cy.intercept('GET', '**', (request) => {
        requests.push(request.url);
      });
      cy.viewport(width, 900);
      cy.visit(route, {
        onBeforeLoad(win) {
          if (theme === 'default') win.localStorage.removeItem('theme');
          else win.localStorage.setItem('theme', theme);
          // Stored opt-ins must not start media outside the selected theme.
          win.localStorage.setItem('minecraft-music', 'true');
          win.localStorage.setItem('minecraft-sound', 'true');
        },
      });
      if (theme === 'light' || theme === 'dark') cy.get('html').should('have.class', theme);
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'currently');
      cy.window().then((win) => {
        const splash = win.document.querySelector('.splash-text');
        if (splash) expect(win.getComputedStyle(splash).animationName).to.equal('none');
      });
      // Merely viewing options and interacting with the page must not activate a theme.
      cy.get('[data-testid="theme-toggle"]').click();
      cy.get('[data-testid="theme-option-minecraft"]').should('be.visible');
      cy.get('body').type('{esc}');
      cy.scrollTo('bottom');
      expectNoOptionalResources(requests);
    });
  }

  for (const theme of ['minecraft', 'csgo', 'gta', 'kart']) {
    for (const prefix of ['', '/zh']) {
      it(`${prefix || 'English'} embed ignores saved ${theme} before and after hydration`, () => {
        const requests: string[] = [];
        cy.intercept('GET', '**', (request) => {
          requests.push(request.url);
        });
        cy.visit(`${prefix}/embed/model/deepseek-v4?theme=light`, {
          onBeforeLoad(win) {
            win.localStorage.setItem('theme', theme);
            win.localStorage.setItem('minecraft-music', 'true');
            win.localStorage.setItem('minecraft-sound', 'true');
          },
        });
        cy.get('html').should('have.class', 'light').and('have.attr', 'data-inferencex-embed');
        cy.get('[data-testid="embed-frame"]').should('be.visible');
        // EmbedFrame's effect writes the requested theme only after hydration.
        cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal('light'));
        cy.get('[data-testid="theme-toggle"]').should('not.exist');
        expectNoOptionalResources(requests);
      });
    }
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
        expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).not.to.contain(
          'noindex',
        );
        expect(
          [...doc.querySelectorAll('link[rel="preload"], link[rel="modulepreload"]')].filter(
            (link) => isFeatureAsset(link.getAttribute('href') ?? ''),
          ),
        ).to.have.length(0);
        expect(
          doc.querySelector(
            '[data-testid="kart-game"], [data-testid="gta-theme-banner"], [data-testid="csgo-theme-banner"]',
          ),
        ).to.equal(null);
        // Metadata and indexable headings are in raw HTML, without running JavaScript.
        cy.request(route).then((normal) => {
          const normalDoc = new DOMParser().parseFromString(normal.body, 'text/html');
          expect(seo(normalDoc)).to.deep.equal(seo(doc));
          expect(isFeatureAsset(String(normal.headers.link ?? ''))).to.equal(false);
        });
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
        cy.get(`canvas, audio, iframe, ${featureElements}`).should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
      }
    });
  });
});
