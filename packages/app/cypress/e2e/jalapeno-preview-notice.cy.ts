const JALAPENO_QUERY =
  'g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerGpu';
const NOTICE = '[data-testid="jalapeno-official-preview-notice"]';

describe('Jalapeño official preview notice', () => {
  it('tracks whether the Jalapeño series is visible on the inference chart', () => {
    cy.visit(`/inference?${JALAPENO_QUERY}`);

    cy.get(NOTICE)
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview')
      .and('contain.text', 'Results may change as validation and publication continue.');

    cy.get(
      '[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="Jalapeño"]',
    )
      .first()
      .click({ force: true });
    cy.get(NOTICE).should('not.exist');
  });

  it('appears with Jalapeño calculator results', () => {
    cy.visit(`/calculator?${JALAPENO_QUERY}`);

    cy.get(NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview');
  });

  it('appears with Jalapeño historical trend lines', () => {
    cy.visit(`/historical?${JALAPENO_QUERY}`);

    // The historical view defaults to 35 tok/s/user, below Jalapeño's measured
    // range, and correctly does not extrapolate. Move into its measured range
    // so a Jalapeño trend line—and therefore the preview notice—appears.
    cy.get('[data-testid="historical-trends-display"] input[type="number"]', {
      timeout: 20000,
    })
      .clear()
      .type('100')
      .blur();
    cy.get(NOTICE, { timeout: 20000 })
      .should('be.visible')
      .and('contain.text', 'InferenceX Official Preview');
  });

  it('uses the Chinese disclaimer on /zh and stays absent without Jalapeño results', () => {
    cy.visit(`/zh/inference?${JALAPENO_QUERY}`);
    cy.get(NOTICE)
      .should('be.visible')
      .and('contain.text', 'InferenceX 官方预览')
      .and('contain.text', '随着验证和发布工作的推进，结果可能会调整。');

    cy.visit(
      '/zh/inference?g_model=DeepSeek-V4-Pro&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerGpu',
    );
    cy.get(NOTICE).should('not.exist');
  });
});
