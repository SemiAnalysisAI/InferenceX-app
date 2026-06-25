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
      expect(resourceNames.some((name) => name.includes('/logos/huggingface.svg'))).to.eq(false);
      expect(
        resourceNames.some(
          (name) => name.includes('/brand/logo-color.webp') && name.includes('w=128'),
        ),
      ).to.eq(false);
    });
  });

  it('preloads only the default font and initially visible supporter logo', () => {
    cy.request('/').then((response) => {
      const linkHeader = String(response.headers.link ?? '');
      const fontPreloads = linkHeader.match(/rel=preload; as="font"/gu) ?? [];
      const logoPreloads = linkHeader.match(/<\/logos\/[^>]+>; rel=preload; as="image"/gu) ?? [];
      expect(fontPreloads).to.have.length(1);
      expect(logoPreloads).to.have.length(1);
      expect(linkHeader).to.contain('</logos/openai.svg>; rel=preload; as="image"');
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
