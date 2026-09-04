import { buildTokenLengthSketch } from '@semianalysisai/inferencex-constants';

import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import { interceptOverlayRun, OVERLAY_RUN_ID } from '../support/overlay-fixtures';

function visitAgenticChart(extraQuery = '') {
  cy.visit(`/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4${extraQuery}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      unlockAgenticGate(win);
    },
  });
}

describe('resident sequence-length footer summary', () => {
  it('summarizes every resident official point without following legend selection', () => {
    interceptOverlayRun();
    interceptDerivedAgenticMetrics();
    cy.intercept('GET', '/api/v1/resident-sequence-lengths*', (request) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
      expect(ids.length).to.be.greaterThan(1);
      request.reply({
        body: {
          isl: buildTokenLengthSketch(Array.from({ length: 12_345 }, () => 8_192)),
          osl: buildTokenLengthSketch(Array.from({ length: 12_345 }, () => 1_024)),
          coveredPoints: ids.length,
          requestedPoints: ids.length,
        },
      });
    }).as('residentSequenceLengths');

    visitAgenticChart();
    cy.wait('@residentSequenceLengths');
    cy.get('[data-testid="resident-sequence-lengths"]')
      .should('be.visible')
      .and('contain.text', 'Completed requests across all resident points (n=12,345)')
      .and('contain.text', 'ISL p50 8.2k')
      .and('contain.text', 'p95 8.2k')
      .and('contain.text', 'OSL p50 1k');

    // Legend visibility is downstream of the resident set. Hiding a series
    // must not remove the footer summary or issue a narrower stats request.
    cy.get('.sidebar-legend button').first().click({ force: true });
    cy.get('[data-testid="resident-sequence-lengths"]').should('be.visible');
    cy.get('@residentSequenceLengths.all').should('have.length', 1);
  });

  it('does not label official-only stats as covering an unofficial overlay', () => {
    let requestCount = 0;
    interceptOverlayRun();
    interceptDerivedAgenticMetrics();
    cy.intercept('GET', '/api/v1/resident-sequence-lengths*', (request) => {
      requestCount += 1;
      request.reply({ body: {} });
    });

    visitAgenticChart(`&unofficialrun=${OVERLAY_RUN_ID}`);
    cy.wait('@unofficialRun');
    cy.get('[data-testid="chart-figure"]').should('have.length.at.least', 1);
    cy.get('[data-testid="resident-sequence-lengths"]').should('not.exist');
    cy.then(() => expect(requestCount).to.equal(0));
  });
});
