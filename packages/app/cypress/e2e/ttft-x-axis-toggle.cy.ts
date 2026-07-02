const interceptDerivedMetrics = () => {
  cy.intercept('GET', '/api/v1/derived-agentic-metrics*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    request.reply({
      body: Object.fromEntries(
        ids.map((id, index) => [
          id,
          {
            id: Number(id),
            normalized_session_time_s: 60 + index,
            p90_prefill_tps_per_user: 100 + index,
            p75_normalized_e2e_400_s: 8 + index,
            p90_normalized_e2e_400_s: 12 + index,
          },
        ]),
      ),
    });
  }).as('derivedAgenticMetrics');
};

describe('X-Axis Mode Toggle (inference chart)', () => {
  before(() => {
    cy.visit('/inference', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="x-axis-mode-buttons"]').should('be.visible');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
  });

  it('shows Interactivity by default for the agentic view', () => {
    cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic Traces');
    cy.get('[data-testid="x-axis-mode-ttft"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').should('be.visible');
    cy.get('[data-testid="x-axis-mode-interactivity"]')
      .should('be.visible')
      .and('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
  });

  it('switches the x-axis to TTFT and updates the heading', () => {
    cy.get('[data-testid="x-axis-mode-ttft"]').click();
    cy.get('[data-testid="x-axis-mode-ttft"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Time To First Token');
  });

  it('switches the x-axis to E2E Latency and updates the heading', () => {
    cy.get('[data-testid="x-axis-mode-e2e"]').click();
    cy.get('[data-testid="x-axis-mode-e2e"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'End-to-end Latency');
  });

  it('switches to request-level normalized E2E at 400 output tokens', () => {
    interceptDerivedMetrics();
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').click();
    cy.wait('@derivedAgenticMetrics');
    cy.get('[data-testid="x-axis-mode-normalized-e2e"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P90 Normalized E2E @ 400 output tokens',
    );
    cy.get('[data-testid="chart-figure"] svg').should(
      'contain.text',
      'P90 Normalized E2E @ 400 output tokens (s)',
    );

    cy.get('[data-testid="percentile-selector"]').click();
    cy.contains('[role="option"]', 'p75').click();
    cy.get('[data-testid="chart-figure"] h2').should(
      'contain.text',
      'P75 Normalized E2E @ 400 output tokens',
    );
  });

  it('switches back to Interactivity', () => {
    cy.get('[data-testid="x-axis-mode-interactivity"]').click();
    cy.get('[data-testid="x-axis-mode-interactivity"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.get('[data-testid="chart-figure"] h2').should('contain.text', 'Interactivity');
  });
});
