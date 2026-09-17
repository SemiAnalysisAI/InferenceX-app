/**
 * The address bar is stripped clean after load (share-link state lives in the
 * in-memory store), so the Share popover is where a metric change must land.
 * Closes the popover again so the controls stay clickable.
 */
export function assertShareLinkMetric(metric: string): void {
  cy.get('[data-testid="share-button"]').first().click();
  cy.get('[data-testid="share-url-input"]')
    .invoke('val')
    .should((value) => {
      expect(
        new URL(String(value)).searchParams.get('i_metric'),
        'i_metric in the share link',
      ).to.eq(metric);
    });
  // The link field is read-only, so dismiss the popover from the document.
  cy.get('body').type('{esc}');
  cy.get('[data-testid="share-url-input"]').should('not.exist');
}
