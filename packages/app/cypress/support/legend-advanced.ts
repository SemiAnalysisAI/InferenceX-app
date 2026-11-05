export const expandLegendAdvanced = (): void => {
  cy.get('[data-testid="legend-advanced-toggle"]')
    .first()
    .then(($btn) => {
      if ($btn.attr('aria-expanded') !== 'true') {
        cy.wrap($btn).click();
      }
    });
};
