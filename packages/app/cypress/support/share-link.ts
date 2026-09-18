/**
 * The address bar is stripped clean after load (share-link state lives in the
 * in-memory store), so the Share popover is where a metric change must land.
 * Closes the popover again so the controls stay clickable.
 */
export function assertShareLinkMetric(metric: string): void {
  assertShareLinkParams({ i_metric: metric });
}

/**
 * Asserts several share-link parameters in one popover round trip. A `null`
 * expectation means the parameter must be absent (stripped as a default).
 */
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
  // The link field is read-only, so dismiss the popover from the document.
  cy.get('body').type('{esc}');
  cy.get('[data-testid="share-url-input"]').should('not.exist');
}
