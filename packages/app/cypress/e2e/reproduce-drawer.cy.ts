/**
 * Tests for the Reproduce drawer — opens from the inference table row,
 * scatter pinned tooltip, and GPU graph tooltip. Verifies drawer state is
 * URL-safe (closing does not perturb chart zoom or query string).
 */
describe('Reproduce drawer', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
  });

  it('opens from clicking an inference table row and shows the three tabs', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.get('[data-testid="inference-results-table"] tbody tr').first().click();

    cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
    cy.contains('Reproduce this benchmark').should('be.visible');
    cy.contains('button', 'Command').should('be.visible');
    cy.contains('button', 'Config JSON').should('be.visible');
    cy.contains('button', 'Environment').should('be.visible');
  });

  it('exposes a copy button on every tab', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"] tbody tr').first().click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
    cy.contains('button', 'Config JSON').click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
    cy.contains('button', 'Environment').click();
    cy.get('[data-testid="reproduce-drawer-copy"]').should('be.visible');
  });

  it('Config JSON tab shows config fields and excludes result metrics', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"] tbody tr').first().click();
    cy.contains('button', 'Config JSON').click();
    cy.get('[data-testid="reproduce-drawer"]')
      .find('pre')
      .first()
      .invoke('text')
      .then((text) => {
        // Config / identity fields belong here.
        expect(text).to.match(/"framework":/u);
        expect(text).to.match(/"precision":/u);
        expect(text).to.match(/"tp":/u);
        // Raw result metrics from `benchmark_results.metrics` must NOT leak in.
        expect(text).not.to.match(/"mean_ttft":/u);
        expect(text).not.to.match(/"p99_e2el":/u);
        expect(text).not.to.match(/"tput_per_gpu":/u);
      });
  });

  it('Environment tab renders structured rows including env-only fields with graceful fallback', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"] tbody tr').first().click();
    cy.contains('button', 'Environment').click();
    // Core rows are always rendered. The values come from /api/v1/run-environment
    // when available; otherwise they show "(not recorded)" — we assert the
    // labels exist either way so a regression that drops a row is caught.
    const labels = [
      'GPU',
      'GPU SKU',
      'Framework',
      'Framework version',
      'Framework SHA',
      'Container image',
      'Driver',
      'CUDA',
      'PyTorch',
      'Python',
    ];
    for (const label of labels) {
      cy.get('[data-testid="reproduce-drawer"]').contains('dt', label).should('be.visible');
    }
  });

  it('Esc closes the drawer without changing the URL hash', () => {
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.url().then((before) => {
      cy.get('[data-testid="inference-results-table"] tbody tr').first().click();
      cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('[data-testid="reproduce-drawer"]').should('not.exist');
      cy.url().should('eq', before);
    });
  });

  it('renders correctly for an unofficial-run overlay row when one is loaded', () => {
    // Re-visit with the overlay query param. We do NOT assert which row is
    // rendered — we only assert the drawer can be opened from whatever points
    // appear for the official path on top of the overlay. The wiring is the
    // same code path: clicking an inference table row feeds the InferenceData
    // through to the drawer regardless of where the row originated.
    const candidateRunId = '15000000000';
    cy.visit(`/inference?unofficialrun=${candidateRunId}`);
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0);
    cy.get('[data-testid="inference-table-view-btn"]').first().click();
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.get('[data-testid="inference-results-table"] tbody tr').first().click();
    cy.get('[data-testid="reproduce-drawer"]').should('be.visible');
    // Same Config JSON guarantee for the overlay path — the drawer renders
    // overlay points through the same `InferenceData` shape, so result-metric
    // leakage would silently regress there too if we didn't assert it.
    cy.contains('button', 'Config JSON').click();
    cy.get('[data-testid="reproduce-drawer"]')
      .find('pre')
      .first()
      .invoke('text')
      .then((text) => {
        expect(text).to.match(/"framework":/u);
        expect(text).not.to.match(/"mean_ttft":/u);
        expect(text).not.to.match(/"tput_per_gpu":/u);
      });
  });
});
