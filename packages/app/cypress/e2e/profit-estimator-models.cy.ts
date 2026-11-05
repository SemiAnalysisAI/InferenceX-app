import {
  chart,
  openFormulaNotes,
  revenueLabels,
  stubOpenRouter,
  suppressNudges,
} from '../support/profit-estimator';
import { profitBenchmarkRows } from '../support/profit-fixtures';

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
  for (const [slug, label, dbKey, previousTarget, target, previousBars] of [
    ['kimi-k3', 'Kimi K3', 'kimik3', 45, 60, 1],
    ['glm-5-3', 'GLM5.2/GLM5.3', 'glm5.2', 100, 135, 1],
    ['minimax-m3', 'MiniMax M3', 'minimaxm3', 83, 115, 1],
    ['deepseek-v4', 'DeepSeek V4 Pro', 'dsv4', 35, 170, 2],
    ['deepseek-v41-flash', 'DeepSeek V4.1 Flash', 'dsv41flash', 125, 150, 1],
  ] as const) {
    for (const basis of ['profit-estimator', 'profit-estimator-per-gigawatt'] as const) {
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
  }
});

describe('Profit Estimator per GW — per-model route', () => {
  for (const prefix of ['', '/zh']) {
    it(`keeps the Kimi K3 whitepaper's historical target at 45 (${prefix || 'English'})`, () => {
      stubOpenRouter();
      const path = `${prefix}/profit-estimator-per-gigawatt/kimi-k3/target/45`;
      cy.visit(`${prefix}/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3`, {
        onBeforeLoad: suppressNudges,
      });
      cy.get('[data-testid="whitepaper-estimator-link"]').should('have.attr', 'href', path).click();
      cy.location('pathname').should('eq', path);
      cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    });
  }

  it('serves /profit-estimator-per-gigawatt/kimi-k3 and 308s aliases to the canonical slug', () => {
    stubOpenRouter();
    cy.visit('/profit-estimator-per-gigawatt/kimi-k3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'Kimi K3');
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');

    cy.request({ url: '/profit-estimator-per-gigawatt/Kimi-K3', followRedirect: false }).then(
      (response) => {
        expect(response.status).to.eq(308);
        expect(response.headers.location).to.match(/\/profit-estimator-per-gigawatt\/kimi-k3$/u);
      },
    );
  });

  it('404s models the estimator does not serve yet', () => {
    cy.request({ url: '/profit-estimator-per-gigawatt/deepseek-r1', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
    cy.request({ url: '/profit-estimator-per-gigawatt/not-a-model', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  for (const prefix of ['', '/zh']) {
    it(`keeps AgentX estimates when an old 8k/1k query opens ${prefix || 'English'} profit`, () => {
      stubOpenRouter();
      const route = `${prefix}/profit-estimator-per-gigawatt/kimi-k3`;
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
        url: `${prefix}/profit-estimator-per-gigawatt/qwen-3-5`,
        failOnStatusCode: false,
      })
        .its('status')
        .should('eq', 404);
    });
  }
});

describe('Profit Estimator — GLM 5.2/5.3', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('opens /profit-estimator/glm-5-3 on 135 tok/s/user and the Z.ai list price', () => {
    cy.visit('/profit-estimator/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/glm-5-3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '20%');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'GLM5.2/GLM5.3 744B Agentic Revenue & Profit Estimates per Chip per Hour at P90 135 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.4')
      .and('contain.text', 'Cached Input: $0.26')
      .and('contain.text', 'Output: $4.4')
      .and('contain.text', '(Z.ai list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://docs.z.ai/guides/overview/pricing')
      .and('contain.text', 'Z.ai');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'OpenRouter')
      .and('contain.text', 'Z.ai list price')
      .and('contain.text', 'Custom $/M tok');
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.15')
      .and('contain.text', 'Output: $3.5')
      .and('contain.text', '(OpenRouter)');
    cy.get('[data-testid="profit-list-price-source"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Z.ai list price').click();
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '1.4');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.26');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '4.4');
  });

  it('308s the older glm-5-2 slug to glm-5-3', () => {
    cy.request({ url: '/profit-estimator/glm-5-2', followRedirect: false }).then((res) => {
      expect(res.status).to.eq(308);
      expect(res.headers['location']).to.match(/\/profit-estimator\/glm-5-3$/);
    });
  });

  it('re-seeds the operating point and price source on a model switch', () => {
    cy.visit('/profit-estimator-per-gigawatt/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');
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
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/glm-5-3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.4')
      .and('contain.text', '(Z.ai list price)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', '输入：$1.4')
      .and('contain.text', 'Z.ai 官方定价');
    cy.get('button#profit-price-source').should('contain.text', 'Z.ai 官方定价');
  });
});

describe('Profit Estimator — MiniMax M3', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('opens /profit-estimator/minimax-m3 on 115 tok/s/user and the MiniMax list price', () => {
    cy.visit('/profit-estimator/minimax-m3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/minimax-m3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '115');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '20%');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'MiniMax M3 428B Agentic Revenue & Profit Estimates per Chip per Hour at P90 115 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', 'Cached Input: $0.06')
      .and('contain.text', 'Output: $1.2')
      .and('contain.text', '(MiniMax list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://platform.minimax.io/docs/guides/pricing-paygo')
      .and('contain.text', 'MiniMax');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'OpenRouter')
      .and('contain.text', 'MiniMax list price')
      .and('contain.text', 'Custom $/M tok');
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.23')
      .and('contain.text', 'Output: $0.96')
      .and('contain.text', '(OpenRouter)');
    cy.get('[data-testid="profit-list-price-source"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'MiniMax list price').click();
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.3');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.06');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '1.2');
  });

  it('re-seeds the operating point and price source when switching from GLM', () => {
    cy.visit('/profit-estimator-per-gigawatt/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '135');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'MiniMax M3 428B').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/minimax-m3');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'MiniMax M3')
      .and('contain.text', '115 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '115');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '20');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', '(MiniMax list price)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $3')
      .and('contain.text', '(Moonshot list price)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator-per-gigawatt/minimax-m3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '115');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', '输入：$0.3')
      .and('contain.text', 'MiniMax 官方定价');
    cy.get('button#profit-price-source').should('contain.text', 'MiniMax 官方定价');
  });
});

