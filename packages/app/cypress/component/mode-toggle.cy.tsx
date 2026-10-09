import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes';
import { registerAnalyticsClient } from '@/lib/analytics';

const ICONS: Record<string, string> = {
  light: 'lucide-sun',
  dark: 'lucide-moon',
  minecraft: 'lucide-pickaxe',
  csgo: 'lucide-crosshair',
  gta: 'lucide-car',
  doom: 'lucide-skull',
  halo: 'lucide-shield',
};

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

  it('cycles every theme with one click and wraps back to light without a menu', () => {
    for (const theme of [...APP_THEMES.slice(1), 'light']) {
      cy.get('[data-testid="theme-toggle"]').click();
      cy.get('html').should('have.class', theme);
      cy.get('[data-testid="theme-menu"]').should('not.exist');
      cy.get('[data-testid="theme-toggle"]').should('not.have.attr', 'aria-expanded');
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label', `Switch theme (currently ${theme} mode)`)
        .find('svg')
        .should('have.class', ICONS[theme]);
      cy.window().should((win) => expect(win.localStorage.getItem('theme')).to.equal(theme));
      cy.get('@capture').should('have.been.calledWith', 'theme_toggled', { theme });
    }
    cy.get('html').should('not.have.class', 'halo');
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
