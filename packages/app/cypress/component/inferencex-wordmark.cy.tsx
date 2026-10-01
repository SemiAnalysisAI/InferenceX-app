import { InferenceXWordmark } from '@/components/header/inferencex-wordmark';

describe('Halloween wordmark', () => {
  for (const width of [320, 375, 1440]) {
    for (const theme of ['light', 'dark', 'minecraft']) {
      it(`keeps the pumpkin over the wordmark at ${width}px in ${theme} mode`, () => {
        cy.viewport(width, 800);
        cy.mount(
          <div className={theme}>
            <a href="#home" className="inline-flex h-14 items-center px-4">
              <InferenceXWordmark />
            </a>
          </div>,
        );

        cy.get('[data-testid="wordmark-pumpkin"]')
          .should('have.attr', 'aria-hidden', 'true')
          .and('have.css', 'pointer-events', 'none')
          .and('be.visible')
          .then(($pumpkin) => {
            const pumpkin = $pumpkin[0].getBoundingClientRect();
            cy.get('.halloween-wordmark-x').then(($x) => {
              const x = $x[0].getBoundingClientRect();
              expect(pumpkin.left).to.be.lessThan(x.right);
              expect(pumpkin.right).to.be.greaterThan(x.left);
              expect(pumpkin.top).to.be.lessThan(x.top);
              expect(pumpkin.bottom).to.be.greaterThan(x.top);
              expect(pumpkin.top).to.be.at.least(0);
              expect(pumpkin.right).to.be.at.most(width);
            });
          });
        cy.get('[data-testid="inferencex-wordmark"]').should(
          'have.css',
          'color',
          theme === 'light' ? 'rgb(181, 71, 8)' : 'rgb(251, 146, 60)',
        );
        cy.get('[data-testid="inferencex-wordmark"]').should(($wordmark) => {
          const spacing = getComputedStyle($wordmark[0]).letterSpacing;
          expect(spacing === 'normal' ? 0 : parseFloat(spacing)).to.eq(0);
        });
        cy.get('a').should('contain.text', 'InferenceX').click();
        cy.location('hash').should('eq', '#home');
      });
    }
  }
});
