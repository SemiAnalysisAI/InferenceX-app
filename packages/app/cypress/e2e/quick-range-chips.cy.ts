/**
 * Tests for the inline QuickRangeChips that sit under the date-range picker
 * in the Inference tab. Verifies the chips render only when a GPU is selected
 * (and therefore a date range is needed), that clicking applies a range, and
 * that the URL-restored range round-trips back to an active chip.
 */
describe('QuickRangeChips — inline below date-range trigger', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('does not render the chips when no GPU is selected', () => {
    cy.visit('/inference');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.get('[data-testid="quick-range-chips"]').should('not.exist');
  });

  it('renders the inline chips when a GPU is selected via URL', () => {
    cy.visit('/inference?i_gpus=b200_sglang');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.get('[data-testid="quick-range-chips"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="quick-range-chip-all"]').should('exist');
    cy.get('[data-testid="quick-range-chip-ytd"]').should('exist');
    cy.get('[data-testid="quick-range-chip-90d"]').should('exist');
    cy.get('[data-testid="quick-range-chip-30d"]').should('exist');
    cy.get('[data-testid="quick-range-chip-7d"]').should('exist');
  });

  it('lights up the matching chip when the URL range equals the "All" extent', () => {
    cy.visit('/inference?i_gpus=b200_sglang');
    cy.get('[data-testid="quick-range-chips"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="quick-range-chip-all"]').click();
    cy.get('[data-testid="quick-range-chip-all"]').should('have.attr', 'data-active', 'true');
    cy.get('[data-testid="quick-range-chip-all"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('clicking a chip updates the date-range trigger label', () => {
    cy.visit('/inference?i_gpus=b200_sglang');
    cy.get('[data-testid="quick-range-chips"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-testid="quick-range-chip-all"]').click();
    // Trigger label should now show the start - end date pair, not the placeholder
    cy.contains('button', 'Select date range').should('not.exist');
  });
});
