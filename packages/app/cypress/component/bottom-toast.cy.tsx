import { Star } from 'lucide-react';

import { BottomToast } from '@/components/ui/bottom-toast';

function mountToast() {
  cy.mount(
    <div>
      <div data-testid="page-content" style={{ height: 1600 }} />
      <BottomToast
        icon={<Star />}
        title="Finding us useful?"
        description="Help the project grow so we can add more benchmarks! Star us on GitHub."
        action={{ label: 'Star on GitHub', onClick: cy.stub().as('starAction') }}
        testId="star-toast"
      />
    </div>,
  );
}

describe('BottomToast', () => {
  afterEach(() => {
    cy.document().then((doc) => {
      doc.body.style.paddingBottom = '';
    });
  });

  it('docks as a single compact bar on a 361px phone and keeps the page end reachable', () => {
    cy.viewport(361, 780);
    mountToast();
    cy.get('[data-testid="star-toast"]').should('have.css', 'opacity', '1');
    cy.get('[data-testid="star-toast"]').then(($toast) => {
      const rect = $toast[0].getBoundingClientRect();
      const viewportWidth = $toast[0].ownerDocument.documentElement.clientWidth;
      expect(rect.left).to.equal(0);
      expect(rect.right).to.equal(viewportWidth);
      expect(rect.bottom).to.equal(780);
      expect(rect.height, 'compact bar height').to.be.lte(64);

      const action = $toast[0].querySelector('button:not([aria-label])')!.getBoundingClientRect();
      const dismiss = $toast[0]
        .querySelector('button[aria-label="Dismiss"]')!
        .getBoundingClientRect();
      expect(
        Math.abs(action.top + action.height / 2 - (dismiss.top + dismiss.height / 2)),
      ).to.be.lte(1);
      expect(action.right).to.be.lte(dismiss.left);
      cy.document().its('body.style.paddingBottom').should('equal', `${rect.height}px`);
    });
    cy.contains('button', 'Star on GitHub').click();
    cy.get('@starAction').should('have.been.calledOnce');
    cy.get('[data-testid="star-toast"]').should('not.exist');
    cy.document().its('body.style.paddingBottom').should('equal', '');
  });

  it('keeps the floating corner card on desktop without reserving page space', () => {
    cy.viewport(1280, 800);
    mountToast();
    cy.get('[data-testid="star-toast"]').should('have.css', 'opacity', '1');
    cy.get('[data-testid="star-toast"]').then(($toast) => {
      const rect = $toast[0].getBoundingClientRect();
      const viewportWidth = $toast[0].ownerDocument.documentElement.clientWidth;
      expect(rect.right).to.equal(viewportWidth - 24);
      expect(rect.bottom).to.equal(800 - 24);
      expect(rect.width).to.be.lte(384);
    });
    cy.document().its('body.style.paddingBottom').should('equal', '');
  });
});
