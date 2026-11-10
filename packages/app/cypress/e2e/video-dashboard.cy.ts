import { videoPoints } from '../../src/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '../../src/components/video-benchmark/results';
import { readOnlyVideoRequests, resultHistory } from '../support/video-results';

const hardwarePoints = (hardware: string) =>
  cy.get(`[data-testid="video-results-chart"] .dot-group[data-hardware="${hardware}"]`);

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

  it('moves old /video links to /vgx with the query intact', () => {
    cy.visit('/zh/video?r_hidden=b200');
    cy.location().should((location) => {
      expect(location.pathname).to.eq('/zh/vgx');
      expect(location.search).to.eq('?r_hidden=b200');
    });
    cy.get('#checkbox-b200').should('not.be.checked');
  });

  it('keeps the shared fixture projection across reload, language changes and detail history', () => {
    const search =
      'r_hidden=b200&r_tier=r&r_y=videosPerGpuHour&r_gpus=999&r_x=p90&r_basis=allocated';
    resultHistory().then((page) => {
      const projection = resultProjection(videoPoints([page]), parseResultsState(search));
      const h200 = projection.cells.find((cell) => cell.point.hardwareKey === 'h200');
      expect(h200, 'H200 remains admitted').not.to.equal(undefined);
      expect(projection.cells.map((cell) => cell.point.hardwareKey).sort()).to.deep.equal([
        'h100',
        'h200',
      ]);
      cy.visit(`/vgx?${search}`);
      cy.wait('@history');
      hardwarePoints('h200').then(($points) => {
        const point = ($points[0] as unknown as { __data__: { x: number; y: number } }).__data__;
        expect(point.y, 'UI matches the shared projection for the intercepted fixture').to.equal(
          (h200!.clipsPerSecond! * 3600) / h200!.point.participating!,
        );
        expect(point.x).to.equal(h200!.point.p90);
      });
      for (const id of ['results-table', 'results-gpus', 'results-cost-basis'])
        cy.get(`[data-testid="${id}"]`).should('not.exist');
    });
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.reload();
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.location('search').then((sharedSearch) => cy.visit(`/zh/vgx${sharedSearch}`));
    cy.get('#checkbox-b200').should('not.be.checked');
    cy.get('#video-results-chart-title').should('contain', '每 GPU 小时生成视频数');
    hardwarePoints('h200').should('exist');
    cy.get('label[for="checkbox-b200"]').click();
    hardwarePoints('b200').should('exist');
    cy.location('search').should('not.contain', 'r_hidden=');
    hardwarePoints('h200').find('.visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.location('search').should('contain', 'r_point=');
    cy.go('back');
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    cy.location('search').should('not.contain', 'r_point=');
    hardwarePoints('h200').should('be.visible');
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
    hardwarePoints('h200')
      .scrollIntoView({ offset: { top: -200, left: 0 } })
      .should('be.visible');
    cy.go('forward');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
  });

  it('preserves the selected published overlay through filtering and dismisses it explicitly', () => {
    cy.visit('/vgx?unofficialrun=34342452354&other=1&r_y=videosPerGpuHour');
    cy.get('[data-testid="results-overlay"]').should('contain', '34342452354');
    cy.get('[data-testid="results-overlay-dismiss"]').should('be.visible');
    hardwarePoints('h200').should('exist');
    cy.get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"]').should('exist');
    cy.get('label[for="checkbox-h200"]').click();
    hardwarePoints('h200').should('not.exist');
    cy.get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"]').should(
      'not.exist',
    );
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('unofficialruns')).to.equal('34342452354');
      expect(params.has('unofficialrun')).to.equal(false);
    });
    cy.get('label[for="checkbox-h200"]').click();
    hardwarePoints('h200').should('exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.location('search').should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get('r_y')).to.equal('videosPerGpuHour');
      expect(params.get('other')).to.equal('1');
      expect(params.has('unofficialrun')).to.equal(false);
      expect(params.has('unofficialruns')).to.equal(false);
    });
    hardwarePoints('h200').should('have.attr', 'data-overlay', 'false');
  });
});
