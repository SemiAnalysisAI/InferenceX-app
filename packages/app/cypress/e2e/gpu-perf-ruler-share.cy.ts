import { selectXAxisMode, unlockAgenticGate } from '../support/e2e';
import { SINGLE_TURN_DATE, singleTurnRows } from '../support/overlay-fixtures';

const graph = '[data-testid="gpu-graph"]';
const ratio = `${graph} .perf-ruler .pr-text-ratio`;
const shareInput = '[data-testid="share-url-input"]';
const metric = 'y_measuredJPerOutputToken';
const rows = ['h200', 'b200'].flatMap((hardware, hardwareIndex) =>
  singleTurnRows(null, { hardware })
    .slice(0, 2)
    .map((row, index) => ({
      ...row,
      metrics: {
        ...row.metrics,
        median_intvty: [50, 100][index],
        median_itl: 1 / [50, 100][index],
        median_ttft: [1, 2][index],
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: [400, 300][index],
        joules_per_output_token: [400, 600][index] * (hardwareIndex + 1),
      },
    })),
);

function placeRuler() {
  cy.get(`${graph} .perf-ruler-hit`).should('have.length', 2);
  cy.get(`${graph} .perf-ruler-hit`).eq(0).click({ force: true });
  cy.get(`${graph} .perf-ruler-hit`).eq(1).click({ force: true });
  cy.get(ratio).should('have.text', '2.00x');
}

describe('Native GPU comparison ruler sharing', () => {
  it('round trips a placed ruler through the page Share and removes it after an axis change', () => {
    cy.viewport(1440, 900);
    cy.intercept('GET', '/api/v1/availability', { body: rows });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: rows, delay: 200 }).as('rulerRows');
    cy.intercept('GET', '/api/v1/workflow-info*', {
      body: { runs: [], changelogs: [], configs: [] },
    });
    cy.visit(
      `/inference?g_model=DeepSeek-V4-Pro&i_seq=1k%2F1k&i_prec=fp4&i_optimal=0&i_best=0&i_scale=linear&i_metric=${metric}&i_xmode=interactivity&i_gpus=h200_sglang,b200_sglang&i_dates=${SINGLE_TURN_DATE}`,
      { onBeforeLoad: unlockAgenticGate },
    );
    cy.wait('@rulerRows');
    cy.get(graph).should('have.length', 1).and('be.visible');
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').click({ force: true });
    placeRuler();

    cy.get('[data-testid="share-button"]').click();
    cy.get(shareInput)
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.searchParams.get('i_gpus')).to.equal('h200_sglang,b200_sglang');
        expect(url.searchParams.get('i_dates')).to.equal(SINGLE_TURN_DATE);
        const saved = JSON.parse(url.searchParams.get('i_rulers') ?? '{}');
        expect(saved.axis).to.equal(`median_intvty\u0000${metric}`);
        expect(saved.rulers).to.have.length(1);
        expect(saved.rulers[0][2]).to.be.within(50, 100);
        cy.visit(url.pathname + url.search, {
          onBeforeLoad: unlockAgenticGate,
        });
      });
    cy.wait('@rulerRows');
    cy.get(graph).should('have.length', 1);
    cy.get(ratio).should('have.text', '2.00x');
    cy.get('[data-testid="share-button"]').click();
    cy.get(shareInput)
      .invoke('val')
      .should((value) => {
        expect(
          JSON.parse(new URL(String(value)).searchParams.get('i_rulers') ?? '{}').rulers,
        ).to.have.length(1);
      });
    cy.get('body').type('{esc}');

    selectXAxisMode('ttft');
    cy.get(`${graph} .perf-ruler`).should('not.exist');
    cy.get('[data-testid="share-button"]').click();
    cy.get(shareInput)
      .invoke('val')
      .should((value) => {
        const url = new URL(String(value));
        expect(url.searchParams.get('i_xmode')).to.equal('ttft');
        expect(url.searchParams.has('i_rulers')).to.equal(false);
      });
  });
});
