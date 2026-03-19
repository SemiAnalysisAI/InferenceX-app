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

  it('renders the footer element', () => {
    cy.get('[data-testid="footer"]').should('exist');
  });

  it('displays copyright notice with semianalysis.com and current year', () => {
    const year = new Date().getFullYear().toString();
    cy.get('[data-testid="footer-copyright"]').should('contain', 'semianalysis.com');
    cy.get('[data-testid="footer-copyright"]').should('contain', year);
  });

  it('shows the GitHub star CTA linking to GitHub repo', () => {
    cy.get('[data-testid="footer-star-cta"]').should('be.visible');
    cy.get('[data-testid="footer-star-cta"]')
      .find('a')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX');
  });

  it('footer star CTA opens in new tab', () => {
    cy.get('[data-testid="footer-star-cta"] a').should('have.attr', 'target', '_blank');
  });

  it('shows social share buttons', () => {
    cy.get('[data-testid="social-share-buttons"]').should('be.visible');
  });

  it('has Privacy Policy link', () => {
    cy.get('[data-testid="footer"]')
      .contains('Privacy Policy')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com/privacy-policy');
  });

  it('has Cookie Policy link', () => {
    cy.get('[data-testid="footer"]')
      .contains('Cookie Policy')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com/cookie-policy');
  });

  it('has Contribute link pointing to GitHub', () => {
    cy.get('[data-testid="footer"]')
      .contains('Contribute')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX');
  });

  it('shows the SemiAnalysis logo', () => {
    cy.get('[data-testid="footer"]').find('img[alt="SemiAnalysis logo"]').should('exist');
  });

  it('all external links open in a new tab', () => {
    cy.get('[data-testid="footer"]')
      .find('a[target="_blank"]')
      .should('have.length.greaterThan', 0);
  });
});