describe('Profit Estimator — DeepSeek V4 Pro', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('shares an explicit P90 interactivity target and reopens on it', () => {
    cy.visit('/profit-estimator/deepseek-v4', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '170');
    cy.get('[data-testid="profit-target-input"]').clear().type('24').blur();
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const shared = new URL(String(value));
        expect(shared.pathname).to.equal('/profit-estimator/deepseek-v4/target/24');
        expect(shared.search).to.equal('');
        cy.visit(`${shared.pathname}${shared.search}`, { onBeforeLoad: suppressNudges });
      });
    cy.get('[data-testid="profit-target-input"]').should('have.value', '24');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'at P90 24 tok/s/user');

    cy.get('[data-testid="profit-target-input"]').clear().type('170').blur();
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .should((value) => {
        const shared = new URL(String(value));
        expect(shared.pathname).to.equal('/profit-estimator/deepseek-v4');
        expect(shared.search).to.equal('');
      });
  });

  it('opens /profit-estimator/deepseek-v4 on 170 tok/s/user and the DeepSeek list price', () => {
    cy.visit('/profit-estimator/deepseek-v4', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/deepseek-v4');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '170');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '0');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '0%');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'DeepSeek V4 Pro 0813 1.6T Agentic Revenue & Profit Estimates per Chip per Hour at P90 170 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.32')
      .and('contain.text', 'Cached Input: $0.044')
      .and('contain.text', 'Output: $3.96')
      .and('contain.text', '(DeepSeek list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://api-docs.deepseek.com/quick_start/pricing/')
      .and('contain.text', 'DeepSeek');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'OpenRouter')
      .and('contain.text', 'DeepSeek list price')
      .and('contain.text', 'Custom $/M tok');
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.66')
      .and('contain.text', 'Output: $1.98')
      .and('contain.text', '(OpenRouter)');
    cy.get('[data-testid="profit-list-price-source"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'DeepSeek list price').click();
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '1.32');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.044');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '3.96');
  });

  it('re-seeds the operating point and price source when switching from Kimi K3', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'DeepSeek V4 Pro').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/deepseek-v4');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'DeepSeek V4 Pro')
      .and('contain.text', '170 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '170');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '0');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.32')
      .and('contain.text', '(DeepSeek list price)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $3')
      .and('contain.text', '(Moonshot list price)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator-per-gigawatt/deepseek-v4', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '170');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', '输入：$1.32')
      .and('contain.text', 'DeepSeek 官方定价');
    cy.get('button#profit-price-source').should('contain.text', 'DeepSeek 官方定价');
  });
});

