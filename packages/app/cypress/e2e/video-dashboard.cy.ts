import { videoPoints } from '../../src/components/video-benchmark/points';
import { parseResultsState, resultProjection } from '../../src/components/video-benchmark/results';
import {
  assertResultsFit,
  readOnlyVideoRequests,
  resultHistory,
  RESULT_GROUPS,
} from '../support/video-results';

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
      expect(projection.cells.map((cell) => cell.point.hardwareKey)).to.deep.equal(['h200']);
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

  for (const [width, theme, path] of [
    [1440, 'light', '/video'],
    [390, 'dark', '/video'],
    [390, 'light', '/zh/video'],
  ] as const) {
    it(`renders ${path} at ${width}px in ${theme} without overflow or illustrative metrics`, () => {
      cy.viewport(width, 900);
      cy.visit(path, { onBeforeLoad: (win) => win.localStorage.setItem('theme', theme) });
      cy.get('[data-testid="video-results"] section[id]').should(($sections) => {
        expect([...$sections].map((section) => section.id)).to.deep.equal(RESULT_GROUPS);
      });
      cy.get('[data-testid="video-results-clip"]').should('have.length', 4);
      cy.get('[data-testid="video-results-clip"]').should(($tiles) => {
        const columns = new Set(
          [...$tiles].map((tile) => Math.round(tile.getBoundingClientRect().left)),
        );
        expect(columns.size, 'responsive comparison columns').to.equal(width >= 1024 ? 4 : 2);
      });
      cy.get('[data-testid="video-results-media-empty"]').should('have.length', 4);
      cy.get('[data-testid="video-results-play"]').should('be.disabled');
      cy.get('[data-testid="video-results-scrub"]').should('be.disabled');
      cy.get('#quality [data-testid="results-empty"]').should('exist');
      cy.get('#startup [data-testid="results-empty"]').should('exist');
      assertResultsFit();
      cy.screenshot(`video-results-${width}-${theme}-${path.startsWith('/zh') ? 'zh' : 'en'}`, {
        capture: 'fullPage',
        overwrite: true,
      });
      cy.get('[data-testid="video-results-clips"]').screenshot(
        `video-results-comparison-${width}-${theme}-${path.startsWith('/zh') ? 'zh' : 'en'}`,
        { overwrite: true },
      );
    });
  }
});
