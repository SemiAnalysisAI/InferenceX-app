// Verifies the new measured-power Y-axis options render on the unofficial-run
// overlay path against a real GitHub Actions artifact (run 26312107787 — the
// on-PR sweep for PR #1558 / qwen3.5-fp8-h200-sglang). This is the canonical
// "preview before merge" test path per CLAUDE.md's overlay requirement.

describe('Measured power on unofficial-run overlay', () => {
  beforeEach(() => {
    cy.visit('/inference?unofficialrun=26312107787', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        // Measured Energy sits behind the ↑↑↓↓ gate while power telemetry is WIP.
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('exposes both measured families and selects average power on the overlay view', () => {
    // Open Y-axis dropdown
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.get('[data-slot="select-content"]').should('exist');

    // The grouped family choices sit below the fold in the scrollable menu.
    cy.contains('[data-slot="select-item"]', /^Measured Power$/u)
      .scrollIntoView()
      .should('be.visible');
    cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
      .scrollIntoView()
      .should('be.visible');

    // Select the power option
    cy.contains('[data-slot="select-item"]', /^Measured Power$/u)
      .scrollIntoView()
      .click();
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.get('[data-testid="measured-power-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-power-statistic-average"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-power-display"]').should('contain.text', 'W/chip');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Average Power per Chip',
    );

    // Initial-load screenshot
    cy.screenshot('measured-power-selected', { capture: 'viewport' });

    // The chart should now contain SVG <path> + <circle>/<polygon> elements
    // (overlay points typically render as triangles). Existence is enough —
    // visual correctness is reviewed in the screenshot.
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
  });

  it('switches to Measured Joules per Output Token without errors', () => {
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Measured Energy$/u)
      .scrollIntoView()
      .click();
    cy.get('[data-slot="select-content"]').should('not.exist');
    cy.get('[data-testid="measured-energy-denominator"]').should('contain.text', 'Output token');
    cy.get('[data-testid="measured-energy-scope"]').should('contain.text', 'All GPUs');
    cy.get('[data-testid="measured-energy-unit"]').should('contain.text', 'J');
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'Measured Joules per Output Token',
    );
    cy.screenshot('measured-joules-selected', { capture: 'viewport' });
    cy.get('[data-testid="inference-chart-display"] svg').should('exist');
  });
});
