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

  it('displays copyright notice with semianalysis.com and current year', () => {
    const year = new Date().getFullYear().toString();
    cy.get('[data-testid="footer-copyright"]').should('contain', 'semianalysis.com');
    cy.get('[data-testid="footer-copyright"]').should('contain', year);
  });

  it('shows the GitHub star CTA', () => {
    cy.get('[data-testid="footer-star-cta"]').should('be.visible');
    cy.get('[data-testid="footer-star-cta"]').should('contain', 'Star');
  });

  it('shows social share buttons', () => {
    cy.get('[data-testid="footer-social-buttons"]').should('be.visible');
    cy.get('[data-testid="footer-social-buttons"]')
      .find('button')
      .should('have.length.greaterThan', 1);
  });

  it('has Privacy Policy link', () => {
    cy.get('[data-testid="footer-link-privacy"]')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com/privacy-policy');
  });

  it('has Cookie Policy link', () => {
    cy.get('[data-testid="footer-link-cookies"]')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com/cookie-policy');
  });

  it('has Contribute section with GitHub links', () => {
    cy.get('[data-testid="footer-link-benchmarks"]')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX');
    cy.get('[data-testid="footer-link-frontend"]')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX-app');
  });

  it('all external links open in a new tab', () => {
    cy.get('[data-testid="footer-links"]')
      .find('a[target="_blank"]')
      .should('have.length.greaterThan', 0);
  });
});
