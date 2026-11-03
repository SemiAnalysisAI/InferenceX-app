import { videoPoints } from '../../src/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '../../src/components/video-benchmark/results';
import { readOnlyVideoRequests, resultHistory } from '../support/video-results';

describe('VideoGenX results routes', () => {
  beforeEach(() => {
    readOnlyVideoRequests();
    resultHistory().then((page) => {
      cy.intercept('GET', '/api/video-runs?format=history&page=1', {
        body: page,
        headers: { 'X-VideoGenX-Replay': '1' },
      }).as('history');
    });
  });

  it('keeps the shared fixture projection across reload and language changes', () => {
    const search = 'r_hidden=b200&r_tier=r';
    resultHistory().then((page) => {
      const projection = resultProjection(videoPoints([page]), parseResultsState(search));
      const h200 = projection.cells.find((cell) => cell.point.hardwareKey === 'h200');
      expect(h200, 'H200 remains admitted').not.to.equal(undefined);
      expect(projection.cells.map((cell) => cell.point.hardwareKey).sort()).to.deep.equal([
        'h100',
        'h200',
      ]);
      cy.visit(`/video?${search}`);
      cy.get(
        '[data-testid="results-cost-table"] [data-hardware="h200"][data-basis="participating"]',
      )
        .find('td[data-value]')
        .first()
        .invoke('attr', 'data-value')
        .then((value) => {
          expect(
            Number(value),
            'UI matches the shared projection for the intercepted fixture',
          ).to.equal(h200!.cost.participating!.perVideo);
        });
    });
    cy.get('[data-testid="results-hardware-b200"]').should('not.be.checked');
    cy.reload();
    cy.get('[data-testid="results-hardware-b200"]').should('not.be.checked');
    cy.location('search').then((sharedSearch) => cy.visit(`/zh/video${sharedSearch}`));
    cy.get('[data-testid="results-hardware-b200"]').should('not.be.checked');
    cy.get('#cost h2').should('contain', '成本');
    cy.get('[data-testid="results-hardware-b200"]').check();
    cy.get('[data-testid="results-cost-table"] [data-hardware="b200"]').should('exist');
    cy.location('search').should('not.contain', 'r_hidden=');
  });

  it('preserves the selected published overlay through filtering and dismisses it explicitly', () => {
    cy.visit('/video?unofficialrun=34342452354');
    cy.get('[data-testid="results-overlay"]').should('contain', '34342452354');
    cy.get('[data-testid="results-overlay-dismiss"]').should('be.visible');
    cy.get('[data-testid="results-cost-table"] [data-hardware="h200"]').should('exist');
    cy.get('[data-testid="results-hardware-h200"]').uncheck();
    cy.get('[data-testid="results-cost-table"] [data-hardware="h200"]').should('not.exist');
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('unofficialruns')).to.equal('34342452354');
      expect(params.has('unofficialrun')).to.equal(false);
    });
    cy.get('[data-testid="results-hardware-h200"]').check();
    cy.get('[data-testid="results-cost-table"] [data-hardware="h200"]').should('exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.has('unofficialrun')).to.equal(false);
      expect(params.has('unofficialruns')).to.equal(false);
    });
    cy.get('[data-testid="results-cost-table"] [data-hardware="h200"]').should('exist');
  });
});
