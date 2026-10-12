import { APP_THEMES } from '../../src/lib/themes/themes';
import { cycleToTheme } from '../support/theme';

const optionalThemes = APP_THEMES.filter((theme) => !['light', 'dark', 'system'].includes(theme));
const featureCode =
  /THREE\.WebGLRenderer|WebGLRenderer:|LOS SANTOS 3D|minecraft-click\.mp3|ender-dragon\.mp3|Loading Luigi Circuit|inferencex-minecraft-worlds|mc-panorama-cube|\.mc-hotbar-wrap|\.mc-boss|\.mc-endgame-guide|\.csgo-scene|\.gta-scene|\.mc-dragon-flyacross|\.kart-scene|\.doom-scene|\.halo-scene|halo-theme\.css|font-family:\s*["']?(?:Monocraft|Pricedown|ChaletComprime|Industry|Halo)/i;
const featureAsset = new RegExp(
  `/decorative/(?:${optionalThemes.join('|')})/|minecraft-click\\.mp3|Monocraft-|Pricedown|ChaletComprime|Industry-|halo[^/]*\\.(?:woff2?|ttf|otf|mp3|ogg|wav)|youtube(?:-nocookie)?\\.com|ytimg\\.com`,
  'i',
);
const featureElements =
  '[data-testid="minecraft-game"], [data-testid="minecraft-play-banner"], [data-testid="kart-game"], [data-testid$="-theme-banner"], .mc-dragon-flyacross';
const isFeatureAsset = (url: string) => featureAsset.test(decodeURIComponent(url));

function saveMediaOptIns(win: Window, enabled: boolean) {
  for (const theme of optionalThemes) {
    win.localStorage.setItem(`${theme}-music`, String(enabled));
    win.localStorage.setItem(`${theme}-sound`, String(enabled));
  }
}

function expectNoOptionalResources(requests: string[]) {
  cy.window().then((win) => {
    // Request interception catches in-flight requests too; resource timing only lists completed ones.
    expect(requests.filter(isFeatureAsset), 'optional requests started').to.deep.equal([]);
    const resources = win.performance.getEntriesByType('resource');
    expect(resources.filter((entry) => isFeatureAsset(entry.name))).to.have.length(0);
    expect(
      [...win.document.fonts].filter((font) =>
        /monocraft|pricedown|chalet|industry|halo/i.test(font.family),
      ),
    ).to.have.length(0);
    for (const resource of resources.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name)))
      cy.request(resource.name).its('body').should('not.match', featureCode);
  });
  cy.get(featureElements).should('not.exist');
  cy.get('audio, video, iframe[src*="youtube"]').should('not.exist');
}
const seo = (doc: Document) => [
  doc.title,
  doc.querySelector('meta[name="description"]')?.getAttribute('content'),
  doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
  ...[
    ...doc.querySelectorAll('meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"]'),
  ].map((node) => node.outerHTML),
  ...[...doc.querySelectorAll('link[hreflang], script[type="application/ld+json"]')].map(
    (node) => node.outerHTML,
  ),
  ...[...doc.querySelectorAll('h1, h2')].map((node) => node.textContent),
];

