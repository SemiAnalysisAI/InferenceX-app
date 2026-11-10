import { chart, revenueLabels, stubOpenRouter, suppressNudges } from '../support/profit-estimator';
import { profitBenchmarkRows } from '../support/profit-fixtures';

describe('Muse Spark profit estimates', () => {
  for (const prefix of ['', '/zh']) {
    for (const basis of ['profit-estimator', 'profit-estimator-per-gigawatt']) {
      it(`prices Open benchmarks with Muse 1.3 rates on ${prefix}/${basis}`, () => {
        stubOpenRouter();
        cy.visit(`${prefix}/infx/${basis}/muse-spark-open`, { onBeforeLoad: suppressNudges });
        cy.get('[data-testid="profit-model-selector"]').should(
          'contain.text',
          'Muse Spark 1.3/Open',
        );
        cy.get('[data-testid="profit-target-input"]').should('have.value', '100');
        cy.get('[data-testid="profit-selling-prices"]')
          .should('contain.text', '$1.25')
          .and('contain.text', '$0.15')
          .and('contain.text', '$4.25');
        cy.get('[data-testid="profit-list-price-source"]').should(
          'have.attr',
          'href',
          'https://vercel.com/ai-gateway/models/muse-spark-1.3',
        );
        cy.get('[data-testid="profit-muse-provenance"]').should('contain.text', 'Open checkpoint');
        revenueLabels().should('have.length.greaterThan', 0);
      });
    }
  }
});

function coverageRows(dbKey: string, target: number) {
  return profitBenchmarkRows(dbKey).map((row) => {
    if (row.hardware === 'gb300' || row.hardware === 'h200') return row;
    const previousInteractivity = 1 / row.metrics.p90_itl;
    return {
      ...row,
      metrics: {
        ...row.metrics,
        p90_itl: 1 / (target + (previousInteractivity - 70) / 10),
      },
    };
  });
}

describe('Earlier agentic models on profit estimators', () => {
  for (const [slug, label, dbKey, previousTarget, target, previousBars, basis] of [
    ['kimi-k3', 'Kimi K3', 'kimik3', 45, 60, 1, 'profit-estimator'],
    ['deepseek-v4', 'DeepSeek V4 Pro', 'dsv4', 35, 170, 2, 'profit-estimator-per-gigawatt'],
  ] as const) {
    it(`opens ${label} on ${basis} with more measured SKUs than the former default`, () => {
      stubOpenRouter();
      cy.intercept('GET', '/api/v1/benchmarks*', { body: coverageRows(dbKey, target) });
      cy.visit(`/${basis}/${slug}`, { onBeforeLoad: suppressNudges });
      cy.get('[data-testid="profit-target-input"]').should('have.value', String(target));
      chart().find('text.revenue-label').should('have.length', 4);

      cy.get('[data-testid="profit-target-input"]').clear().type(String(previousTarget)).blur();
      chart().find('text.revenue-label').should('have.length', previousBars);
    });
  }
});

describe('Profit Estimator per GW — per-model route', () => {
  it("keeps the Kimi K3 whitepaper's historical target at 45 (English)", () => {
    stubOpenRouter();
    const path = '/infx/profit-estimator-per-gigawatt/kimi-k3/target/45';
    cy.visit('/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3', {
      onBeforeLoad: suppressNudges,
    });
    cy.get('[data-testid="whitepaper-estimator-link"]').should('have.attr', 'href', path).click();
    cy.location('pathname').should('eq', path);
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
  });

  it('serves /infx/profit-estimator-per-gigawatt/kimi-k3 and 308s aliases to the canonical slug', () => {
    stubOpenRouter();
    cy.visit('/infx/profit-estimator-per-gigawatt/kimi-k3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'Kimi K3');
    cy.location('pathname').should('eq', '/infx/profit-estimator-per-gigawatt/kimi-k3');

    cy.request({ url: '/infx/profit-estimator-per-gigawatt/Kimi-K3', followRedirect: false }).then(
      (response) => {
        expect(response.status).to.eq(308);
        expect(response.headers.location).to.match(
          /\/infx\/profit-estimator-per-gigawatt\/kimi-k3$/u,
        );
      },
    );
  });

  it('404s models the estimator does not serve yet', () => {
    cy.request({ url: '/infx/profit-estimator-per-gigawatt/deepseek-r1', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
    cy.request({ url: '/infx/profit-estimator-per-gigawatt/not-a-model', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('keeps AgentX estimates when an old 8k/1k query opens English profit', () => {
    stubOpenRouter();
    const route = '/infx/profit-estimator-per-gigawatt/kimi-k3';
    cy.visit(route, { onBeforeLoad: suppressNudges });
    revenueLabels().should('have.length.greaterThan', 0);
    revenueLabels().then(($labels) => {
      const expected = [...$labels].map((label) => label.textContent);
      cy.visit(`${route}?i_seq=8k%2F1k&c_profit_target=222`, {
        onBeforeLoad: suppressNudges,
      });
      cy.get('[data-testid="profit-model-selector"]').should('contain.text', 'Kimi K3');
      cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
      revenueLabels().should(($current) => {
        expect([...$current].map((label) => label.textContent)).to.deep.equal(expected);
      });
      cy.get('[data-testid="share-button"]').click();
      cy.get('[data-testid="share-url-input"]')
        .invoke('val')
        .should((value) => {
          const shared = new URL(String(value));
          expect(shared.pathname).to.equal(route);
          expect(shared.search).to.equal('');
        });
      cy.get('body').type('{esc}');
      cy.get('[data-testid="profit-scenario-selector"]').should('not.exist');
      cy.get('[data-testid="profit-fixed-workload-note"]').should('not.exist');
    });
    cy.request({
      url: '/infx/profit-estimator-per-gigawatt/qwen-3-5',
      failOnStatusCode: false,
    })
      .its('status')
      .should('eq', 404);
  });
});

describe('Profit Estimator — GLM 5.2/5.3', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('308s the older glm-5-2 slug to glm-5-3', () => {
    cy.request({ url: '/infx/profit-estimator/glm-5-2', followRedirect: false }).then((res) => {
      expect(res.status).to.eq(308);
      expect(res.headers['location']).to.match(/\/infx\/profit-estimator\/glm-5-3$/);
    });
  });

  it('re-seeds the operating point and price source on a model switch', () => {
    cy.visit('/infx/profit-estimator-per-gigawatt/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/infx/profit-estimator-per-gigawatt/kimi-k3');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'Kimi K3')
      .and('contain.text', '60 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $3')
      .and('contain.text', '(Moonshot list price)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'GLM5.2/GLM5.3').click();
    cy.location('pathname').should('eq', '/infx/profit-estimator-per-gigawatt/glm-5-3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.4')
      .and('contain.text', '(Z.ai list price)');
  });
});
