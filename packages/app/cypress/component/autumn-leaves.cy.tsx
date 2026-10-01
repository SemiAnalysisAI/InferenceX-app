import { AutumnLeaves } from '@/components/autumn-leaves';

describe('Autumn leaves', () => {
  for (const width of [320, 390, 1280, 1440]) {
    it(`confines decorative leaves to the left gutter at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(
        <>
          <AutumnLeaves />
          <button
            style={{ position: 'fixed', top: 100, left: 0 }}
            onClick={cy.stub().as('clicked')}
          >
            Content beneath decoration
          </button>
        </>,
      );
      cy.get('[data-testid="autumn-leaves"]')
        .should('have.attr', 'aria-hidden', 'true')
        .and('have.css', 'pointer-events', 'none')
        .and('have.css', 'overflow', 'hidden')
        .then(($rail) => {
          const rail = $rail[0].getBoundingClientRect();
          expect(rail.left).to.eq(0);
          expect(rail.top).to.be.at.least(56);
          expect(rail.width).to.be.at.most(width < 640 ? 16 : 100);
        });
      cy.get('.autumn-leaf:visible').should('have.length', width < 640 ? 3 : 6);
      cy.get('button').click('left');
      cy.get('@clicked').should('have.been.calledOnce');
    });
  }

  it('finishes its animation within five seconds rather than looping', () => {
    cy.mount(<AutumnLeaves />);
    cy.get('.autumn-leaf').each(($leaf) => {
      const style = getComputedStyle($leaf[0]);
      expect(style.animationIterationCount).to.eq('1');
      expect(parseFloat(style.animationDuration)).to.be.at.most(5);
      expect(style.animationName).to.eq(
        $leaf[0].ownerDocument.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'none'
          : 'autumn-leaf-fall',
      );
    });
  });

  it('does not add seasonal decoration to Minecraft mode', () => {
    cy.mount(
      <div className="minecraft">
        <AutumnLeaves />
      </div>,
    );
    cy.get('[data-testid="autumn-leaves"]').should('not.be.visible');
  });

  it('stays out of embedded charts', () => {
    cy.mount(<AutumnLeaves />);
    cy.document().then((doc) => {
      doc.documentElement.dataset.inferencexEmbed = '';
    });
    cy.get('[data-testid="autumn-leaves"]').should('not.be.visible');
    cy.document().then((doc) => {
      delete doc.documentElement.dataset.inferencexEmbed;
    });
    cy.get('[data-testid="autumn-leaves"]').should('be.visible');
  });
});
