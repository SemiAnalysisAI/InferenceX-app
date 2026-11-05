import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Footer } from '@/components/footer/footer';
import { registerAnalyticsClient } from '@/lib/analytics/analytics';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Footer', () => {
  beforeEach(() => {
    cy.mount(
      <QueryClientProvider client={queryClient}>
        <Footer />
      </QueryClientProvider>,
    );
  });

  it('marks star and share clicks as coming from the footer', () => {
    registerAnalyticsClient({ capture: cy.stub().as('capture') });
    cy.window().then((win) => cy.stub(win, 'open'));
    cy.get('[data-testid="footer-star-cta"]').click();
    cy.get('@capture').should('have.been.calledWith', 'footer_star_starred', {
      placement: 'footer',
    });
    cy.get('[data-testid="footer"] [data-testid="share-linkedin"]').click();
    cy.get('@capture').should(
      'have.been.calledWith',
      'social_share_linkedin',
      Cypress.sinon.match({ placement: 'footer', route_template: Cypress.sinon.match.string }),
    );
  });

  for (const width of [390, 768, 1280]) {
    it(`keeps every footer destination readable and inside the page at ${width}px`, () => {
      cy.viewport(width, 720);
      cy.get('[data-testid="footer-links"] a').should(($links) => {
        expect($links.length).to.be.greaterThan(20);
        for (const link of $links) {
          const bounds = link.getBoundingClientRect();
          expect(bounds.left, link.textContent ?? '').to.be.at.least(0);
          expect(bounds.right, link.textContent ?? '').to.be.at.most(width);
          expect(link.scrollWidth, 'link text fits').to.be.at.most(link.clientWidth);
          if (width < 768) expect(bounds.height, 'mobile touch target').to.be.at.least(44);
        }
      });
      cy.get('[data-testid="footer-link-run"]').focus().should('be.focused');
    });
  }
});
