// Jalapeño is quoted at $1.27/GPU/hr, below the $1.47 modelled hyperscaler
// owning cost in HW_REGISTRY. The tokens-per-$ hyperscaler metrics show both
// economics as two curves; every other metric shows only the modelled one.
//
// The API is stubbed empty on purpose: Jalapeño rows are supplemental and
// injected client-side, so this keeps the spec independent of Neon.
const QUERY = 'g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4';

const MODELLED = 'Jalapeño (Teacup)';
const QUOTED = 'Jalapeño (Teacup, $1.27/hr)';

describe('fixed-rate TCO variant curve', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/v1/availability*', { body: [] });
    cy.intercept('GET', '**/api/v1/benchmarks/history*', { body: [] });
    cy.intercept('GET', '**/api/v1/benchmarks?*', { body: [] });
  });

  it('renders both Jalapeño curves on total tokens per $1 TCO (hyperscaler)', () => {
    cy.visit(`/inference?${QUERY}&i_metric=y_tokensPerDollarH`);

    cy.contains(MODELLED, { timeout: 20000 }).should('be.visible');
    cy.contains(QUOTED).should('be.visible');
  });

  it('renders both curves on the input and output tokens-per-$ variants', () => {
    for (const metric of ['y_outputTokensPerDollarH', 'y_inputTokensPerDollarH']) {
      cy.visit(`/inference?${QUERY}&i_metric=${metric}`);
      cy.contains(MODELLED, { timeout: 20000 }).should('be.visible');
      cy.contains(QUOTED).should('be.visible');
    }
  });

  it('stays off every metric the quoted rate does not re-price', () => {
    // Throughput (no cost term), the retail tier, and $/M tok all keep a
    // single Jalapeño curve.
    for (const metric of ['y_tpPerGpu', 'y_tokensPerDollarR', 'y_costh', 'y_costr']) {
      cy.visit(`/inference?${QUERY}&i_metric=${metric}`);
      cy.contains(MODELLED, { timeout: 20000 }).should('be.visible');
      cy.contains(QUOTED).should('not.exist');
    }
  });

  it('keeps the official-preview notice, which covers both curves', () => {
    cy.visit(`/inference?${QUERY}&i_metric=y_tokensPerDollarH`);
    cy.get('[data-testid="jalapeno-official-preview-notice"]', { timeout: 20000 }).should(
      'be.visible',
    );
  });

  it('renders both curves identically on the Chinese page', () => {
    cy.visit(`/zh/inference?${QUERY}&i_metric=y_tokensPerDollarH`);

    // The label is a chip name, a framework name and a USD rate — all of which
    // stay English on /zh — so it is byte-identical to the English legend.
    cy.contains(MODELLED, { timeout: 20000 }).should('be.visible');
    cy.contains(QUOTED).should('be.visible');
  });
});
