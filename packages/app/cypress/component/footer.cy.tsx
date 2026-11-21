import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Footer } from '@/components/footer/footer';

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
