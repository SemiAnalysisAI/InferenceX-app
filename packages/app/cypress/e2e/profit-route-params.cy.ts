import { interceptOpenRouterPricing } from '../support/profit-estimator';
import { interceptProfitData } from '../support/profit-fixtures';

function suppressNudges(win: Cypress.AUTWindow): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.localStorage.setItem('inferencex-reproducibility-nudge-dismissed', '1');
}

describe('Profit estimator route parameters', { testIsolation: true }, () => {
  beforeEach(() => {
    interceptProfitData();
    interceptOpenRouterPricing({ data: [] });
  });

  for (const [prefix, tab] of [
    ['', 'profit-estimator'],
    ['/zh', 'profit-estimator-per-gigawatt'],
  ] as const) {
    const roofline = prefix ? '理论上限' : 'Theoretical Roofline';
    const actual = prefix ? '实测' : 'Actual';
    it(`defaults to roofline and preserves explicit Actual in ${prefix}/${tab}`, () => {
      const base = `${prefix}/infx/${tab}/deepseek-v4`;
      cy.visit(base, { onBeforeLoad: suppressNudges });
      cy.get('[data-testid="profit-estimator-chart"]').should('exist');
      cy.get('[data-testid="profit-cache-hit-selector"]').should('contain.text', roofline).click();
      cy.contains('[role="option"]', new RegExp(`^${actual}$`, 'u')).click();
      cy.location('pathname').should('eq', `${base}/cache-hit-mode/actual`);
      cy.reload();
      cy.get('[data-testid="profit-cache-hit-selector"]').should('contain.text', actual).click();
      cy.contains('[role="option"]', roofline).click();
      cy.location('pathname').should('eq', base);
      cy.reload();
      cy.get('[data-testid="profit-cache-hit-selector"]').should('contain.text', roofline);
    });

    it(`hydrates, edits, reloads and resets ${prefix}/${tab} route state`, () => {
      const base = `${prefix}/infx/${tab}/deepseek-v4`;
      cy.visit(`${base}/target/24/percentile/p75/cache-hit-mode/theoretical`, {
        onBeforeLoad: suppressNudges,
      });
      cy.get('[data-testid="profit-estimator-chart"]').should('exist');
      cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
      cy.get('label[for="profit-target"]').should('contain.text', 'P90');
      cy.location('pathname').should('eq', `${base}/target/24/cache-hit-mode/theoretical`);
      cy.get('[data-testid="profit-cache-hit-selector"]').should('contain.text', roofline);
      cy.document().then((doc) => {
        doc.documentElement.dataset.routeSentinel = 'same-document';
      });
      cy.get('[data-testid="profit-target-input"]').clear().type('28').blur();
      cy.location('pathname').should('eq', `${base}/target/28/cache-hit-mode/theoretical`);
      cy.location('search').should('eq', '');
      const translated = `${prefix ? '' : '/zh'}/infx/${tab}/deepseek-v4/target/28/cache-hit-mode/theoretical`;
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
      cy.location('pathname').should(
        'eq',
        `${prefix}/infx/${tab}/kimi-k3/cache-hit-mode/theoretical`,
      );
    });
  }

  it('migrates legacy queries without reviving the previous target on soft navigation', () => {
    cy.visit('/infx/profit-estimator/deepseek-v4?c_ivtarget=24&i_pctl=p75', {
      onBeforeLoad: suppressNudges,
    });
    cy.get('[data-testid="profit-estimator-chart"]').should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
    cy.location('pathname').should('eq', '/infx/profit-estimator/deepseek-v4/target/24');
    cy.get('label[for="profit-target"]').should('contain.text', 'P90');
    cy.location('search').should('eq', '');
    cy.get('a[href="/infx/profit-estimator"]').filter(':visible').first().click();
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.location('pathname').should('not.include', '/target/24');
  });

  for (const prefix of ['', '/zh']) {
    it(`switches basis in ${prefix || '/'} between both URLs, keeping the model and route state`, () => {
      const route = 'deepseek-v4/target/24/cache-hit-mode/actual';
      const gpuHour = `${prefix}/infx/profit-estimator/${route}`;
      const perGw = `${prefix}/infx/profit-estimator-per-gigawatt/${route}`;
      const perGwTitle = prefix ? '每吉瓦' : 'per gigawatt';
      cy.visit(`${gpuHour}?utm_source=test`, { onBeforeLoad: suppressNudges });
      cy.get('[data-testid="profit-estimator-chart"]').should('exist');
      cy.get('[data-testid="profit-basis-chip-hour"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="profit-controls"] h1').should('not.contain.text', perGwTitle);
      cy.get('[data-testid="profit-controls"]').should(
        'contain.text',
        prefix
          ? '按每 GPU 小时、每部署兆瓦或每吉瓦年估算'
          : 'per GPU-hour, per deployed megawatt or per gigawatt-year',
      );
      cy.get('[data-testid="profit-basis-gw-year"]').click();
      cy.location('pathname').should('eq', perGw);
      cy.location('search').should('eq', '?utm_source=test');
      cy.get('[data-testid="profit-basis-gw-year"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="profit-controls"] h1').should('contain.text', perGwTitle);
      cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
      cy.get('[data-testid="profit-cache-hit-selector"]').should(
        'contain.text',
        prefix ? '实测' : 'Actual',
      );
      cy.get('[data-testid="tab-trigger-profit-estimator"]').should(
        'have.attr',
        'data-tab-active',
        'true',
      );
      cy.go('back');
      cy.location('pathname').should('eq', gpuHour);
      cy.get('[data-testid="profit-basis-chip-hour"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="profit-controls"] h1').should('not.contain.text', perGwTitle);
      cy.go('forward');
      cy.location('pathname').should('eq', perGw);
      cy.get('[data-testid="profit-basis-gw-year"]').should('have.attr', 'aria-pressed', 'true');
    });

    it(`opens the per-megawatt basis in ${prefix || '/'} from either neighbour, keeping route state`, () => {
      const route = 'deepseek-v4/target/24/cache-hit-mode/actual';
      const perMw = `${prefix}/infx/profit-estimator-per-megawatt/${route}`;
      const perMwTitle = prefix ? '每兆瓦' : 'per megawatt';
      cy.visit(`${prefix}/infx/profit-estimator/${route}?utm_source=test`, {
        onBeforeLoad: suppressNudges,
      });
      cy.get('[data-testid="profit-estimator-chart"]').should('exist');
      cy.get('[data-testid="profit-controls"] h1').should('not.contain.text', perMwTitle);
      cy.get('[data-testid="profit-basis-mw-hour"]').click();
      cy.location('pathname').should('eq', perMw);
      cy.location('search').should('eq', '?utm_source=test');
      cy.get('[data-testid="profit-basis-mw-hour"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('[data-testid="profit-basis-chip-hour"]').should('have.attr', 'aria-pressed', 'false');
      cy.get('[data-testid="profit-controls"] h1').should('contain.text', perMwTitle);
      cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
      cy.get('[data-testid="profit-estimator-chart"]').should(
        'contain.text',
        prefix ? '兆瓦每小时' : 'MW per hour',
      );
      cy.get('[data-testid="tab-trigger-profit-estimator"]').should(
        'have.attr',
        'data-tab-active',
        'true',
      );
      cy.get('[data-testid="profit-basis-gw-year"]').click();
      cy.location('pathname').should('eq', `${prefix}/infx/profit-estimator-per-gigawatt/${route}`);
      cy.get('[data-testid="profit-basis-mw-hour"]').click();
      cy.location('pathname').should('eq', perMw);
      cy.get('[data-testid="profit-basis-mw-hour"]').should('have.attr', 'aria-pressed', 'true');
    });
  }

  it('keeps P90 pinned even with the feature gate unlocked and a bare-page percentile query', () => {
    cy.visit('/infx/profit-estimator?i_pctl=p75&percentile=p50&c_ivtarget=24', {
      onBeforeLoad(win) {
        suppressNudges(win);
        win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
      },
    });
    cy.get('[data-testid="profit-estimator-chart"]').should('exist');
    cy.get('label[for="profit-target"]').should('contain.text', 'P90');
    cy.location('search').should('eq', '');
    cy.location('pathname').should('eq', '/infx/profit-estimator/kimi-k3/target/24');
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .should((value) => {
        expect(new URL(String(value)).pathname).to.equal(
          '/infx/profit-estimator/kimi-k3/target/24',
        );
        expect(new URL(String(value)).search).to.equal('');
      });
  });

  it('filters the chart by precision and keeps the choice in the route', () => {
    const base = '/infx/profit-estimator/deepseek-v4/target/24';
    cy.visit(base, { onBeforeLoad: suppressNudges });
    cy.get('[data-testid="profit-estimator-chart"]').should('contain.text', 'H200');
    cy.get('[data-testid="profit-precision-selector"]').should('contain.text', 'FP8').click();
    cy.contains('[role="option"]', /^FP8$/u).click();
    cy.get('body').type('{esc}');
    cy.get('[data-testid="profit-estimator-chart"]').should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-estimator-chart"]').should('contain.text', 'B200');
    cy.location('pathname').should('eq', `${base}/precision/fp4`);
    cy.reload();
    cy.get('[data-testid="profit-precision-selector"]').should('not.contain.text', 'FP8');
    cy.get('[data-testid="profit-estimator-chart"]').should('not.contain.text', 'H200');
  });
});
