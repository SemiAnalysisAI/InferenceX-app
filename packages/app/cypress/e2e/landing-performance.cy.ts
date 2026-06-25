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
      const loadedPattern = win.performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('/brand/left-pattern-full.svg'));
      expect(loadedPattern).to.eq(false);
    });
  });
});
