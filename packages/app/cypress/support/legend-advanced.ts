/**
 * Expand the chart legend's collapsed-by-default Advanced drawer.
 *
 * Log Scale, Labels, High Contrast, Parallelism Labels, and Line Labels live
 * inside the Advanced section, so tests must open the drawer before reading
 * or clicking those switches. Idempotent — safe to call when the drawer is
 * already expanded.
 *
 * `cy.get` respects `cy.within` scoping, so call this inside a `.within()`
 * block to target a specific chart's legend (e.g. a replay panel).
 */
export const expandLegendAdvanced = (): void => {
  cy.get('[data-testid="legend-advanced-toggle"]')
    .first()
    .then(($btn) => {
      if ($btn.attr('aria-expanded') !== 'true') {
        cy.wrap($btn).click();
      }
    });
};
