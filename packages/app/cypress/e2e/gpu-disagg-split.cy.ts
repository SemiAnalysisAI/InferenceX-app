/**
 * Regression: GB200 dynamo-trt disagg=true and disagg=false must render as
 * separate legend entries on the inference chart. Prior to the fix, both
 * variants collapsed to a single `gb200_dynamo-trt` hwKey and the frontier
 * mixed points from different actual measurement dates (2025-11-17 +
 * 2026-03-23) under one "GB200 Dynamo TRT" legend line.
 *
 * Exact triggering filters: model=DSR1, sequence=8k/1k, precision=fp4 (the
 * only slice where both disagg variants coexist for gb200 dynamo-trt).
 */
describe('GB200 Dynamo TRT disagg/non-disagg render as separate legend entries', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference?g_model=DeepSeek_R1&i_seq=8k1k&i_prec=fp4');
  });

  it('renders chart with data', () => {
    cy.get('[data-testid="inference-chart-display"]').should('exist');
    cy.get('[data-testid="scatter-graph"]')
      .first()
      .find('svg circle')
      .should('have.length.at.least', 1);
    cy.contains('No data available').should('not.exist');
  });

  it('shows both GB200 Dynamo TRT variants (disagg + non-disagg) in the sidebar legend', () => {
    cy.get('.sidebar-legend')
      .first()
      .within(() => {
        // Non-disagg: label contains "Dynamo TRT" but not "Disagg"
        cy.contains(/^(?=.*Dynamo TRT)(?!.*Disagg).*$/).should('exist');
        // Disagg variant: label contains both "Dynamo TRT" and "Disagg"
        cy.contains(/Dynamo TRT.*Disagg|Disagg.*Dynamo TRT/).should('exist');
      });
  });
});
