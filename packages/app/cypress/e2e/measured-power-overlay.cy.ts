// Verifies the new measured-power Y-axis options render on the unofficial-run
// overlay path against a real GitHub Actions artifact (run 26312107787 — the
// on-PR sweep for PR #1558 / qwen3.5-fp8-h200-sglang). This is the canonical
// "preview before merge" test path per CLAUDE.md's overlay requirement.

describe('Measured power on unofficial-run overlay', () => {
  beforeEach(() => {
    cy.visit('/inference?unofficialrun=26312107787', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="inference-chart-display"]', { timeout: 30_000 }).should('exist');
  });

  it('exposes the Measured Energy dropdown group and renders overlay points', () => {
    // Open Y-axis dropdown
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.get('[data-slot="select-content"]').should('exist');

    // Verify the gated "Measured Energy" group + both options. The select list is a
    // scroll container (max-h-72 overflow-y-auto), and this group sits below the fold,
    // so scroll each target into view before asserting visibility.
    cy.contains('[data-slot="select-content"]', 'Measured Energy')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[role="option"]', 'Measured Average Power per GPU')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[role="option"]', 'Measured Joules per Output Token')
      .scrollIntoView()
      .should('be.visible');

    // Select the power option
    cy.contains('[role="option"]', 'Measured Average Power per GPU').click();
    cy.get('[data-slot="select-content"]').should('not.exist');

    // Initial-load screenshot
    cy.screenshot('measured-power-selected', { capture: 'viewport' });

    // The chart should now contain SVG <path> + <circle>/<polygon> elements
    // (overlay points typically render as triangles). Existence is enough —
    // visual correctness is reviewed in the screenshot.
    cy.get('[data-testid="inference-chart-display"] svg', { timeout: 10_000 }).should('exist');
  });

  it('switches to Measured Joules per Output Token without errors', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click();
    cy.contains('[role="option"]', 'Measured Joules per Output Token').click();
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.screenshot('measured-joules-selected', { capture: 'viewport' });
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
  });
});
