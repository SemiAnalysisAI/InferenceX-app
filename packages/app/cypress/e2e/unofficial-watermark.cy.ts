describe('Unofficial-run watermark', () => {
  before(() => {
    cy.fixture('api/benchmarks.json').then((benchmarks) => {
      const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26312107787';
      cy.intercept('GET', '/api/unofficial-run*', {
        body: {
          runInfos: [
            {
              id: 26312107787,
              name: 'Unofficial watermark fixture',
              branch: 'test/unofficial-watermark',
              sha: 'abc123',
              createdAt: '2026-06-25T00:00:00Z',
              url: runUrl,
              conclusion: 'success',
              status: 'completed',
              isNonMainBranch: true,
            },
          ],
          benchmarks: benchmarks.map((row: Record<string, unknown>) => ({
            ...row,
            run_url: runUrl,
          })),
          evaluations: [],
        },
      });
      cy.intercept('GET', '/api/v1/availability*', { body: [] });
      cy.intercept('GET', '/api/v1/benchmarks*', { body: [] });

      cy.visit(
        '/inference?g_model=DeepSeek-R1-0528&i_seq=1k%2F1k&i_prec=fp4%2Cfp8&unofficialrun=26312107787',
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );
    });
  });

  it('shows the full two-line warning on unofficial charts', () => {
    cy.get('[data-testid="inference-chart-display"] svg pattern[id^="unofficial-pattern-"] text')
      .should('have.length.greaterThan', 0)
      .first()
      .find('tspan')
      .should('have.length', 2)
      .then(($lines) => {
        expect([...$lines].map((line) => line.textContent)).to.deep.equal([
          'UNOFFICIAL RESULTS, DO NOT TRUST',
          'May contain hacks, or not fully passing evals',
        ]);
      });

    cy.get('[data-testid="inference-chart-display"] .unofficial-watermark-image')
      .should('have.length.greaterThan', 0)
      .each(($image) => {
        cy.wrap($image).should('have.attr', 'href', '/decorative/kanye-west.png');
        cy.wrap($image).parent('svg').find('.unofficial-watermark-image').should('have.length', 1);
      });

    cy.get('[data-testid="scatter-graph"]').first().scrollIntoView();
    cy.screenshot('unofficial-watermark', { capture: 'viewport' });

    cy.get('button[aria-label="Dismiss test/unofficial-watermark"]').click();
    cy.get('[data-testid="inference-chart-display"] .unofficial-watermark-image').should(
      'not.exist',
    );
  });
});
