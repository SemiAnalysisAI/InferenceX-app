import { interceptPreviewSnapshots } from '../support/preview-snapshot-fixtures';

const JALAPENO_QUERY =
  'g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_outputTputPerGpu';
const JALAPENO_NOTICE = '[data-testid="jalapeno-official-preview-notice"]';
const VERA_RUBIN_NOTICE = '[data-testid="vera-rubin-official-preview-notice"]';
const TPUV7_QUERY =
  'g_model=Qwen-3.5-397B-A17B&i_seq=8k%2F1k&i_prec=fp8&i_metric=y_outputTputPerGpu';
const TPUV7_NOTICE = '[data-testid="tpuv7-official-preview-notice"]';

describe('official preview notices', () => {
  beforeEach(() => {
    interceptPreviewSnapshots();
  });

  it('renders both graph notices and tracks Jalapeño legend visibility', () => {
    cy.visit(`/inference?${JALAPENO_QUERY}`);

    cy.get(JALAPENO_NOTICE).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE).should('be.visible');

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

    cy.get(JALAPENO_NOTICE).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE).should('not.exist');
  });

  it('appears with Jalapeño calculator results', () => {
    cy.visit(`/calculator?${JALAPENO_QUERY}`);

    cy.get(JALAPENO_NOTICE).should('be.visible');

    cy.get('[data-testid="calculator-controls"]').within(() => {
      cy.get('#calc-cost-type').click();
    });
    cy.get('[role="option"]').contains('Output Tokens').click();
    cy.get('[data-testid="calculator-controls"] input[type="number"]')
      .first()
      .clear()
      .type('100')
      .blur();
    cy.get(VERA_RUBIN_NOTICE).should('be.visible');
  });

  it('appears with Jalapeño historical trend lines', () => {
    cy.visit(`/historical?${JALAPENO_QUERY}`);

    cy.get('[data-testid="historical-trends-display"] input[type="number"]')
      .clear()
      .type('100')
      .blur();
    cy.get(JALAPENO_NOTICE).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE).should('be.visible');
  });

  it('keeps the July Vera Rubin notice off unsupported historical metrics', () => {
    cy.visit('/historical?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_tpPerGpu');

    cy.get('[data-testid="historical-trends-display"] input[type="number"]')
      .clear()
      .type('100')
      .blur();
    cy.get(JALAPENO_NOTICE).should('be.visible');
    cy.get(VERA_RUBIN_NOTICE).should('not.exist');
  });

  it('shows the Vera Rubin preview when its output-token fleet curve is visible', () => {
    cy.visit('/fleet?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4');

    cy.get('[data-testid="fleet-legend"]').should('be.visible');
    cy.get('#fleet-cost-type').click();
    cy.get('[role="option"]').contains('Output Tokens').click();
    cy.get('[data-testid="fleet-legend"]').should('contain.text', 'Vera Rubin');
    cy.get('[data-testid="fleet-controls"] input[type="number"]').clear().type('100').blur();
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.get(VERA_RUBIN_NOTICE).should('be.visible');
  });

  it('renders the TPU7x graph notice on the Qwen3.5 8k/1k curve and nowhere else', () => {
    cy.visit(`/inference?${TPUV7_QUERY}`);

    cy.get(TPUV7_NOTICE).should('be.visible');
    cy.get(JALAPENO_NOTICE).should('not.exist');

    cy.visit(`/inference?${JALAPENO_QUERY}`);
    cy.get(JALAPENO_NOTICE).should('be.visible');
    cy.get(TPUV7_NOTICE).should('not.exist');
  });
});