describe('Profit Estimator — DeepSeek V4.1 Flash', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('opens /profit-estimator/deepseek-v41-flash on 150 tok/s/user and the DeepSeek Flash list price', () => {
    cy.visit('/profit-estimator/deepseek-v41-flash', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/deepseek-v41-flash');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '150');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '0');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '0%');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'DeepSeek V4.1 Flash 552B Agentic Revenue & Profit Estimates per Chip per Hour at P90 150 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', 'Cached Input: $0.006')
      .and('contain.text', 'Output: $1.2')
      .and('contain.text', '(DeepSeek list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://api-docs.deepseek.com/quick_start/pricing/')
      .and('contain.text', 'DeepSeek');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'OpenRouter')
      .and('contain.text', 'DeepSeek list price')
      .and('contain.text', 'Custom $/M tok');
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.15')
      .and('contain.text', 'Output: $0.6')
      .and('contain.text', '(OpenRouter)');
    cy.get('[data-testid="profit-list-price-source"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'DeepSeek list price').click();
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.3');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.006');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '1.2');
  });

  it('re-seeds the operating point and price source when switching from DeepSeek V4 Pro', () => {
    cy.visit('/profit-estimator-per-gigawatt/deepseek-v4', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '170');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '0');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'DeepSeek V4.1 Flash').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/deepseek-v41-flash');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'DeepSeek V4.1 Flash')
      .and('contain.text', '150 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '150');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '0');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', 'Output: $1.2')
      .and('contain.text', '(DeepSeek list price)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $3')
      .and('contain.text', '(Moonshot list price)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator-per-gigawatt/deepseek-v41-flash', {
      onBeforeLoad: suppressNudges,
    });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '150');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', '输入：$0.3')
      .and('contain.text', 'DeepSeek 官方定价');
    cy.get('button#profit-price-source').should('contain.text', 'DeepSeek 官方定价');
  });
});

describe('Profit Estimator (per chip-hour)', () => {
  before(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
    cy.visit('/profit-estimator', { onBeforeLoad: suppressNudges });
    chart().should('exist');
  });

  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('prices one chip-hour with the same defaults and TCO $/chip/hr as the expense', () => {
    cy.location('pathname').should('eq', '/profit-estimator');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-utilization-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'Kimi K3 2.8T Agentic Revenue & Profit Estimates per Chip per Hour at P90 60 tok/s/user Interactivity (Beta)',
    );
    cy.get('button#profit-cost').should('contain.text', 'Rent - 3 Year Commit');
    cy.get('[data-testid="result-context-cost-tier"]').should(
      'contain.text',
      'Rent - 3 Year Commit',
    );
    cy.get('[data-testid="profit-formula-notes"]').should(
      'contain.text',
      'Revenue per Chip-Hour Formula',
    );
    openFormulaNotes();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', 'TCO $/chip/hr');
    revenueLabels().should('have.length', 4);
    revenueLabels()
      .first()
      .invoke('text')
      .should('match', /^\$\d+\.\d{2}/u)
      .and('not.match', /[BMk]/u);
    chart().find('rect.bar-tco').should('have.length', 4);
    chart().should('contain.text', 'Model License Fee');
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'OpenRouter').click();
    chart().should('contain.text', 'Compute Expense').and('contain.text', 'Model License Fee');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    cy.get('[data-testid="tab-trigger-profit-estimator"]')
      .should('contain.text', 'Profit Estimator')
      .and('have.attr', 'data-tab-active');
  });

  it('serves the Kimi K3 slug, the Chinese mirror, and 404s other models', () => {
    cy.request({ url: '/profit-estimator/Kimi-K3', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.match(/\/profit-estimator\/kimi-k3$/u);
    });
    cy.request({ url: '/profit-estimator/deepseek-r1', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
    stubOpenRouter();
    cy.visit('/zh/profit-estimator', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      '每芯片每小时收入与利润估算',
    );
    cy.get('[data-testid="footer-link-calculator"]')
      .should('have.attr', 'href', '/zh/calculator')
      .and('contain.text', 'TCO 计算器');
  });
});
