import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import { Header } from '@/components/header/header';
import { ThemeProvider } from '@/components/ui/theme-provider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function createMockRouter() {
  return {
    push: cy.stub(),
    replace: cy.stub(),
    refresh: cy.stub(),
    back: cy.stub(),
    forward: cy.stub(),
    prefetch: cy.stub().resolves(),
  };
}

describe('Header', () => {
  beforeEach(() => {
    const mockRouter = createMockRouter();
    cy.mount(
      <AppRouterContext.Provider value={mockRouter}>
        <PathnameContext.Provider value="/">
          <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
              <Header />
            </ThemeProvider>
          </QueryClientProvider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );
  });

  it('displays the InferenceX title', () => {
    cy.get('[data-testid="header"]').contains('InferenceX').should('be.visible');
  });

  it('displays the SemiAnalysis logo', () => {
    cy.get('[data-testid="header"]').find('img[alt="SemiAnalysis logo"]').should('exist');
  });

  it('shows Dashboard nav link', () => {
    cy.get('[data-testid="nav-link-dashboard"]').should('be.visible');
    cy.get('[data-testid="nav-link-dashboard"]').should('have.attr', 'href', '/inference');
  });

  it('shows Comparisons nav link', () => {
    cy.get('[data-testid="nav-link-compare"]').should('be.visible');
    cy.get('[data-testid="nav-link-compare"]').should('have.attr', 'href', '/compare');
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

  it('shows the theme toggle button', () => {
    cy.get('[data-testid="theme-toggle"]').should('be.visible');
  });

  it('shows mobile hamburger menu on small viewports', () => {
    cy.viewport(375, 812);
    cy.get('[data-testid="mobile-menu-toggle"]').should('be.visible');
    cy.get('[data-testid="mobile-menu-toggle"]').click();
    cy.contains('Dashboard').should('be.visible');
    cy.contains('Comparisons').should('be.visible');
    cy.contains('Supporters').should('be.visible');
  });
});
