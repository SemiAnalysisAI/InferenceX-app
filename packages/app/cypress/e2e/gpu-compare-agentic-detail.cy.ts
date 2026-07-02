describe('GPU comparison agentic point detail', () => {
  it('exposes the per-point charts as a normal browser link', () => {
    cy.intercept('GET', '/api/v1/trace-availability*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
      if (ids.length < 20) request.alias = 'gpuTraceAvailability';
      request.continue();
    });

    cy.visit('/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });

    cy.get('[data-testid="gpu-multiselect"] [role="combobox"]').click({ force: true });
    cy.get('[role="option"]').first().click();
    cy.contains('button', 'Select date range').click();
    cy.get('body').then(($body) => {
      if ($body.text().includes('View anyway')) {
        cy.contains('button', 'View anyway').click();
      } else {
        cy.contains('button', 'Max Range').click();
        cy.contains('button', 'Apply').click();
      }
    });

    cy.get('[data-testid="gpu-graph"]').first().should('be.visible');
    cy.wait('@gpuTraceAvailability');
    cy.wait(100);
    cy.get('[data-testid="gpu-graph"]')
      .first()
      .find('svg .dot-group')
      .should('have.length.greaterThan', 0)
      .first()
      .then(($point) => {
        const point = $point[0] as unknown as SVGElement & {
          __data__: { benchmark_type?: string; id?: number };
        };
        expect(point.__data__.benchmark_type).to.equal('agentic_traces');
        expect(point.__data__.id).to.be.a('number');
        cy.wrap($point).find('.visible-shape').click({ force: true });
      });

    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get('[data-chart-tooltip]:visible [data-action="view-charts"]')
      .should('be.visible')
      .then(($link) => {
        expect($link).to.match('a');
        expect($link).not.to.have.attr('target');
        expect($link.attr('href')).to.match(/^\/inference\/agentic\/\d+$/u);
      });
    cy.location('pathname').should('eq', '/inference');
  });
});
