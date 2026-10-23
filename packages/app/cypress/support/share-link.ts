export function assertShareLinkParams(expected: Record<string, string | null>): void {
  cy.get('[data-testid="share-button"]').first().click();
  cy.get('[data-testid="share-url-input"]')
    .invoke('val')
    .should((value) => {
      const params = new URL(String(value)).searchParams;
      for (const [key, param] of Object.entries(expected)) {
        expect(params.get(key), `${key} in the share link`).to.eq(param);
      }
    });
  cy.get('body').type('{esc}');
  cy.get('[data-testid="share-url-input"]').should('not.exist');
}
