import { APP_THEMES } from '../../src/lib/themes/themes';

/** Pick a theme from the header menu, waiting for hydration first. */
export function selectTheme(theme: string): void {
  expect(APP_THEMES, 'registered target theme').to.include(theme);
  cy.get('[data-testid="theme-toggle"]')
    .should('have.attr', 'aria-label')
    .and('contain', 'currently');
  cy.get('[data-testid="theme-toggle"]').click();
  cy.get(`[data-testid="theme-option-${theme}"]`).click();
  cy.get('html').should('have.class', theme);
  cy.get('[data-testid="theme-menu"]').should('not.exist');
}
