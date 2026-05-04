import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';

describe('ModeToggle', () => {
  beforeEach(() => {
    cy.mount(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={['light', 'dark', 'minecraft', 'rick-morty']}
        disableTransitionOnChange
      >
        <ModeToggle />
      </ThemeProvider>,
    );
  });

  it('clicking toggle cycles light → dark', () => {
    cy.get('html').should('not.have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
  });

  it('clicking toggle twice cycles light → dark → minecraft', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'minecraft');
  });

  it('clicking toggle three times cycles light → dark → minecraft → rick-morty', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'minecraft');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'rick-morty');
  });

  it('clicking toggle four times returns to light mode', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('not.have.class', 'dark');
    cy.get('html').should('not.have.class', 'minecraft');
    cy.get('html').should('not.have.class', 'rick-morty');
  });
});
