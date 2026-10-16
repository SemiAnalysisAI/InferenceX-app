import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes/themes';
import { registerAnalyticsClient } from '@/lib/analytics/analytics';

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

  it('opens a menu, selects a theme directly, persists it, and reports analytics', () => {
    cy.get('[data-testid="theme-toggle"] svg').should('have.class', 'lucide-sun');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-menu"] [role="radio"]').should('have.length', APP_THEMES.length);
    cy.get('[data-testid="theme-option-light"]').should('have.attr', 'aria-checked', 'true');
    cy.get('[data-testid="theme-option-halo"]').click();
    cy.get('html').should('have.class', 'halo');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-label', 'Switch theme (currently halo mode)')
      .find('svg')
      .should('have.class', 'lucide-shield');
    cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal('halo'));
    cy.get('@capture').should('have.been.calledWith', 'theme_toggled', { theme: 'halo' });
  });

  it('moves through options with arrow keys and returns focus to the trigger', () => {
    cy.get('[data-testid="theme-toggle"]')
      .should('have.prop', 'tagName', 'BUTTON')
      .and('have.attr', 'type', 'button');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.focused().should('have.attr', 'data-testid', 'theme-option-light');
    cy.focused().type('{end}');
    cy.focused().should('have.attr', 'data-testid', 'theme-option-halo').type('{downArrow}');
    cy.focused().should('have.attr', 'data-testid', 'theme-option-light').type('{downArrow}');
    cy.focused().should('have.attr', 'data-testid', 'theme-option-dark').click();
    cy.get('html').should('have.class', 'dark');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.focused().should('have.attr', 'data-testid', 'theme-toggle');
  });

  it('closes on Escape without changing the theme', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.get('[data-testid="theme-menu"]').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('html').should('have.class', 'light');
  });
});
