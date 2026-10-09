import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes';
import { registerAnalyticsClient } from '@/lib/analytics';

describe('ModeToggle', () => {
  beforeEach(() => {
    cy.window().then((win) => win.localStorage.setItem('theme', 'light'));
    registerAnalyticsClient({ capture: cy.stub().as('capture') });
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
    cy.get('[data-testid="theme-toggle"]').should(
      'have.attr',
      'aria-label',
      'Switch theme (currently light mode)',
    );
  });

  it('switches from light to dark, persists the selection, and reports analytics', () => {
    cy.get('[data-testid="theme-toggle"] svg').should('have.class', 'lucide-sun');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('[data-testid="theme-toggle"]').should('not.have.attr', 'aria-expanded');
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label', 'Switch theme (currently dark mode)')
      .find('svg')
      .should('have.class', 'lucide-moon');
    cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal('dark'));
    cy.get('@capture').should('have.been.calledWith', 'theme_toggled', { theme: 'dark' });
  });

  it('keeps a native button and retains focus after activation', () => {
    cy.get('[data-testid="theme-toggle"]')
      .should('have.prop', 'tagName', 'BUTTON')
      .and('have.attr', 'type', 'button');
    cy.get('[data-testid="theme-toggle"]').focus().click();
    cy.get('html').should('have.class', 'dark');
    cy.focused().should('have.attr', 'data-testid', 'theme-toggle');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
  });
});
