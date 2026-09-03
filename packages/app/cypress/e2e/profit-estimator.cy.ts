// /profit-estimator: one stacked bar per SKU, US$ per all-in GW per year.
// Behaviours worth locking down:
//  - defaults are 45 tok/s/user, 60% utilization, 30% lab cut;
//  - utilization scales revenue only, so the revenue label moves and the
//    TCO segment does not;
//  - the SKU legend is the filter for which bars are drawn;
//  - a loss is drawn below the zero line as a hatched segment, not as a new colour;
//  - the OpenRouter catalog is the default price source and a custom pair can
//    replace it.

const OPENROUTER_MODELS = {
  data: [
    {
      id: 'deepseek/deepseek-v4-pro-0813',
      pricing: { prompt: '0.00000066', completion: '0.00000198', input_cache_read: '0.000000022' },
    },
  ],
};

function stubOpenRouter(): void {
  cy.intercept('GET', 'https://openrouter.ai/api/v1/models', OPENROUTER_MODELS).as('openrouter');
}

function suppressNudges(win: Cypress.AUTWindow): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
}

const chart = () => cy.get('[data-testid="profit-estimator-chart"]');
const bars = () => chart().find('rect.bar');
const revenueLabels = () => chart().find('text.revenue-label');

function parseCompactUsd(text: string): number {
  const match = /^(?<sign>-?)\$(?<digits>[\d.]+)(?<unit>[kMB]?)$/.exec(text.trim());
  expect(match, `compact USD "${text}"`).to.not.equal(null);
  const { sign, digits, unit } = match!.groups!;
  const scale = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'k' ? 1e3 : 1;
  return (sign === '-' ? -1 : 1) * Number.parseFloat(digits) * scale;
}

describe('Profit Estimator', () => {
  before(() => {
    stubOpenRouter();
    cy.visit('/profit-estimator', { onBeforeLoad: suppressNudges });
    chart().should('exist');
  });

  beforeEach(stubOpenRouter);

  it('opens with the documented defaults and a priced chart', () => {
    cy.get('[data-testid="profit-target-input"]').should('have.value', '45');
    cy.get('[data-testid="profit-utilization-input"]').should('have.value', '60');
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
    bars().should('have.length.greaterThan', 0);
    cy.get('[data-testid="profit-segment-key"]')
      .should('contain.text', 'Compute expense (TCO)')
      .and('contain.text', 'Model lab cut')
      .and('contain.text', 'Operator profit');
    cy.get('[data-testid="profit-caption"]').should('contain.text', '$0.66/M input');
    cy.get('[data-testid="profit-caption"]').should('contain.text', '60% utilization');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');
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

    cy.get('[data-testid="profit-utilization-input"]').clear().type('30').blur();
    cy.get('[data-testid="profit-caption"]').should('contain.text', '30% utilization');
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
    cy.get('[data-testid="profit-caption"]').should('contain.text', '60% utilization');
  });

  it('clamps utilization and lab cut to 0–100 on blur', () => {
    cy.get('[data-testid="profit-lab-cut-input"]').clear().type('250').blur();
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '100');
    cy.get('[data-testid="profit-caption"]').should('contain.text', 'Lab cut = 100%');
    cy.get('[data-testid="profit-lab-cut-input"]').clear().type('30').blur();
    cy.get('[data-testid="profit-lab-cut-input"]').should('have.value', '30');
  });

  it('uses the SKU legend as the bar filter', () => {
    bars()
      .its('length')
      .then((allBars) => {
        cy.get('[data-testid="profit-legend"] li').should('have.length.greaterThan', 1);
        cy.get('[data-testid="profit-legend"] li').first().click();
        bars().should('have.length.lessThan', allBars);
        chart()
          .find('rect.bar-tco')
          .should('have.length.lessThan', 4)
          .and('have.length.greaterThan', 0);
        cy.get('[data-testid="profit-reset-filter"]').click();
        bars().should('have.length', allBars);
        cy.get('[data-testid="profit-reset-filter"]').should('not.exist');
      });
  });

  it('lets a custom price pair replace the OpenRouter catalog', () => {
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.66');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '1.98');
    cy.get('[data-testid="profit-output-price"]').clear().type('10').blur();
    cy.get('[data-testid="profit-caption"]').should('contain.text', '$10/M output');
    cy.get('[data-testid="profit-caption"]').should('contain.text', '(custom)');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-input-price"]').should('not.exist');
    cy.get('[data-testid="profit-caption"]').should('contain.text', '$1.98/M output');
  });

  it('explains a missing OpenRouter listing instead of drawing an unpriced chart', () => {
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', { data: [] }).as('openrouter-empty');
    cy.visit('/profit-estimator', { onBeforeLoad: suppressNudges });
    cy.get('[data-testid="profit-pricing-notice"]').should(
      'contain.text',
      'OpenRouter has no price',
    );
    chart().should('not.exist');
  });
});

describe('Profit Estimator — Chinese mirror', () => {
  it('renders /zh/profit-estimator with translated controls and caption', () => {
    stubOpenRouter();
    cy.visit('/zh/profit-estimator', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('label[for="profit-utilization"]').should('contain.text', '利用率');
    cy.get('label[for="profit-lab-cut"]').should('contain.text', '实验室分成');
    cy.get('[data-testid="profit-segment-key"]').should('contain.text', '算力支出');
    cy.get('[data-testid="profit-caption"]').should('contain.text', '利用率');
  });
});
