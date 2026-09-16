import { readOperatorXBundle, object } from '@semianalysisai/inferencex-db/operatorx/reader';
import { makeOperatorXBundle } from '@semianalysisai/inferencex-db/operatorx/test-fixture';
const bundle = makeOperatorXBundle();
const cell = object((object(bundle.manifest).include as unknown[])[0]);
const first = object((cell.cases as unknown[])[0]);
const second = structuredClone(first);
object(object(second.shape).args).m = 512;
(cell.cases as unknown[]).push(second);
const doc = object(bundle.shards[0].docs[0]);
(doc.rows as unknown[]).push({
  op: { ...object(second.shape), backend: 'torch' },
  testlist: 'gemm',
  status: 'unsupported',
  metrics: {},
  message: 'dtype unsupported on this device',
});
const dataset = readOperatorXBundle(bundle);
function install() {
  cy.intercept('GET', '/api/v1/operatorx/runs', {
    runs: [dataset.run],
    discovery_complete: true,
  }).as('operatorxRuns');
  cy.intercept('GET', '/api/v1/operatorx/runs/123', dataset).as('operatorxRun');
}
describe('OperatorX hidden GEMM explorer', () => {
  beforeEach(install);
  it('shows per-GPU TFLOPS and failure coverage, filters results, and lives beside CollectiveX in Hidden', () => {
    cy.visit('/operatorx');
    cy.wait('@operatorxRun');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('[data-testid="operatorx-requested"]').should('have.text', '2');
    cy.get('[data-testid="operatorx-unsupported"]').should('have.text', '1');
    cy.get('[data-testid="operatorx-chart"] circle.point').should('have.length', 1);
    cy.get('select[aria-label="Status"]').select('unsupported');
    cy.get('[data-testid="operatorx-results"]')
      .should('contain.text', '512 × 1000 × 1000')
      .and('contain.text', '—');
    cy.get('[data-testid="operatorx-results"] summary').click();
    cy.get('[data-testid="operatorx-results"]').should(
      'contain.text',
      'dtype unsupported on this device',
    );
    cy.window().then((win) => {
      for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key }));
      }
    });
    cy.contains('button', 'Hidden').click();
    cy.get('[data-slot="popover-content"]').within(() => {
      cy.contains('a', 'OperatorX').should('have.attr', 'href', '/operatorx');
      cy.contains('a', 'CollectiveX').should('have.attr', 'href', '/collectivex');
    });
  });
  it('renders translated controls and the same measured value on mobile', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/operatorx?run=123');
    cy.wait('@operatorxRun');
    cy.get('[data-testid="operatorx-peak"]').should('contain.text', '2.00 TFLOPS / GPU');
    cy.get('select[aria-label="状态"]').should('have.value', 'ok');
    cy.get('select[aria-label="指标"]').select('latency');
    cy.get('[data-testid="operatorx-chart"]').should('contain.text', '延迟（µs）');
  });
});
