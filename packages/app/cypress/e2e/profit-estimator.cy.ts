// /profit-estimator: one stacked bar per SKU, US$ per all-in GW per year.
// Behaviours worth locking down:
//  - defaults are Kimi K3, 45 tok/s/user, 60% utilization, 30% model license fee;
//  - GLM 5.2/5.3 has its own defaults, 100 tok/s/user and the Z.ai list price
//    ($1.40 / $0.26 cached / $4.40), and a model switch re-seeds both;
//  - MiniMax M3 opens on 83 tok/s/user and the MiniMax list price
//    ($0.30 / $0.06 cached / $1.20);
//  - utilization scales revenue only, so the revenue label moves and the
//    TCO segment does not;
//  - the SKU legend is the filter for which bars are drawn;
//  - a loss is drawn below the zero line as a hatched segment, not as a new colour;
//  - the OpenRouter catalog is the default price source and a custom triple
//    (input, cached input, output) can replace it;
//  - the workload is pinned to agentic traces, so there is no scenario or
//    precision selector, the model selector offers Kimi K3, GLM 5.2/5.3 and
//    MiniMax M3 only, and the target interactivity is a typed number, not a slider;
//  - the cost provider has a custom $/GPU/hr option with one input per chip;
//  - the heading reads like /inference, the subtitle names the utilization, and
//    the formula folds away under the chart;
//  - /profit-estimator/<model> is the per-model route; switching models
//    rewrites the address bar in place.

import { interceptProfitData } from '../support/profit-fixtures';

// Kimi K3 is the page default; the DeepSeek row proves the page prices the
// routed model, not the first catalog entry. The GLM and MiniMax rows sit below
// their labs' list prices, as the real aggregates do, so the spec can tell the
// two sources apart.
const OPENROUTER_MODELS = {
  data: [
    {
      id: 'moonshotai/kimi-k3',
      pricing: { prompt: '0.0000006', completion: '0.0000025', input_cache_read: '0.0000001' },
    },
    {
      id: 'z-ai/glm-5.3',
      pricing: { prompt: '0.00000115', completion: '0.0000035', input_cache_read: '0.0000002' },
    },
    {
      id: 'minimax/minimax-m3',
      pricing: { prompt: '0.00000023', completion: '0.00000096', input_cache_read: '0.00000005' },
    },
    {
      id: 'deepseek/deepseek-v4-pro-0813',
      pricing: { prompt: '0.00000066', completion: '0.00000198', input_cache_read: '0.000000022' },
    },
  ],
};

function stubOpenRouter(): void {
  interceptProfitData();
  cy.intercept('GET', 'https://openrouter.ai/api/v1/models', OPENROUTER_MODELS).as('openrouter');
}

function suppressNudges(win: Cypress.AUTWindow): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
}

const chart = () => cy.get('[data-testid="profit-estimator-chart"]');
/** The plot SVG itself, not the icon SVGs inside the export button. */
const chartSvg = () => chart().find('svg').filter(':has(.chart-root)').first();
const bars = () => chart().find('rect.bar');
// The formula fold is collapsed by default; open it (if it is not already) before
// reading the text. Tests share one page, so a previous test may have opened it.
const openFormulaNotes = () =>
  cy.get('[data-testid="profit-formula-notes"] button').then(($btn) => {
    if ($btn.attr('aria-expanded') === 'false') cy.wrap($btn).click();
  });
const revenueLabels = () => chart().find('text.revenue-label tspan.revenue-amount');

function parseCompactUsd(text: string): number {
  const match = /^(?<sign>-?)\$(?<digits>[\d.]+)(?<unit>[kMB]?)$/.exec(text.trim());
  expect(match, `compact USD "${text}"`).to.not.equal(null);
  const { sign, digits, unit } = match!.groups!;
  const scale = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'k' ? 1e3 : 1;
  return (sign === '-' ? -1 : 1) * Number.parseFloat(digits) * scale;
}

