type LayoutShiftEntry = PerformanceEntry & {
  hadRecentInput: boolean;
  value: number;
};

type LayoutShiftWindow = Cypress.AUTWindow & {
  __landingCls?: {
    disconnect: () => void;
    score: () => number;
  };
};

function observeLayoutShifts(win: Cypress.AUTWindow) {
  let clsScore = 0;
  const observer = new win.PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LayoutShiftEntry[]) {
      if (!entry.hadRecentInput) clsScore += entry.value;
    }
  });
  observer.observe({ type: 'layout-shift', buffered: true });

  (win as LayoutShiftWindow).__landingCls = {
    disconnect: () => observer.disconnect(),
    score: () => clsScore,
  };
}

function expectLowCls() {
  cy.window()
    .then(
      (win) =>
        new Cypress.Promise<number>((resolve) => {
          win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => {
              const measurement = (win as LayoutShiftWindow).__landingCls;
              measurement?.disconnect();
              resolve(measurement?.score() ?? Number.POSITIVE_INFINITY);
            });
          });
        }),
    )
    .should('be.lessThan', 0.01);
}

describe('Landing page performance', () => {
  it('does not shift when client JavaScript hydrates after first paint', () => {
    cy.viewport(412, 823);
    cy.request('/')
      .its('body')
      .should('contain', 'See more supporters')
      .and('contain', 'data-testid="launch-banner"');

    cy.intercept('GET', '**/_next/static/**/*.js', (request) => {
      request.continue((response) => {
        response.setDelay(1500);
      });
    });

    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-minimax-m3-modal-dismissed');
        win.localStorage.removeItem('inferencex-minimax-m3-banner-dismissed');
        observeLayoutShifts(win);
      },
    });

    cy.get('[data-testid="launch-banner"]').should('be.visible');
    cy.get('[data-testid="intro-section"]').should('contain.text', 'See more supporters');
    cy.get('[data-testid="quote-carousel-more-row"]')
      .should('have.class', 'justify-end')
      .find('a')
      .should('have.text', 'See more supporters →');
    expectLowCls();
  });

  it('hides a dismissed server-rendered banner before paint without shifting content', () => {
    cy.viewport(412, 823);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-minimax-m3-banner-dismissed', '1');
        observeLayoutShifts(win);
      },
    });

    cy.get('html').should('have.attr', 'data-landing-banner-dismissed');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
    cy.get('[data-testid="intro-section"]').should('contain.text', 'See more supporters');
    expectLowCls();
  });

  it('does not load the decorative circuit mask on mobile', () => {
    cy.viewport(412, 823);
    cy.visit('/');

    cy.get('.circuit-bg').should('have.css', 'display', 'none');
    cy.window().then((win) => {
      const resourceNames = win.performance.getEntriesByType('resource').map((entry) => entry.name);
      expect(resourceNames.some((name) => name.includes('/brand/left-pattern-full.svg'))).to.eq(
        false,
      );
      expect(resourceNames.some((name) => name.includes('/minecraft-click.mp3'))).to.eq(false);
      expect(resourceNames.some((name) => name.includes('/Monocraft-'))).to.eq(false);
      // The carousel only renders the active quote's logo, so a mobile load fetches
      // at most the server-rendered logo plus the random starting quote's logo after
      // hydration — never the full supporter set.
      const carouselLogos = new Set(resourceNames.filter((name) => name.includes('/logos/')));
      expect(carouselLogos.size).to.be.lessThan(3);
      expect(
        resourceNames.some(
          (name) => name.includes('/brand/logo-color.webp') && name.includes('w=128'),
        ),
      ).to.eq(false);
    });
  });

  it('preloads only the default font and initially visible supporter logo', () => {
    cy.request('/').then((response) => {
      // Next emits resource preloads as a `Link` response header (when `/` renders
      // dynamically) and/or as inlined <link rel="preload"> tags in the document
      // <head> (when `/` is statically prerendered) — and a production build can
      // surface the same resource in BOTH places at once. Collect a deduplicated
      // set of preloaded URLs per `as` type, keyed by URL, so the assertion holds
      // in every render mode and never double-counts a resource listed twice.
      const linkHeader = String(response.headers.link ?? '');
      const body = String(response.body ?? '');

      const fonts = new Set<string>();
      const logos = new Set<string>();
      const add = (as: string | undefined, url: string | undefined) => {
        if (!url) return;
        if (as === 'font') fonts.add(url);
        else if (as === 'image' && url.startsWith('/logos/')) logos.add(url);
      };

      // `Link` header entries: <url>; rel=preload; as="font"|"image"; ...
      for (const entry of linkHeader.split(',')) {
        if (!/\brel=preload\b/u.test(entry)) continue;
        add(
          entry.match(/\bas="(?<as>[^"]+)"/u)?.groups?.as,
          entry.match(/<(?<url>[^>]+)>/u)?.groups?.url,
        );
      }

      // Inlined <link rel="preload"> tags.
      for (const tag of body.match(/<link\b[^>]*\brel="preload"[^>]*>/gu) ?? []) {
        add(
          tag.match(/\bas="(?<as>[^"]+)"/u)?.groups?.as,
          tag.match(/\bhref="(?<href>[^"]+)"/u)?.groups?.href,
        );
      }

      expect([...fonts]).to.have.length(1);
      expect([...logos]).to.have.length(1);
      // MiniMax is pinned first in the carousel order, so it's the initially
      // visible supporter the server renders (index 0) and preloads.
      expect([...logos][0]).to.eq('/logos/minimax.svg');
    });
  });

  it('loads Minecraft assets after the theme is activated', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'dark');
        win.localStorage.setItem('minecraft-music', 'false');
      },
    });

    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'minecraft');
    cy.window().should((win) => {
      const resourceNames = win.performance.getEntriesByType('resource').map((entry) => entry.name);
      expect(resourceNames.some((name) => name.includes('/minecraft-click.mp3'))).to.eq(true);
    });
  });
});
