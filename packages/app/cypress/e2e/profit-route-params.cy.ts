import { interceptProfitData } from '../support/profit-fixtures';

function suppressNudges(win: Cypress.AUTWindow): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
}

describe('Profit estimator route parameters', { testIsolation: true }, () => {
  beforeEach(() => {
    interceptProfitData();
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', { data: [] });
  });

  for (const prefix of ['', '/zh']) {
    for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt']) {
      it(`defaults to roofline and preserves explicit Actual in ${prefix}/${tab}`, () => {
        const base = `${prefix}/${tab}/deepseek-v4`;
        cy.visit(base, { onBeforeLoad: suppressNudges });
        cy.get('[data-testid="profit-estimator-chart"]').should('exist');
        cy.get('[data-testid="profit-cache-hit-selector"]')
          .should('contain.text', 'Theroticial Roofline')
          .click();
        cy.contains('[role="option"]', /^Actual$/).click();
        cy.location('pathname').should('eq', `${base}/cache-hit-mode/actual`);
        cy.reload();
        cy.get('[data-testid="profit-cache-hit-selector"]')
          .should('contain.text', 'Actual')
          .click();
        cy.contains('[role="option"]', 'Theroticial Roofline').click();
        cy.location('pathname').should('eq', base);
        cy.reload();
        cy.get('[data-testid="profit-cache-hit-selector"]').should(
          'contain.text',
          'Theroticial Roofline',
        );
      });

      it(`hydrates, edits, reloads and resets ${prefix}/${tab} route state`, () => {
        const base = `${prefix}/${tab}/deepseek-v4`;
        cy.visit(`${base}/target/24/percentile/p75/cache-hit-mode/theoretical`, {
          onBeforeLoad: suppressNudges,
        });
        cy.get('[data-testid="profit-estimator-chart"]').should('exist');
        cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
        cy.get('label[for="profit-target"]').should('contain.text', 'P90');
        cy.get('[data-testid="profit-percentile-selector"]').should('not.exist');
        cy.location('pathname').should('eq', `${base}/target/24/cache-hit-mode/theoretical`);
        cy.get('[data-testid="profit-cache-hit-selector"]').should(
          'contain.text',
          'Theroticial Roofline',
        );
        cy.document().then((doc) => {
          doc.documentElement.dataset.routeSentinel = 'same-document';
        });
        cy.get('[data-testid="profit-target-input"]').clear().type('28').blur();
        cy.location('pathname').should('eq', `${base}/target/28/cache-hit-mode/theoretical`);
        cy.location('search').should('eq', '');
        const translated = `${prefix ? '' : '/zh'}/${tab}/deepseek-v4/target/28/cache-hit-mode/theoretical`;
        cy.get(`a[href="${translated}"]`).should('exist');
        cy.document().its('documentElement.dataset.routeSentinel').should('eq', 'same-document');
        cy.get('[data-testid="share-button"]').click();
        cy.get('[data-testid="share-url-input"]')
          .invoke('val')
          .should((value) => {
            const shared = new URL(String(value));
            expect(shared.pathname).to.equal(`${base}/target/28/cache-hit-mode/theoretical`);
            expect(shared.search).to.equal('');
          });
        cy.reload();
        cy.get('[data-testid="profit-target-input"]').should('have.value', '28');
        cy.get('[data-testid="profit-estimator-chart"]').should('exist');
        cy.get('[data-testid="profit-target-input"]').clear().type('170').blur();
        cy.location('pathname').should('eq', `${base}/cache-hit-mode/theoretical`);
        cy.get('[data-testid="profit-target-input"]').clear().type('24').blur();
        cy.get('[data-testid="profit-model-selector"]').click();
        cy.contains('[role="option"]', 'Kimi K3').click();
        cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
        cy.location('pathname').should('eq', `${prefix}/${tab}/kimi-k3/cache-hit-mode/theoretical`);
      });
    }
  }

  it('migrates legacy queries without reviving the previous target on soft navigation', () => {
    cy.visit('/profit-estimator/deepseek-v4?c_ivtarget=24&i_pctl=p75', {
      onBeforeLoad: suppressNudges,
    });
    cy.get('[data-testid="profit-estimator-chart"]').should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
    cy.location('pathname').should('eq', '/profit-estimator/deepseek-v4/target/24');
    cy.get('label[for="profit-target"]').should('contain.text', 'P90');
    cy.location('search').should('eq', '');
    cy.get('a[href="/profit-estimator-per-gigawatt"]').filter(':visible').first().click();
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.location('pathname').should('not.include', '/target/24');
  });

  it('keeps P90 pinned even with the feature gate unlocked and a bare-page percentile query', () => {
    cy.visit('/profit-estimator?i_pctl=p75&percentile=p50&c_ivtarget=24', {
      onBeforeLoad(win) {
        suppressNudges(win);
        win.localStorage.setItem('inferencex-feature-gate', '1');
      },
    });
    cy.get('[data-testid="profit-estimator-chart"]').should('exist');
    cy.get('label[for="profit-target"]').should('contain.text', 'P90');
    cy.get('[data-testid="profit-percentile-selector"]').should('not.exist');
    cy.location('search').should('eq', '');
    cy.location('pathname').should('eq', '/profit-estimator/kimi-k3/target/24');
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .should((value) => {
        expect(new URL(String(value)).pathname).to.equal('/profit-estimator/kimi-k3/target/24');
        expect(new URL(String(value)).search).to.equal('');
      });
  });
});
