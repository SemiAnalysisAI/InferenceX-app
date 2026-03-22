import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { IntroSection } from '@/components/intro-section';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Intro Section', () => {
  beforeEach(() => {
    cy.mount(
      <QueryClientProvider client={queryClient}>
        <IntroSection />
      </QueryClientProvider>,
    );
  });

  it('renders the intro section card', () => {
    cy.get('[data-testid="intro-section"]').should('be.visible');
  });

  it('mentions InferenceX in the intro text', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'InferenceX');
  });

  it('describes LLM inference performance', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'inference performance');
  });

  it('mentions InferenceMAX (former name)', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'InferenceMAX');
  });

  it('contains links to v1 and v2 articles', () => {
    cy.get('[data-testid="intro-link-v1"]')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com');
    cy.get('[data-testid="intro-link-v2"]')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com');
  });

  it('article links open in a new tab', () => {
    cy.get('[data-testid="intro-link-v1"]').should('have.attr', 'target', '_blank');
    cy.get('[data-testid="intro-link-v2"]').should('have.attr', 'target', '_blank');
  });
});