describe('optional themes stay off the default page', () => {
  for (const route of ['/', '/zh']) {
    it(`${route} migrates a retired kart preference and keeps the toggle usable`, () => {
      const requests: string[] = [];
      cy.intercept('GET', '**', (request) => {
        requests.push(request.url);
      });
      cy.visit(route, {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', 'kart');
        },
      });
      cy.get('html').should('have.class', 'dark').and('not.have.class', 'kart');
      cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal('dark'));
      cy.get('[data-testid="theme-toggle"]').focus();
      cy.get('[data-testid="theme-option-kart"]').should('not.exist');
      cy.get('[data-testid="theme-menu"]').should('not.exist');
      expectNoOptionalResources(requests);
      // Returning to a default theme must not pass through optional themes.
      cycleToTheme('light');
      cy.get('html').should('have.class', 'light').and('not.have.class', 'kart');
      expectNoOptionalResources(requests);
      cy.reload();
      cy.get('html').should('have.class', 'light').and('not.have.class', 'kart');
      cy.then(() => {
        expect(requests.filter((url) => url.includes('/decorative/kart/'))).to.deep.equal([]);
      });
    });
  }

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
          saveMediaOptIns(win, true);
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
      // Focusing the toggle must not activate a theme or fetch optional assets.
      cy.get('[data-testid="theme-toggle"]').focus();
      cy.get('[data-testid="theme-menu"]').should('not.exist');
      cy.scrollTo('bottom');
      expectNoOptionalResources(requests);
      cy.document().then((doc) => {
        const baseline = seo(doc);
        const initial = doc.documentElement.classList.contains('dark') ? 'dark' : 'light';
        for (const next of [initial === 'dark' ? 'light' : 'dark', initial]) {
          cy.get('[data-testid="theme-toggle"]').click();
          cy.get('html').should('have.class', next);
          cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal(next));
          cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
        }
        expectNoOptionalResources(requests);
      });
    });
  }

  for (const theme of optionalThemes) {
    for (const prefix of ['', '/zh']) {
      it(`${prefix || 'English'} embed ignores saved ${theme} before and after hydration`, () => {
        const requests: string[] = [];
        cy.intercept('GET', '**', (request) => {
          requests.push(request.url);
        });
        cy.visit(`${prefix}/embed/model/deepseek-v4?theme=light`, {
          onBeforeLoad(win) {
            win.localStorage.setItem('theme', theme);
            saveMediaOptIns(win, true);
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
        expect(doc.querySelector(featureElements)).to.equal(null);
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
        saveMediaOptIns(win, false);
      },
    });
    // The server-rendered trigger is visible before its click handler hydrates.
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label')
      .and('contain', 'currently');
    cy.document().then((doc) => {
      const baseline = seo(doc);
      for (const theme of optionalThemes) {
        cycleToTheme(theme);
        if (theme === 'minecraft') cy.get('canvas').should('exist');
        else cy.get(`[data-testid="${theme}-theme-banner"]`).should('be.visible');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
        cycleToTheme('dark');
        cy.get(`canvas, audio, iframe, ${featureElements}`).should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
      }
    });
  });

  for (const route of ['/about', '/zh/about']) {
    it(`${route} keeps the page and default toggle working when optional chunks fail`, () => {
      cy.viewport(1440, 900);
      cy.visit(route, {
        onBeforeLoad(win) {
          win.localStorage.setItem('theme', 'dark');
          saveMediaOptIns(win, false);
          // Next captures console.error during bootstrap for caught React errors.
          cy.spy(win.console, 'error').as('caughtThemeError');
        },
      });
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'currently dark');
      cy.document().then((doc) => {
        const baseline = seo(doc);
        // Only start failing lazy chunks after the normal page has hydrated.
        cy.window().then((win) => {
          const append = win.document.head.appendChild.bind(win.document.head);
          cy.stub(win.document.head, 'appendChild').callsFake((node: Node) => {
            // Earlier cases may have cached these chunks. Force a real network
            // failure instead of silently executing a cached optional module.
            if (node instanceof win.HTMLScriptElement && node.src.includes('/_next/static/')) {
              const url = new URL(node.src);
              url.searchParams.set('optional-theme-failure', '1');
              node.src = url.href;
            }
            return append(node);
          });
        });
        cy.intercept('GET', '**/_next/static/chunks/*.js*', { forceNetworkError: true }).as(
          'optionalChunk',
        );
        cycleToTheme('minecraft');
        cy.wait('@optionalChunk');
        cy.get('@caughtThemeError').should(
          'have.been.calledWithMatch',
          Cypress.sinon.match((error: unknown) => /Failed to load chunk/.test(String(error))),
        );
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
        // The shared header remains interactive even after a rejected lazy import.
        cycleToTheme('light');
        cycleToTheme('dark');
        cy.get(`canvas, audio, iframe, ${featureElements}`).should('not.exist');
        cy.document().should((current) => expect(seo(current)).to.deep.equal(baseline));
      });
    });
  }
});
