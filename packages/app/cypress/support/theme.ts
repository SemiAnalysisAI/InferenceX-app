import { APP_THEMES } from '../../src/lib/themes';

/** Reach a theme through the real toggle, waiting for each React update. */
export function cycleToTheme(theme: string, remaining = APP_THEMES.length): void {
  expect(APP_THEMES, 'registered target theme').to.include(theme);
  cy.get('[data-testid="theme-toggle"]')
    .should('have.attr', 'aria-label')
    .and('contain', 'currently');
  cy.get('html').then(($html) => {
    if ($html.hasClass(theme)) return;
    expect(remaining, `clicks left to reach ${theme}`).to.be.greaterThan(0);
    const current = APP_THEMES.find((candidate) => $html.hasClass(candidate));
    cy.get('[data-testid="theme-toggle"]').click();
    if (current) cy.get('html').should('not.have.class', current);
    cycleToTheme(theme, remaining - 1);
  });
}
