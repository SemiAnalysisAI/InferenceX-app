import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Header } from '@/components/header/header';
import { ThemeProvider } from '@/components/ui/theme-provider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('Header', () => {
  beforeEach(() => {
    cy.mount(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <Header />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  });

  it('renders the header element', () => {
    cy.get('[data-testid="header"]').should('be.visible');
  });

  it('displays the InferenceX title', () => {
    cy.get('[data-testid="header"]').contains('InferenceX').should('be.visible');
  });

  it('displays the SemiAnalysis logo', () => {
    cy.get('[data-testid="header"]').find('img[alt="SemiAnalysis logo"]').should('exist');
  });

  it('shows Dashboard nav link', () => {
    cy.get('[data-testid="nav-link-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.attr', 'href', '/');
  });

  it('shows Media nav link', () => {
    cy.get('[data-testid="nav-link-media"]').should('be.visible');
    cy.get('[data-testid="nav-link-media"]').should('have.attr', 'href', '/media');
  });

  it('shows Supporters nav link', () => {
    cy.get('[data-testid="nav-link-supporters"]').should('be.visible');
    cy.get('[data-testid="nav-link-supporters"]').should('have.attr', 'href', '/quotes');
  });

  it('shows the GitHub stars button linking to the correct repo', () => {
    cy.get('[data-testid="header-star-button"]').should('be.visible');
    cy.get('[data-testid="header-star-button"]')
      .should('have.attr', 'href')
      .and('include', 'github.com/SemiAnalysisAI/InferenceX');
  });

  it('GitHub stars button has glow animation class', () => {
    cy.get('[data-testid="header-star-button"]').should('have.class', 'star-button-glow');
  });

  it('shows the theme toggle button', () => {
    cy.get('[data-testid="theme-toggle"]').should('be.visible');
  });

  it('shows mobile nav links on small viewports', () => {
    cy.viewport(375, 812);
    cy.get('[data-testid="mobile-nav"]').should('be.visible');
    cy.get('[data-testid="mobile-nav"]').contains('Dashboard').should('be.visible');
    cy.get('[data-testid="mobile-nav"]').contains('Media').should('be.visible');
    cy.get('[data-testid="mobile-nav"]').contains('Supporters').should('be.visible');
  });
});
