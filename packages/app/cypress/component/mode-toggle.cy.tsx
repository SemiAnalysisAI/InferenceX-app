import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes';

describe('ModeToggle', () => {
  beforeEach(() => {
    cy.mount(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={APP_THEMES}
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

  it('cycles through CS:GO and returns to light mode', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'minecraft');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'csgo');
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label', 'Switch theme (currently csgo mode)')
      .find('svg')
      .should('have.class', 'lucide-crosshair');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'light');
    cy.get('html').should('not.have.class', 'csgo');
    cy.get('html').should('not.have.class', 'dark');
    cy.get('html').should('not.have.class', 'minecraft');
  });
});
