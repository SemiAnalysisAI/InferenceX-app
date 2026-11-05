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
  it('features Google instead of Anyscale and links to its localized quote without loading a logo', () => {
    for (const prefix of ['', '/zh']) {
      cy.visit(prefix || '/');
      cy.get('[data-testid="intro-section"]').within(() => {
        cy.contains('a', 'Google').should('have.attr', 'href', `${prefix}/quotes#quote-google`);
        cy.get('img[alt="Google"]').should('not.exist');
        cy.contains('a', 'Google').click();
      });
      cy.location('pathname').should('eq', `${prefix}/quotes`);
      cy.location('hash').should('eq', '#quote-google');
      cy.get('#quote-google').should('be.visible');
    }
  });

  it('does not shift when client JavaScript hydrates after first paint', () => {
    cy.viewport(412, 823);
    cy.request('/')
      .its('body')
      .should('contain', 'All quotes and supporters')
      .and('contain', 'href="/quotes#quote-minimax"')
      .and('contain', 'data-testid="launch-banner"')
      // Both A/B arms are server-rendered; the pre-paint style shows only the assigned one.
      .and('contain', 'data-banner-variant="ubenchx"')
      .and('contain', 'data-banner-variant="operatorx"');

    // The previous page can still be loading a chunk when this intercept starts, and the visit
    // below aborts it. Cypress fails the test when a response callback loses its browser
    // connection, so delay only the scripts requested by the document this test opens.
    const pageUnderTest = `/?hydration-check=${Date.now()}`;
    cy.intercept('GET', '**/_next/static/**/*.js', (request) => {
      if (!String(request.headers.referer ?? '').endsWith(pageUnderTest)) return;
      request.continue((response) => {
        response.setDelay(1500);
      });
    });

    cy.visit(pageUnderTest, {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed');
        win.localStorage.setItem('inferencex-landing-banner-variant', 'operatorx');
        observeLayoutShifts(win);
      },
    });

    // Hydration may already have dropped the unassigned arm by now, so only its visibility is
    // checked here; the server-rendered markup is checked on the request above.
    cy.get('[data-banner-variant="ubenchx"]:visible').should('not.exist');
    cy.get('[data-testid="launch-banner"]:visible')
      .should('have.length', 1)
      .and('have.attr', 'href', '/operatorx');
    cy.get('[data-testid="intro-section"]').should('contain.text', 'All quotes and supporters');
    cy.get('[data-testid="compare-agentx-primary"]').should('be.visible');
    cy.get('[data-testid="supporters-more-row"]')
      .find('a')
      .should('have.text', 'All quotes and supporters');
    expectLowCls();
  });

  it('hides a dismissed server-rendered banner before paint without shifting content', () => {
    cy.viewport(412, 823);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed', '1');
        observeLayoutShifts(win);
      },
    });

    cy.get('html').should('have.attr', 'data-landing-banner-dismissed');
    cy.get('[data-testid="launch-banner"]').should('not.exist');
    cy.get('[data-testid="intro-section"]').should('contain.text', 'All quotes and supporters');
    expectLowCls();
  });

  it('loads only colored supporter logos on mobile', () => {
    cy.viewport(412, 823);
    cy.visit('/');

    cy.window().then((win) => {
      const resourceNames = win.performance.getEntriesByType('resource').map((entry) => entry.name);
      const landingLogos = new Set(resourceNames.filter((name) => name.includes('/logos/')));
      expect(landingLogos.size).to.be.lessThan(6);
      expect(
        [...landingLogos].filter((name) => {
          const pathname = new URL(name).pathname;
          return !pathname.endsWith('-color.svg') && pathname !== '/logos/muse-mascot.webp';
        }),
      ).to.deep.eq([]);
      expect(
        resourceNames.some(
          (name) => name.includes('/brand/logo-color.webp') && name.includes('w=128'),
        ),
      ).to.eq(false);
    });
  });

  it('preloads only the default font and no supporter logos', () => {
    cy.request('/').then((response) => {
      const linkHeader = String(response.headers.link ?? '');
      const body = String(response.body ?? '');

      const fonts = new Set<string>();
      const logos = new Set<string>();
      const add = (as: string | undefined, url: string | undefined) => {
        if (!url) return;
        if (as === 'font') fonts.add(url);
        else if (as === 'image' && url.startsWith('/logos/')) logos.add(url);
      };

      for (const entry of linkHeader.split(',')) {
        if (!/\brel=preload\b/u.test(entry)) continue;
        add(
          entry.match(/\bas="(?<as>[^"]+)"/u)?.groups?.as,
          entry.match(/<(?<url>[^>]+)>/u)?.groups?.url,
        );
      }

      for (const tag of body.match(/<link\b[^>]*\brel="preload"[^>]*>/gu) ?? []) {
        add(
          tag.match(/\bas="(?<as>[^"]+)"/u)?.groups?.as,
          tag.match(/\bhref="(?<href>[^"]+)"/u)?.groups?.href,
        );
      }

      expect([...fonts]).to.have.length(1);
      expect([...logos]).to.have.length(0);
    });
  });
});
