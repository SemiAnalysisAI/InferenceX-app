const JALAPENO_QUERY =
  'g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerGpu';
const JALAPENO_NOTICE = '[data-testid="jalapeno-official-preview-notice"]';
const VERA_RUBIN_NOTICE = '[data-testid="vera-rubin-official-preview-notice"]';

describe('official preview notices', () => {
  beforeEach(() => {
    // Keep this spec independent of Neon response time. The client appends the
    // supplemental Jalapeño and July Rubin snapshots to these successful empty
    // responses, which is exactly the path under test here.
    cy.intercept('GET', '**/api/v1/availability*', { body: [] });
    cy.intercept('GET', '**/api/v1/benchmarks/history*', { body: [] });
    cy.intercept('GET', '**/api/v1/benchmarks?*', { body: [] });
  });

  it('renders both graph notices and tracks Jalapeño legend visibility', () => {
    cy.visit(`/inference?${JALAPENO_QUERY}`);

    cy.get(JALAPENO_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview')
      .and('contain.text', 'Results may change as validation and publication continue.')
      .and('not.contain.text', '\u2014');
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Vera Rubin (July)')
      .and('not.contain.text', '\u2014');

    cy.get(
      '[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="Jalapeño"]',
    )
      .first()
      .click({ force: true });
    cy.get(JALAPENO_NOTICE).should('not.exist');
    cy.get(VERA_RUBIN_NOTICE).should('be.visible');
  });

  it('keeps the July Vera Rubin notice off metrics where its curve is unsupported', () => {
    cy.visit('/inference?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_tpPerGpu');

    cy.get(JALAPENO_NOTICE, { timeout: 20000 }).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 }).should('not.exist');
  });

  it('appears with Jalapeño calculator results', () => {
    cy.visit(`/calculator?${JALAPENO_QUERY}`);

    cy.get(JALAPENO_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview');

    cy.get('[data-testid="calculator-controls"]').within(() => {
      cy.get('#calc-cost-type').click();
    });
    cy.get('[role="option"]').contains('Output Tokens').click();
    cy.get('[data-testid="calculator-controls"] input[type="number"]')
      .first()
      .clear()
      .type('100')
      .blur();
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Vera Rubin (July) results are an official preview');
  });

  it('appears with Jalapeño historical trend lines', () => {
    cy.visit(`/historical?${JALAPENO_QUERY}`);

    // The historical view defaults to 35 tok/s/user, below Jalapeño's measured
    // range, and correctly does not extrapolate. Move into its measured range
    // so a Jalapeño trend line, and therefore the preview notice, appears.
    cy.get('[data-testid="historical-trends-display"] input[type="number"]', {
      timeout: 20000,
    })
      .clear()
      .type('100')
      .blur();
    cy.get(JALAPENO_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview');
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Vera Rubin (July) results are an official preview');
  });

  it('keeps the July Vera Rubin notice off unsupported historical metrics', () => {
    cy.visit('/historical?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_tpPerGpu');

    cy.get('[data-testid="historical-trends-display"] input[type="number"]', {
      timeout: 20000,
    })
      .clear()
      .type('100')
      .blur();
    cy.get(JALAPENO_NOTICE, { timeout: 20000 }).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE).should('not.exist');
  });

  it('shows the Vera Rubin preview when its output-token fleet curve is visible', () => {
    cy.visit('/fleet?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4');

    cy.get('[data-testid="fleet-cost-type-selector"]').click();
    cy.get('[role="option"]').contains('Output Tokens').click();
    cy.get('[data-testid="fleet-legend"]', { timeout: 20000 }).should('contain.text', 'Vera Rubin');
    cy.get('[data-testid="fleet-controls"] input[type="number"]').clear().type('100').blur();
    cy.get('[data-testid="calc-fleet-mw-input"]').type('10');
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Vera Rubin (July) results are an official preview')
      .and('not.contain.text', '\u2014');
  });

  it('uses the Chinese disclaimer on /zh and stays absent without Jalapeño results', () => {
    cy.visit(`/zh/inference?${JALAPENO_QUERY}`);
    cy.get(JALAPENO_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX 官方预览')
      .and('contain.text', '随着验证和发布工作的推进，结果可能会调整。');
    cy.get(VERA_RUBIN_NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'Vera Rubin (July)')
      .and('contain.text', '随着验证和发布工作的推进，结果可能会调整。')
      .and('not.contain.text', '\u2014');

    cy.visit(
      '/zh/inference?g_model=DeepSeek-V4-Pro&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerGpu',
    );
    cy.get(JALAPENO_NOTICE).should('not.exist');
    cy.get(VERA_RUBIN_NOTICE).should('not.exist');
  });
});
