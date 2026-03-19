import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';

describe('ModeToggle', () => {
  beforeEach(() => {
    cy.mount(
      <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
        <ModeToggle />
      </ThemeProvider>,
    );
  });

  it('renders the theme toggle button', () => {
    cy.get('[data-testid="theme-toggle"]').should('be.visible');
  });

  it('has accessible aria-label', () => {
    cy.get('[data-testid="theme-toggle"]').should('have.attr', 'aria-label');
  });

  it('clicking toggle switches to dark mode', () => {
    cy.get('html').should('not.have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
  });

  it('clicking toggle twice returns to light mode', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('not.have.class', 'dark');
  });
});
