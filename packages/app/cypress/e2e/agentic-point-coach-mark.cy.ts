import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
import { OVERLAY_RUN_ID, interceptOverlayRun } from '../support/overlay-fixtures';

const STORAGE_KEY = 'inferencex-agentic-point-coach-mark-dismissed';
const COACH_MARK = '[data-testid="agentic-point-coach-mark"]';
const AGENTIC_POINTS =
  '[data-testid="scatter-graph"] .dot-group[data-benchmark-type="agentic_traces"]';

function freshVisitor(win: Cypress.AUTWindow) {
  unlockAgenticGate(win);
  win.localStorage.removeItem(STORAGE_KEY);
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
  win.sessionStorage.setItem('inferencex-star-nudge-shown', '1');
  win.localStorage.setItem('inferencex-filter-hint-nudge-dismissed', '1');
}

beforeEach(() => {
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
  interceptOverlayRun();
  interceptDerivedAgenticMetrics();
  cy.intercept('GET', '/api/v1/trace-availability?ids=*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    request.reply({ body: Object.fromEntries(ids.map((id) => [id, true])) });
  });
});

describe('Agentic chart without the retired point callout', () => {
  for (const prefix of ['', '/zh']) {
    it(`keeps point details accessible without a first-visit callout on ${prefix || '/en'}`, () => {
      cy.visit(`${prefix}/inference?i_seq=agentic-traces`, { onBeforeLoad: freshVisitor });
      cy.get(AGENTIC_POINTS).should('have.length.greaterThan', 0);
      cy.get('[data-testid="scatter-graph"]').scrollIntoView();
      // Wait past the retired timer and post-render delays before asserting absence.
      cy.wait(1500);
      cy.get(COACH_MARK).should('not.exist');
      cy.window().then((win) => {
        expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(null);
      });

      cy.get(AGENTIC_POINTS).first().find('.visible-shape').click({ force: true });
      cy.get('[data-chart-tooltip]:visible')
        .should('have.length', 1)
        .find('a[href*="/inference/agentic/"]')
        .should('have.attr', 'href')
        .and('match', /\/inference\/agentic\/\d+/);
      cy.get(COACH_MARK).should('not.exist');

      cy.reload();
      cy.get(AGENTIC_POINTS).should('have.length.greaterThan', 0);
      cy.get('[data-testid="scatter-graph"]').scrollIntoView();
      cy.wait(1500);
      cy.get(COACH_MARK).should('not.exist');
    });
  }

  it('keeps unofficial overlay points clickable without a callout', () => {
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces`, {
      onBeforeLoad: freshVisitor,
    });
    cy.wait('@unofficialRun');
    cy.get('[data-testid="scatter-graph"]').scrollIntoView();
    cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt')
      .should('have.length.greaterThan', 0)
      .first()
      .click({ force: true });
    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
    cy.get(COACH_MARK).should('not.exist');
  });
});
