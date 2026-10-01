import { AutumnLeaves } from '@/components/autumn-leaves';

describe('Autumn leaf gutter regression', () => {
  for (const width of [320, 640, 768, 1024, 1280, 1440, 1536]) {
    it(`does not paint over content at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(
        <>
          <AutumnLeaves />
          <div className="container mx-auto px-4 lg:px-8">
            <button data-testid="content-edge" onClick={cy.stub().as('clicked')}>
              Content starts here
            </button>
          </div>
        </>,
      );
      cy.get('[data-testid="autumn-leaves"]')
        .should('have.css', 'pointer-events', 'none')
        .and('have.css', 'overflow', 'hidden')
        .then(($rail) => {
          const rail = $rail[0].getBoundingClientRect();
          cy.get('[data-testid="content-edge"]').then(($content) => {
            expect(rail.left).to.eq(0);
            expect(rail.right).to.be.at.most($content[0].getBoundingClientRect().left);
          });
        });
      cy.get('[data-testid="content-edge"]').click();
      cy.get('@clicked').should('have.been.calledOnce');
    });
  }
});