describe('Profit Estimator per GW', () => {
  before(() => {
    stubOpenRouter();
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
  });

  beforeEach(stubOpenRouter);

  it('opens with the documented defaults and a priced chart', () => {
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    cy.get('[data-testid="profit-utilization-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    bars().should('have.length.greaterThan', 0);
    // Cost tiers carry the same names as the /inference y-axis selector.
    cy.get('button#profit-cost').should('contain.text', 'Owning - Hyperscaler').click();
    cy.get('[role="option"]').then(($opts) => {
      const labels = [...$opts].map((el) => el.textContent?.trim());
      expect(labels).to.include.members([
        'Owning - Hyperscaler',
        'Owning - Neocloud Giant',
        '3 Year Rental',
        'Custom $/GPU/hr',
      ]);
    });
    cy.get('body').type('{esc}');
    // Segments are labelled in place; there is no separate key under the title.
    cy.get('[data-testid="profit-segment-key"]').should('not.exist');
    chart().should('contain.text', 'Model License Fee').and('contain.text', 'Profit');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'Revenue & Profit Estimates per GigaWatt Per Year at P90 45 tok/s/user Interactivity',
    );
    cy.get('[data-testid="result-context-cost-tier"]').should('contain.text', 'Owning Hyperscaler');
    cy.get('[data-testid="result-context-utilization"]').should('have.text', '60%');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '30%');
    cy.get('[data-testid="profit-caption"]').should('contain.text', 'TCO $/chip/hr');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'Kimi K3');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.6')
      .and('contain.text', 'Cached Input: $0.1')
      .and('contain.text', 'Output: $2.5')
      .and('contain.text', '(OpenRouter)')
      .and('not.contain.text', 'moonshotai');
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt');
    cy.get('[data-testid="profit-precision-selector"]').should('not.exist');
    cy.get('[data-testid="profit-model-selector"]').should('contain.text', 'Kimi K3').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'Kimi K3')
      .and('contain.text', 'GLM5.2/GLM5.3')
      .and('contain.text', 'MiniMax M3');
    cy.get('body').type('{esc}');
    // Kimi K3 has no list price, so the selector offers the catalog and custom only.
    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]').should('have.length', 2).and('not.contain.text', 'list price');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="profit-custom-costs"]').should('not.exist');
    // Each x label carries its vendor mark; the H200 curve stops short of 45
    // tok/s/user, so it is absent from the chart rather than extrapolated.
    chart().find('.tick image.vendor-mark').should('not.exist');
    // Desktop width: upright two-line labels, SKU name then framework.
    chart().find('.tick text tspan').should('have.length', 8);
    chart().find('.tick text').first().should('not.have.attr', 'transform');
    chart().find('.tick text').first().should('contain.text', 'GB300 NVL72');
    cy.get('[data-testid="profit-skipped"]').should('not.exist');
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    cy.get('[data-testid="profit-high-contrast"]').should('not.exist');
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-formula-notes"]')
      .should('contain.text', 'Revenue per GigaWatt Formula')
      .and('not.contain.text', '60% utilization');
    openFormulaNotes();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '60% utilization');
    cy.get('[data-testid="profit-formula-notes"] button').click();
    cy.get('[data-testid="profit-formula-notes"]').should('not.contain.text', '60% utilization');
    chart().should('not.contain.text', 'Hover a bar');
    cy.get('[data-testid="export-button"]').should('exist');
    cy.get('[data-testid="profit-scenario"]').should('not.exist');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');
    // Both profit tabs sit between Inference Performance and Accuracy Evals;
    // the TCO calculator and fleet lifecycle left the nav for the footer.
    cy.get('[data-testid^="tab-trigger-"]').then(($tabs) => {
      const keys = [...$tabs].map((el) => (el as HTMLElement).dataset.testid);
      expect(keys.slice(0, 4)).to.deep.equal([
        'tab-trigger-inference',
        'tab-trigger-profit-estimator-per-gigawatt',
        'tab-trigger-profit-estimator',
        'tab-trigger-evaluation',
      ]);
      expect(keys).to.not.include('tab-trigger-calculator');
      expect(keys).to.not.include('tab-trigger-fleet');
    });
    cy.get('[data-testid="tab-trigger-profit-estimator-per-gigawatt"]').should(
      'contain.text',
      'Profit Estimator per GW',
    );
    cy.get('[data-testid="footer-link-calculator"]')
      .should('have.attr', 'href', '/calculator')
      .and('contain.text', 'TCO Calculator');
    cy.get('[data-testid="footer-link-fleet"]')
      .should('have.attr', 'href', '/fleet')
      .and('contain.text', 'Fleet Lifecycle');
  });

  it('stacks TCO first and labels every bar with its revenue', () => {
    chart()
      .find('rect.bar-tco')
      .its('length')
      .then((tcoCount) => {
        revenueLabels().should('have.length', tcoCount);
      });
    chart().find('line.zero-line').should('have.length', 1);
  });

  it('scales revenue with utilization but leaves TCO alone', () => {
    let revenueAt60 = 0;
    let tcoHeightAt60 = '';
    revenueLabels()
      .first()
      .invoke('text')
      .then((text) => {
        revenueAt60 = parseCompactUsd(text);
      });
    chart()
      .find('rect.bar-tco')
      .first()
      .invoke('attr', 'height')
      .then((height) => {
        tcoHeightAt60 = String(height);
      });

    openFormulaNotes();
    cy.get('[data-testid="profit-utilization-input"]').clear().type('30').blur();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '30% utilization');
    cy.get('[data-testid="result-context-utilization"]').should('have.text', '30%');
    revenueLabels()
      .first()
      .invoke('text')
      .should((text) => {
        // Bars re-sort by revenue, but halving utilization halves every bar, so
        // the tallest bar is still the tallest and its label halves.
        expect(parseCompactUsd(text)).to.be.closeTo(revenueAt60 / 2, revenueAt60 * 0.02);
      });
    // Y domain rescales, so compare TCO in data terms via the tooltip-free
    // path: heights change with the axis, but the segment must still be there
    // and the pixel height must not have been halved along with revenue.
    chart()
      .find('rect.bar-tco')
      .first()
      .invoke('attr', 'height')
      .should((height) => {
        expect(Number(height)).to.be.greaterThan(Number(tcoHeightAt60) * 0.6);
      });

    cy.get('[data-testid="profit-utilization-input"]').clear().type('60').blur();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '60% utilization');
  });

  it('clamps utilization and the license fee to 0–100 on blur', () => {
    openFormulaNotes();
    cy.get('[data-testid="profit-lab-cut-input"]').clear().type('250').blur();
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '100');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '100%');
    cy.get('[data-testid="profit-formula-notes"]').should(
      'contain.text',
      'Model license fee = 100%',
    );
    cy.get('[data-testid="profit-lab-cut-input"]').clear().type('30').blur();
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
  });

  it('retypes the target interactivity and rewrites the heading', () => {
    cy.get('[data-testid="profit-target-input"]').clear().type('60').blur();
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'at P90 60 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').clear().type('45').blur();
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'at P90 45 tok/s/user');
  });

  it('uses the SKU legend as the bar filter', () => {
    bars()
      .its('length')
      .then((allBars) => {
        cy.get('[data-testid="profit-legend"] li').should('have.length.greaterThan', 1);
        // One badge per base chip drawn: GB300, B300, B200, MI355X.
        cy.get('[data-testid="profit-tco-badge"]').should('have.length', 4);
        cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'GB300: 2.31');
        cy.get('[data-testid="profit-legend"] li').first().click();
        bars().should('have.length.lessThan', allBars);
        chart()
          .find('rect.bar-tco')
          .should('have.length.lessThan', 4)
          .and('have.length.greaterThan', 0);
        // Clicking a legend item isolates it; the subtitle keeps only that
        // SKU's TCO badge.
        cy.get('[data-testid="profit-tco-badge"]').should('have.length', 1);
        cy.get('[data-testid="profit-tco-badges"]')
          .should('contain.text', 'GB300: 2.31')
          .and('not.contain.text', 'MI355X');
        cy.get('[data-testid="profit-reset-filter"]').click();
        bars().should('have.length', allBars);
        cy.get('[data-testid="profit-tco-badge"]').should('have.length', 4);
        cy.get('[data-testid="profit-reset-filter"]').should('not.exist');
      });
  });

  it('lets a custom price pair replace the OpenRouter catalog', () => {
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-custom-prices"]').should('exist');
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.6');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.1');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '2.5');
    cy.get('[data-testid="profit-output-price"]').clear().type('10').blur();
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', 'Output: $10');
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', '(custom)');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-input-price"]').should('not.exist');
    cy.get('[data-testid="profit-cached-price"]').should('not.exist');
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', 'Output: $2.5');
  });

  it('lets a custom $/GPU/hr per chip replace the TCO tier', () => {
    cy.get('button#profit-cost').click();
    cy.contains('[role="option"]', 'Custom $/GPU/hr').click();
    cy.get('[data-testid="result-context-cost-tier"]').should('contain.text', 'Custom');
    cy.get('[data-testid="profit-custom-costs"] input').should('have.length.greaterThan', 0);
    // A user-entered $/GPU/hr has no external source to cite.
    cy.get('[data-testid="profit-tco-source"]').should('not.exist');
    chart()
      .find('rect.bar-tco')
      .its('length')
      .then((tcoBarsBefore) => {
        // Inputs are seeded from the hyperscaler tier, so nothing is dropped yet.
        cy.get('[data-testid="profit-custom-costs"] input')
          .first()
          .invoke('val')
          .then((seed) => expect(Number(seed)).to.be.greaterThan(0));
        cy.get('[data-testid="profit-custom-costs"] label')
          .first()
          .invoke('text')
          .then((labelText) => {
            const chip = labelText.replace(/\s*\$\/GPU\/hr$/u, '').trim();
            cy.get('[data-testid="profit-custom-costs"] input').first().clear().type('9').blur();
            cy.get('[data-testid="profit-caption"]').should('contain.text', `${chip}: 9`);
          });
        // An empty custom cost drops that chip instead of pricing it at zero.
        cy.get('[data-testid="profit-custom-costs"] input').first().clear().blur();
        chart().find('rect.bar-tco').should('have.length.lessThan', tcoBarsBefore);
        cy.get('[data-testid="profit-custom-costs"] input').first().type('1.5').blur();
        chart().find('rect.bar-tco').should('have.length', tcoBarsBefore);
      });

    cy.get('button#profit-cost').click();
    cy.contains('[role="option"]', 'Owning - Hyperscaler').click();
    cy.get('[data-testid="profit-custom-costs"]').should('not.exist');
    cy.get('[data-testid="profit-tco-source"]').should('contain.text', 'TCO Model');
    cy.get('[data-testid="result-context-cost-tier"]').should('contain.text', 'Owning Hyperscaler');
  });

  it('explains a missing OpenRouter listing instead of drawing an unpriced chart', () => {
    interceptProfitData();
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', { data: [] }).as('openrouter-empty');
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    cy.get('[data-testid="profit-pricing-notice"]').should(
      'contain.text',
      'OpenRouter has no price',
    );
    chart().should('not.exist');
  });
});

