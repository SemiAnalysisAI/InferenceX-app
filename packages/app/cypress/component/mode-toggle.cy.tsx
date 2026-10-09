import { ModeToggle } from '@/components/ui/mode-toggle';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { APP_THEMES } from '@/lib/themes';

const ICONS: Record<string, string> = {
  light: 'lucide-sun',
  dark: 'lucide-moon',
  minecraft: 'lucide-pickaxe',
  csgo: 'lucide-crosshair',
  gta: 'lucide-car',
  doom: 'lucide-skull',
  halo: 'lucide-shield',
};

function pick(theme: string) {
  cy.get('[data-testid="theme-toggle"]').click();
  cy.get(`[data-testid="theme-option-${theme}"]`).click();
}

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

  it('expands an icon-only menu with one option per theme', () => {
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('[data-testid="theme-toggle"]')
      .should('have.attr', 'aria-expanded', 'false')
      .click()
      .should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="theme-menu"] [role="radio"]').should('have.length', APP_THEMES.length);
    cy.get('[data-testid="theme-option-kart"]').should('not.exist');
    for (const theme of APP_THEMES) {
      cy.get(`[data-testid="theme-option-${theme}"]`)
        .should('have.attr', 'aria-label')
        .and('not.be.empty');
      // Icons only: no visible text inside an option.
      cy.get(`[data-testid="theme-option-${theme}"]`).should('have.text', '');
      cy.get(`[data-testid="theme-option-${theme}"] svg`).should('have.class', ICONS[theme]);
    }
    cy.get('[data-testid="theme-option-light"]')
      .should('have.attr', 'aria-checked', 'true')
      .and('have.focus');
  });

  it('selects any theme directly and closes the menu', () => {
    for (const theme of ['doom', 'halo', 'gta', 'minecraft', 'dark', 'csgo', 'light']) {
      pick(theme);
      cy.get('html').should('have.class', theme);
      cy.get('[data-testid="theme-menu"]').should('not.exist');
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label', `Switch theme (currently ${theme} mode)`)
        .find('svg')
        .should('have.class', ICONS[theme]);
    }
    cy.get('html').should('not.have.class', 'gta');
  });

  it('supports arrow-key navigation and Escape', () => {
    cy.get('[data-testid="theme-toggle"]').click();
    cy.focused().should('have.attr', 'data-testid', 'theme-option-light');
    cy.focused().type('{downArrow}');
    cy.focused().should('have.attr', 'data-testid', 'theme-option-dark');
    cy.focused().type('{upArrow}{upArrow}');
    cy.focused().should('have.attr', 'data-testid', `theme-option-${APP_THEMES.at(-1)}`);
    cy.focused().click();
    cy.get('html').should('have.class', APP_THEMES.at(-1)!);
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('[data-testid="theme-toggle"]').click();
    cy.focused().should('have.attr', 'data-testid', `theme-option-${APP_THEMES.at(-1)}`);
    cy.focused().type('{esc}');
    cy.get('[data-testid="theme-menu"]').should('not.exist');
    cy.get('html').should('have.class', APP_THEMES.at(-1)!);
  });
});
