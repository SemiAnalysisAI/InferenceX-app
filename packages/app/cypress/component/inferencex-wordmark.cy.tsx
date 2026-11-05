import { InferenceXWordmark } from '@/components/header/inferencex-wordmark';

describe('Blue wave wordmark', () => {
  afterEach(() => {
    if (Cypress.isBrowser({ family: 'chromium' })) {
      cy.then(() =>
        Cypress.automation('remote:debugger:protocol', {
          command: 'Emulation.setEmulatedMedia',
          params: { features: [] },
        }),
      );
    }
  });

  for (const width of [320, 375, 1440]) {
    for (const theme of ['light', 'dark']) {
      it(`keeps the animated home link readable at ${width}px in ${theme} mode`, () => {
        cy.viewport(width, 800);
        cy.mount(
          <div className={theme}>
            <a href="#home" className="inline-flex h-14 items-center px-4">
              <InferenceXWordmark />
            </a>
          </div>,
        );

        cy.get('[data-testid="wordmark-turkey"]').should('not.exist');
        cy.get('[data-testid="inferencex-wordmark"]').should(
          'have.css',
          'color',
          theme === 'light' ? 'rgb(29, 78, 216)' : 'rgb(147, 197, 253)',
        );
        cy.get('[data-testid="inferencex-wordmark"]')
          .should('have.text', 'InferenceX')
          .and('have.attr', 'aria-label', 'InferenceX')
          .and('have.attr', 'role', 'img')
          .then(($wordmark) => {
            const element = $wordmark[0];
            const bounds = element.getBoundingClientRect();
            expect(bounds.left).to.be.at.least(0);
            expect(bounds.right).to.be.at.most(width);
            expect(bounds.top).to.be.at.least(0);
            const win = element.ownerDocument.defaultView!;
            const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const letters = element.querySelectorAll<HTMLElement>('.inferencex-wave-letter');
            expect(letters).to.have.length(10);
            expect(win.getComputedStyle(letters[0]).animationName).to.equal(
              reducedMotion ? 'none' : 'inferencex-blue-wave',
            );
            if (!reducedMotion) {
              const animation = letters[0].getAnimations()[0];
              animation.pause();
              animation.currentTime = 0;
              const start = letters[0].getBoundingClientRect().top;
              animation.currentTime = 900;
              expect(letters[0].getBoundingClientRect().top - start).to.be.closeTo(6, 0.1);
              expect(element.getBoundingClientRect().width).to.equal(bounds.width);
              expect(win.getComputedStyle(letters[1]).animationDelay).not.to.equal(
                win.getComputedStyle(letters[0]).animationDelay,
              );
            }
          });
        cy.get('a').should('contain.text', 'InferenceX').click();
        cy.location('hash').should('eq', '#home');
      });
    }
  }

  for (const feature of [
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'forced-colors', value: 'active' },
  ]) {
    it(`keeps a static, readable label with ${feature.name}`, function () {
      if (!Cypress.isBrowser({ family: 'chromium' })) this.skip();
      cy.then(() =>
        Cypress.automation('remote:debugger:protocol', {
          command: 'Emulation.setEmulatedMedia',
          params: { features: [feature] },
        }),
      );
      cy.mount(
        <a href="#home">
          <InferenceXWordmark />
        </a>,
      );
      cy.get('[data-testid="inferencex-wordmark"]')
        .should('have.text', 'InferenceX')
        .and('be.visible')
        .then(($wordmark) => {
          if (feature.name === 'forced-colors') {
            const style = getComputedStyle($wordmark[0]);
            expect(style.color).not.to.equal('rgba(0, 0, 0, 0)');
          }
        });
      cy.get('.inferencex-wave-letter').each(($letter) => {
        cy.wrap($letter)
          .should('have.attr', 'aria-hidden', 'true')
          .and('have.css', 'animation-name', 'none')
          .and('have.css', 'transform', 'none');
      });
      cy.get('a').click();
      cy.location('hash').should('eq', '#home');
    });
  }
});