describe('Profit Estimator per GW — chart height follows the viewport', () => {
  beforeEach(stubOpenRouter);

  it('shrinks on a laptop-height viewport and grows back on a tall one', () => {
    // 720px tall (the Cypress default): 720 - 260 reserved = 460px chart, so the
    // card title and the x labels share one screen.
    cy.viewport(1280, 720);
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    chartSvg().should('have.attr', 'height', '460');
    // Plenty of room: the chart takes its full 720px.
    cy.viewport(1440, 1200);
    chartSvg().should('have.attr', 'height', '720');
    // Very short viewports stop at the minimum where in-bar labels collide.
    cy.viewport(1280, 600);
    chartSvg().should('have.attr', 'height', '440');
  });
});

describe('Profit Estimator per GW — per-model route', () => {
  it('serves /profit-estimator-per-gigawatt/kimi-k3 and 308s aliases to the canonical slug', () => {
    stubOpenRouter();
    cy.visit('/profit-estimator-per-gigawatt/kimi-k3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'Kimi K3');
    // A canonical slug is left alone; only aliases and model switches rewrite.
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');

    cy.request({ url: '/profit-estimator-per-gigawatt/Kimi-K3', followRedirect: false }).then(
      (response) => {
        expect(response.status).to.eq(308);
        expect(response.headers.location).to.match(/\/profit-estimator-per-gigawatt\/kimi-k3$/u);
      },
    );
  });

  it('404s models the estimator does not serve yet', () => {
    cy.request({ url: '/profit-estimator-per-gigawatt/deepseek-v4-pro', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
    cy.request({ url: '/profit-estimator-per-gigawatt/not-a-model', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });
});

describe('Profit Estimator — GLM 5.2/5.3', () => {
  beforeEach(() => {
    stubOpenRouter();
    cy.viewport(1280, 1000);
  });

  it('opens /profit-estimator/glm-5-3 on 100 tok/s/user and the Z.ai list price', () => {
    cy.visit('/profit-estimator/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/glm-5-3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '100');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'GLM5.2/GLM5.3 744B Agentic Revenue & Profit Estimates per Chip per Hour at P90 100 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.4')
      .and('contain.text', 'Cached Input: $0.26')
      .and('contain.text', 'Output: $4.4')
      .and('contain.text', '(Z.ai list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://docs.z.ai/guides/overview/pricing')
      .and('contain.text', 'Z.ai');
    // The wide curve covers 100 tok/s/user; the H200 curve stops short of it.
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    // The catalog stays one click away and reads the GLM row, not Kimi's.
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

    // Custom seeds from the price in force, here the list price.
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
    cy.get('[data-testid="profit-target-input"]').should('have.value', '100');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    // The in-page switch rewrites to the slugged path; only a fresh visit to the
    // slug canonicalizes the default model back to the bare path.
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/kimi-k3');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'Kimi K3')
      .and('contain.text', '45 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.6')
      .and('contain.text', '(OpenRouter)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'GLM5.2/GLM5.3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/glm-5-3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '100');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $1.4')
      .and('contain.text', '(Z.ai list price)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator/glm-5-3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '100');
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

  it('opens /profit-estimator/minimax-m3 on 83 tok/s/user and the MiniMax list price', () => {
    cy.visit('/profit-estimator/minimax-m3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.location('pathname').should('eq', '/profit-estimator/minimax-m3');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '83');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'MiniMax M3 428B Agentic Revenue & Profit Estimates per Chip per Hour at P90 83 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', 'Cached Input: $0.06')
      .and('contain.text', 'Output: $1.2')
      .and('contain.text', '(MiniMax list price)');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://platform.minimax.io/docs/guides/pricing-paygo')
      .and('contain.text', 'MiniMax');
    // The wide curve covers 83 tok/s/user; the H200 curve stops short of it.
    chart().find('image.bar-vendor-mark').should('have.length', 4);
    chart().should('not.contain.text', 'H200');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');

    // The catalog stays one click away and reads the MiniMax row, not Kimi's.
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

    // Custom seeds from the price in force, here the list price.
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'MiniMax list price').click();
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.3');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.06');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '1.2');
  });

  it('re-seeds the operating point and price source when switching from GLM', () => {
    cy.visit('/profit-estimator-per-gigawatt/glm-5-2', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '100');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'MiniMax M3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt/minimax-m3');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', 'MiniMax M3')
      .and('contain.text', '83 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '83');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.3')
      .and('contain.text', '(MiniMax list price)');

    cy.get('[data-testid="profit-model-selector"]').click();
    cy.contains('[role="option"]', 'Kimi K3').click();
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.6')
      .and('contain.text', '(OpenRouter)');
  });

  it('serves the Chinese mirror with the list price named in Chinese', () => {
    cy.visit('/zh/profit-estimator-per-gigawatt/minimax-m3', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-target-input"]').should('have.value', '83');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', '输入：$0.3')
      .and('contain.text', 'MiniMax 官方定价');
    cy.get('button#profit-price-source').should('contain.text', 'MiniMax 官方定价');
  });
});

describe('Profit Estimator per GW — Chinese mirror', () => {
  it('renders /zh/profit-estimator-per-gigawatt with translated controls and caption', () => {
    stubOpenRouter();
    cy.visit('/zh/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('label[for="profit-utilization"]').should('contain.text', '利用率');
    cy.get('label[for="profit-lab-cut"]').should('contain.text', '模型许可费');
    cy.get('[data-testid="result-context-utilization"]').should('have.text', '60%');
    chart().should('contain.text', '模型许可费').and('contain.text', '利润');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', '每吉瓦每年收入与利润估算');
    openFormulaNotes();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '利用率');
  });
});

describe('Profit Estimator (per chip-hour)', () => {
  before(() => {
    stubOpenRouter();
    // Tall enough for the 720px chart, so the thin compute-expense segment
    // ($2.31 of $32.72) still has room for its name.
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
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    cy.get('[data-testid="profit-utilization-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'Kimi K3 2.8T Agentic Revenue & Profit Estimates per Chip per Hour at P90 45 tok/s/user Interactivity',
    );
    cy.get('[data-testid="profit-formula-notes"]').should(
      'contain.text',
      'Revenue per Chip-Hour Formula',
    );
    openFormulaNotes();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', 'TCO $/chip/hr');
    // Revenue labels are dollars and cents, not billions.
    revenueLabels().should('have.length', 4);
    revenueLabels()
      .first()
      .invoke('text')
      .should('match', /^\$\d+\.\d{2}/u)
      .and('not.match', /[BMk]/u);
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
    cy.request({ url: '/profit-estimator/deepseek-v4-pro', failOnStatusCode: false })
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
