import { videoPoints } from '../../src/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '../../src/components/video-benchmark/results';
import { readOnlyVideoRequests, resultHistory } from '../support/video-results';

const row = (hardware: string) =>
  cy.get(`[data-testid="results-table"] [data-testid="results-row"][data-hardware="${hardware}"]`);

describe('VideoGenX results routes', () => {
  beforeEach(() => {
    readOnlyVideoRequests();
    resultHistory().then((page) => {
      cy.intercept('GET', '/api/video-runs?format=history&page=1*', {
        body: page,
        headers: { 'X-VideoGenX-Replay': '1' },
      }).as('history');
    });
  });

  it('keeps the shared fixture projection across reload, language changes and detail history', () => {
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
      cy.wait('@history');
      row('h200')
        .closest('tr')
        .find('td')
        .eq(6)
        .find('[data-value]')
        .invoke('attr', 'data-value')
        .then((value) => {
          expect(
            Number(value),
            'UI matches the shared projection for the intercepted fixture',
          ).to.equal(h200!.cost.participating!.perVideo);
        });
    });
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.reload();
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.location('search').then((sharedSearch) => cy.visit(`/zh/video${sharedSearch}`));
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.get('#video-results-chart-title').should('contain', '每 1 美元 TCO 生成的视频秒数');
    row('h200').should('exist');
    cy.get('label[for="checkbox-b200"]').click();
    row('b200').should('exist');
    cy.location('search').should('not.contain', 'r_hidden=');
    row('h200').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.location('search').should('contain', 'r_point=');
    cy.go('back');
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    cy.location('search').should('not.contain', 'r_point=');
    row('h200').should('be.visible');
    cy.go('forward');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.reload();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.get('[data-testid="results-detail-back"]')
      .should(([button]) => {
        const hydrated = Object.keys(button).some((key) => key.startsWith('__reactProps'));
        expect(hydrated, 'detail Back is hydrated').to.equal(true);
      })
      .click();
    cy.location('search').should('not.contain', 'r_point=');
    row('h200').should('be.visible');
    cy.go('forward');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
  });

  it('preserves the selected published overlay through filtering and dismisses it explicitly', () => {
    cy.visit('/video?unofficialrun=34342452354&other=1&r_y=videosPerGpuHour');
    cy.get('[data-testid="results-overlay"]').should('contain', '34342452354');
    cy.get('[data-testid="results-overlay-dismiss"]').should('be.visible');
    row('h200').should('exist');
    cy.get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"]').should('exist');
    cy.get('label[for="checkbox-h200"]').click();
    row('h200').should('not.exist');
    cy.get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"]').should(
      'not.exist',
    );
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('unofficialruns')).to.equal('34342452354');
      expect(params.has('unofficialrun')).to.equal(false);
    });
    cy.get('label[for="checkbox-h200"]').click();
    row('h200').should('exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('r_y')).to.equal('videosPerGpuHour');
      expect(params.get('other')).to.equal('1');
      expect(params.has('unofficialrun')).to.equal(false);
      expect(params.has('unofficialruns')).to.equal(false);
    });
    row('h200').should('have.attr', 'data-overlay', 'false');
  });
});
