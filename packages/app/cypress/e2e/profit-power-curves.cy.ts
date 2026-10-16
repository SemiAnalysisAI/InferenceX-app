import {
  interceptProfitData,
  profitBenchmarkRows,
  PROFIT_DATE,
  PROFIT_HISTORY_DATE,
} from '../support/profit-fixtures';

// Invalid MI355X knots dominate the valid curve in the performance frontier.
// Power selection must recover the remaining curve before interpolation.
function rowsFor(date = PROFIT_DATE) {
  const rows = profitBenchmarkRows('kimik3', date).map((row) => ({
    ...row,
    metrics: {
      ...row.metrics,
      power_valid: Number(
        row.hardware !== 'b300' && !(row.hardware === 'mi355x' && row.conc === 16),
      ),
      power_metric_schema_version: 2,
      avg_power_w: 500,
      avg_total_gpu_power_w: 4000,
    },
  }));
  return [
    ...rows,
    ...rows
      .filter((row) => row.hardware === 'mi355x')
      .map((row) => ({
        ...row,
        id: row.id + 100_000,
        framework: 'atom',
        metrics: { ...row.metrics, power_valid: 1 },
      })),
  ];
}

function setup() {
  interceptProfitData();
  cy.intercept('GET', 'https://openrouter.ai/api/v1/models', { data: [] });
  cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
    req.reply({
      body: rowsFor(req.query['date'] === PROFIT_HISTORY_DATE ? PROFIT_HISTORY_DATE : PROFIT_DATE),
    });
  });
}

function unlock(win: Cypress.AUTWindow) {
  win.localStorage.setItem('inferencex-feature-gate', '1');
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
}

const chart = () => cy.get('[data-testid="profit-estimator-chart"]');
const barCount = (count: number) => chart().find('text.revenue-label').should('have.length', count);

describe('Profit power-valid curves', { testIsolation: true }, () => {
  for (const locale of ['en', 'zh'] as const) {
    it(`keeps the target and pairs the selected valid curve (${locale})`, () => {
      setup();
      const width = locale === 'en' ? 1280 : 390;
      cy.viewport(width, 900);
      let csv: Blob | undefined;
      cy.visit(`${locale === 'zh' ? '/zh' : ''}/profit-estimator-per-gigawatt?c_power=modeled`, {
        onBeforeLoad: (win) => {
          unlock(win);
          win.URL.createObjectURL = (blob) => {
            if (blob instanceof win.Blob) csv = blob;
            return 'blob:profit-test';
          };
          win.HTMLAnchorElement.prototype.click = () => {};
        },
      });
      cy.get('#profit-target').should('have.value', '45');
      barCount(3);
      chart()
        .find('.x-axis')
        .should('contain', 'MI355X')
        .and('not.contain', 'H200')
        .and('not.contain', 'GB300')
        .and('not.contain', 'B300');
      cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
      cy.get('body').then(($body) => expect($body[0].scrollWidth).to.be.at.most(width));
      chart().scrollIntoView();
      cy.screenshot(`profit-valid-curves-${locale}`, { capture: 'viewport', overwrite: true });
      cy.get('#profit-power').click();
      cy.get('[role="option"]')
        .contains(locale === 'en' ? 'Compare both' : '对比两种估算方式')
        .click();
      barCount(8);
      cy.get('#profit-target').should('have.value', '45');
      cy.get('[data-testid="export-button"]').first().click();
      cy.get('[data-testid="export-csv-button"]').click();
      cy.then(() => csv!.text()).then((text) => {
        const rows = text
          .split('\n')
          .filter((line) => /^(?:B200|B300|GB300|MI355X)/.test(line))
          .map((line) => line.split(','));
        expect(rows).to.have.length(8);
        const paired = rows.filter((row) => row[0].includes('MI355X'));
        expect(paired).to.have.length(4);
        const revenue = paired.map((row) => row[9]);
        expect(new Set(revenue).size).to.equal(2);
        for (const value of new Set(revenue))
          expect(revenue.filter((r) => r === value)).to.have.length(2);
        expect(text).not.to.contain('NaN');
      });
      cy.get('#profit-power').click();
      cy.get('[role="option"]')
        .contains(locale === 'en' ? 'All in Provisioned' : '整体预配功耗')
        .click();
      barCount(5);
    });
  }

  it('uses valid curves independently for historical comparisons', () => {
    setup();
    cy.viewport(1280, 900);
    cy.visit(
      `/profit-estimator-per-gigawatt?c_power=compare&i_gpus=mi355x_vllm&i_dstart=${PROFIT_HISTORY_DATE}&i_dend=${PROFIT_HISTORY_DATE}`,
      { onBeforeLoad: unlock },
    );
    cy.get('#profit-target').should('have.value', '45');
    barCount(4);
    chart().should('contain', PROFIT_HISTORY_DATE);
    cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
  });
});
