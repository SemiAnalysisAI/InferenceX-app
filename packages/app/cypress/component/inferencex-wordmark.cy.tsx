import { InferenceXWordmark } from '@/components/header/inferencex-wordmark';

describe('Thanksgiving wordmark', () => {
  for (const width of [320, 375, 1440]) {
    for (const theme of ['light', 'dark']) {
      it(`keeps the turkey over the wordmark at ${width}px in ${theme} mode`, () => {
        cy.viewport(width, 800);
        cy.mount(
          <div className={theme}>
            <a href="#home" className="inline-flex h-14 items-center px-4">
              <InferenceXWordmark />
            </a>
          </div>,
        );

        cy.get('[data-testid="wordmark-turkey"]')
          .should('have.attr', 'aria-hidden', 'true')
          .and('have.css', 'pointer-events', 'none')
          .and('be.visible')
          .then(($turkey) => {
            const turkey = $turkey[0].getBoundingClientRect();
            cy.get('.thanksgiving-wordmark-x').then(($x) => {
              const x = $x[0].getBoundingClientRect();
              expect(turkey.left).to.be.lessThan(x.right);
              expect(turkey.right).to.be.greaterThan(x.left);
              expect(turkey.top).to.be.lessThan(x.top);
              expect(turkey.bottom).to.be.greaterThan(x.top);
              expect(turkey.top).to.be.at.least(0);
              expect(turkey.right).to.be.at.most(width);
            });
          });
        cy.get('[data-testid="inferencex-wordmark"]').should(
          'have.css',
          'color',
          theme === 'light' ? 'rgb(146, 64, 14)' : 'rgb(251, 191, 36)',
        );
        cy.get('a').should('contain.text', 'InferenceX').click();
        cy.location('hash').should('eq', '#home');
      });
    }
  }
});
