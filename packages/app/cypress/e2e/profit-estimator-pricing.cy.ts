import {
  bars,
  chart,
  chartSvg,
  chipTrigger,
  openFormulaNotes,
  OPENROUTER_MODELS,
  pickChip,
  revenueLabels,
  stubOpenRouter,
  suppressNudges,
} from '../support/profit-estimator';
import {
  interceptProfitData,
  PROFIT_CHANGELOG_NOTES,
  PROFIT_DATE,
  PROFIT_HISTORY_DATE,
  PROFIT_RUN_DATE,
  PROFIT_RUNS,
} from '../support/profit-fixtures';
import { interceptVrPublicationData } from '../support/vr-publication-fixtures';

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
    cy.get('[data-testid="profit-target-input"]').should('have.value', '60');
    cy.get('[data-testid="result-context-utilization"] input#profit-utilization').should(
      'have.value',
      '60',
    );
    cy.get('[data-testid="result-context-license-fee"] input#profit-lab-cut').should(
      'have.value',
      '30',
    );
    cy.get('[data-testid="profit-pricing-panel"] #profit-utilization').should('not.exist');
    cy.get('[data-testid="profit-pricing-panel"] #profit-lab-cut').should('not.exist');
    bars().should('have.length.greaterThan', 0);
    cy.get('[data-testid="profit-pricing-panel"] #profit-cost').should('not.exist');
    cy.get('[data-testid="result-context-cost-tier"] button#profit-cost')
      .should('contain.text', 'Owning at Large Hyperscaler Volume')
      .click();
    cy.get('[data-select-option]').then(($opts) => {
      const labels = [...$opts].map((el) => el.textContent?.trim());
      expect(labels).to.include.members([
        'Owning at Large Hyperscaler Volume',
        'Rent - 3 Year Commit',
        'Custom $/GPU/hr',
      ]);
      const customIdx = labels.indexOf('Custom $/GPU/hr');
      expect(customIdx).to.equal(labels.indexOf('Rent - 3 Year Commit') + 1);
      const lockedIdx = [...$opts].flatMap((el, i) =>
        el.dataset.testid?.startsWith('cost-provider-locked-') ? [i] : [],
      );
      expect(lockedIdx).to.have.length.greaterThan(0);
      expect(Math.min(...lockedIdx)).to.be.greaterThan(customIdx);
    });
    cy.get('body').type('{esc}');
    cy.get('button#profit-cost').should('have.attr', 'aria-expanded', 'false').and('be.focused');
    cy.get('[data-testid="profit-segment-key"]').should('not.exist');
    chart().should('contain.text', 'Model License Fee').and('contain.text', 'Profit');
    cy.get('[data-testid="profit-caption"] h2').should(
      'contain.text',
      'Revenue & Profit Estimates per GigaWatt Per Year at P90 60 tok/s/user Interactivity (Beta)',
    );
    cy.contains('Revenue & Profit Estimator per GigaWatt (Beta)').should('be.visible');
    cy.get('[data-testid="result-context-cost-tier"]').should(
      'contain.text',
      'Owning at Large Hyperscaler Volume',
    );
    cy.get('[data-testid="result-context-utilization"]').should('have.text', '60%');
    cy.get('[data-testid="result-context-license-fee"]').should('have.text', '30%');
    cy.get('[data-testid="profit-caption"]').should('contain.text', 'TCO $/chip/hr');
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'Kimi K3');
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $3')
      .and('contain.text', 'Cached Input: $0.3')
      .and('contain.text', 'Output: $15')
      .and('contain.text', '(Moonshot list price)')
      .and('not.contain.text', 'moonshotai');
    cy.get('[data-testid="profit-list-price-source"]')
      .should('have.attr', 'href', 'https://platform.kimi.ai/docs/pricing/chat-k3')
      .and('contain.text', 'Moonshot');
    cy.location('pathname').should('eq', '/profit-estimator-per-gigawatt');
    cy.get('[data-testid="profit-precision-selector"]').should('not.exist');
    cy.get('[data-testid="profit-model-selector"]').should('contain.text', 'Kimi K3').click();
    cy.get('[role="option"]')
      .should('have.length', 5)
      .and('contain.text', 'Kimi K3')
      .and('contain.text', 'GLM5.2/GLM5.3')
      .and('contain.text', 'MiniMax M3')
      .and('contain.text', 'DeepSeek V4 Pro')
      .and('contain.text', 'DeepSeek V4.1 Flash');
    cy.get('body').type('{esc}');
    cy.get('button#profit-price-source').click();
    cy.get('[role="option"]')
      .should('have.length', 3)
      .and('contain.text', 'OpenRouter')
      .and('contain.text', 'Moonshot list price')
      .and('contain.text', 'Custom $/M tok');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="profit-custom-costs"]').should('not.exist');
    cy.get('[data-testid="profit-tco-badge"] input').should('have.length', 4);
    chart().find('.tick image.vendor-mark').should('not.exist');
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
    cy.get('[data-testid="profit-scenario-selector"]').should('not.exist');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');
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
        expect(parseCompactUsd(text)).to.be.closeTo(revenueAt60 / 2, revenueAt60 * 0.02);
      });
    chart()
      .find('rect.bar-tco')
      .first()
      .invoke('attr', 'height')
      .should((height) => {
        expect(Number(height)).to.be.greaterThan(Number(tcoHeightAt60) * 0.6);
      });

    cy.get('[data-testid="profit-utilization-input"]').clear().type('60').blur();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '60% utilization');

    cy.get('[data-testid="profit-target-input"]').clear().type('60').blur();
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'at P90 60 tok/s/user');
    cy.get('[data-testid="profit-target-input"]').clear().type('45').blur();
    cy.get('[data-testid="profit-caption"] h2').should('contain.text', 'at P90 45 tok/s/user');
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

  it('uses the SKU legend as the bar filter', () => {
    bars()
      .its('length')
      .then((allBars) => {
        cy.get('[data-testid="profit-legend"] li').should('have.length.greaterThan', 1);
        cy.get('[data-testid="profit-tco-badge"]').should('have.length', 4);
        cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'GB300: 2.31');
        cy.get('[data-testid="profit-legend"] li').first().click();
        bars().should('have.length.lessThan', allBars);
        chart()
          .find('rect.bar-tco')
          .should('have.length.lessThan', 4)
          .and('have.length.greaterThan', 0);
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

  it('lets the OpenRouter catalog or a custom price pair replace the list price', () => {
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-selling-prices"]')
      .should('contain.text', 'Input: $0.6')
      .and('contain.text', 'Cached Input: $0.1')
      .and('contain.text', 'Output: $2.5')
      .and('contain.text', '(OpenRouter)');
    cy.get('[data-testid="profit-list-price-source"]').should('not.exist');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Custom $/M tok').click();
    // The closing popover refocuses its trigger after the exit animation; typing before that
    // loses the keystrokes that clear the field.
    cy.get('button#profit-price-source').should('have.focus');
    cy.get('[data-testid="profit-custom-prices"]').should('exist');
    cy.get('[data-testid="profit-input-price"]').should('have.value', '0.6');
    cy.get('[data-testid="profit-cached-price"]').should('have.value', '0.1');
    cy.get('[data-testid="profit-output-price"]').should('have.value', '2.5');
    cy.get('[data-testid="profit-output-price"]').clear().type('10').blur();
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', 'Output: $10');
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', '(custom)');

    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'Moonshot list price').click();
    cy.get('[data-testid="profit-input-price"]').should('not.exist');
    cy.get('[data-testid="profit-cached-price"]').should('not.exist');
    cy.get('[data-testid="profit-selling-prices"]').should('contain.text', 'Output: $15');
  });

  it('lets a custom $/GPU/hr per chip replace the TCO tier', () => {
    cy.get('button#profit-cost').click();
    cy.get('[data-testid="cost-provider-custom"]').click();
    cy.get('button#profit-cost').should('have.focus');
    cy.get('[data-testid="result-context-cost-tier"]').should('contain.text', 'Custom');
    cy.get('[data-testid="profit-custom-costs"]').should('not.exist');
    cy.get('[data-testid="profit-tco-badge"] input').should('have.length', 4);
    cy.get('[data-testid="profit-tco-source"]').should('not.exist');
    chart()
      .find('rect.bar-tco')
      .its('length')
      .then((tcoBarsBefore) => {
        cy.get('[data-testid="profit-custom-cost-gb300"]').should('have.value', '2.31');
        cy.get('[data-testid="profit-custom-cost-gb300"]').clear().type('9').blur();
        cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'GB300: 9');
        cy.get('[data-testid="profit-custom-cost-gb300"]').clear().blur();
        chart().find('rect.bar-tco').should('have.length.lessThan', tcoBarsBefore);
        cy.get('[data-testid="profit-custom-cost-gb300"]').type('1.5').blur();
        chart().find('rect.bar-tco').should('have.length', tcoBarsBefore);
      });

    cy.get('button#profit-cost').click();
    cy.get('[data-testid="cost-provider-costh"]').click();
    cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'GB300: 2.31');
    cy.get('[data-testid="profit-tco-source"]').should('contain.text', 'TCO Model');
    cy.get('[data-testid="result-context-cost-tier"]').should(
      'contain.text',
      'Owning at Large Hyperscaler Volume',
    );
  });

  it('switches to custom $/GPU/hr when a caption badge is edited', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    cy.get('[data-testid="result-context-cost-tier"]').should(
      'contain.text',
      'Owning at Large Hyperscaler Volume',
    );
    cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'MI355X: 1.5');
    cy.get('[data-testid="profit-custom-cost-gb300"]').clear().type('4').blur();
    cy.get('[data-testid="result-context-cost-tier"]').should('contain.text', 'Custom');
    cy.get('[data-testid="profit-tco-badges"]')
      .should('contain.text', 'GB300: 4')
      .and('contain.text', 'MI355X: 1.5');
    cy.get('[data-testid="profit-tco-source"]').should('not.exist');
    cy.get('button#profit-cost').click();
    cy.get('[data-testid="cost-provider-costh"]').click();
    cy.get('[data-testid="profit-tco-badges"]').should('contain.text', 'GB300: 2.31');
  });

  it('explains a missing OpenRouter listing instead of drawing an unpriced chart', () => {
    interceptProfitData();
    cy.intercept('GET', 'https://openrouter.ai/api/v1/models', { data: [] }).as('openrouter-empty');
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    cy.get('[data-testid="profit-pricing-notice"]').should('not.exist');
    cy.get('button#profit-price-source').click();
    cy.contains('[role="option"]', 'OpenRouter').click();
    cy.get('[data-testid="profit-pricing-notice"]').should(
      'contain.text',
      'OpenRouter has no price',
    );
    chart().should('not.exist');
  });
});

const historyPanel = () => cy.get('[data-testid="profit-history-panel"]');
const axisLabels = () => chartSvg().find('.x-axis text');
const changelog = () => cy.get('[data-testid="profit-history-changelog"]');
const waitForChart = () => {
  chart().should('exist');
  bars().should('have.length.greaterThan', 0);
};

describe('Profit Estimator per GW — compare history', () => {
  beforeEach(stubOpenRouter);

  it('offers the agentic chip configs and shows the range picker once one is chosen', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    historyPanel().should('contain.text', 'Compare history').and('contain.text', 'Chip Config');
    cy.get('[data-testid="profit-history-date-range"]').should('not.exist');
    bars()
      .its('length')
      .then((allBars) => {
        chipTrigger().should('contain.text', 'Select Chip Config');
        chipTrigger().click({ force: true });
        cy.get('[role="option"]').should('have.length', 5).and('contain.text', 'GB300');
        cy.get('[role="option"]').should('contain.text', 'H200');
        cy.get('[role="option"]').contains('GB300').click();
        cy.get('body').type('{esc}');
        cy.get('[data-testid="profit-history-date-range"]').should('be.visible');
        bars().should('have.length', allBars);
        chipTrigger().should('contain.text', 'GB300');
        chipTrigger().click({ force: true });
        cy.get('[role="option"]').contains('GB300').click();
        cy.get('body').type('{esc}');
        cy.get('[data-testid="profit-history-date-range"]').should('not.exist');
        chipTrigger().should('contain.text', 'Select Chip Config');
      });
  });

  it('prices the chosen chips on the range endpoints next to today', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    waitForChart();
    pickChip('GB300');
    pickChip('B200');
    cy.contains('button', 'Select date range').click();
    cy.contains('button', 'Max Range').click();
    cy.contains('button', 'Apply').click();

    cy.contains('button', 'Jul 15, 2026').should('be.visible');
    chart().find('rect.bar-tco').should('have.length', 4);
    cy.get('[data-testid="profit-legend"] li').should('have.length', 2);
    cy.get('[data-testid="profit-history-note"]')
      .should('contain.text', 'Compare history')
      .and('contain.text', PROFIT_HISTORY_DATE);
    axisLabels().should('contain.text', PROFIT_HISTORY_DATE);
    revenueLabels().then(($labels) => {
      const revenues = [...$labels].map((el) => parseCompactUsd(el.textContent ?? ''));
      expect(revenues).to.have.length(4);
      expect(revenues[0]).to.be.lessThan(revenues[1]!);
      expect(revenues[2]).to.be.lessThan(revenues[3]!);
    });
  });

  it('hydrates the comparison from the URL and clears the range with the chips', () => {
    cy.visit(
      `/profit-estimator-per-gigawatt?i_gpus=b200_sglang&i_dstart=${PROFIT_HISTORY_DATE}&i_dend=${PROFIT_DATE}`,
      { onBeforeLoad: suppressNudges },
    );
    chart().should('exist');
    chipTrigger().should('contain.text', 'B200');
    cy.contains('button', 'Jul 15, 2026').should('be.visible');
    chart().find('rect.bar-tco').should('have.length', 2);
    cy.get('[data-testid="profit-legend"] li').should('have.length', 1);

    chipTrigger().click({ force: true });
    cy.get('[role="option"]').contains('B200').click();
    cy.get('body').type('{esc}');
    cy.get('[data-testid="profit-history-date-range"]').should('not.exist');
    cy.get('[data-testid="profit-history-note"]').should('not.exist');
    chart().find('rect.bar-tco').should('have.length', 4);
    chipTrigger().should('contain.text', 'Select Chip Config');
    changelog().should('not.exist');
  });

  it('lists the Config Changelog for the chosen chips and pins a date onto the chart', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    waitForChart();
    changelog().should('not.exist');
    pickChip('GB300');
    changelog()
      .contains('button', 'Config Changelog (3 dates with changes)')
      .should('have.attr', 'aria-expanded', 'true');
    changelog()
      .should('contain.text', PROFIT_CHANGELOG_NOTES[PROFIT_HISTORY_DATE])
      .and('contain.text', PROFIT_CHANGELOG_NOTES[PROFIT_DATE])
      .and('contain.text', 'Git Commit')
      .and('contain.text', 'Workflow Run')
      .and('contain.text', 'Add all to chart');
    changelog().find('span:contains("On chart")').should('have.length', 0);
    changelog()
      .contains('span', PROFIT_HISTORY_DATE)
      .parent()
      .contains('button', 'Add to chart')
      .click();
    cy.contains('button', 'Select date range').should('be.visible');
    chart().find('rect.bar-tco').should('have.length', 2);
    axisLabels().should('contain.text', PROFIT_HISTORY_DATE);
    cy.get('[data-testid="profit-history-note"]').should('contain.text', PROFIT_HISTORY_DATE);
    changelog()
      .contains('span', PROFIT_HISTORY_DATE)
      .parent()
      .contains('button', 'Remove from chart')
      .click();
    changelog().find('button:contains("Remove from chart")').should('have.length', 0);
    cy.get('[data-testid="profit-history-note"]').should('not.exist');
    chart().find('rect.bar-tco').should('have.length', 4);
  });

  it('offers each same-day run as its own numbered bar and adds them all at once', () => {
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    waitForChart();
    pickChip('GB300');
    changelog()
      .should('contain.text', `${PROFIT_RUN_DATE} #1`)
      .and('contain.text', `${PROFIT_RUN_DATE} #2`)
      .and('contain.text', PROFIT_CHANGELOG_NOTES.run1)
      .and('contain.text', PROFIT_CHANGELOG_NOTES.run2);
    changelog()
      .contains('span', `${PROFIT_RUN_DATE} #1`)
      .parent()
      .contains('button', 'Add to chart')
      .click();
    changelog()
      .contains('span', `${PROFIT_RUN_DATE} #1`)
      .parent()
      .contains('button', 'Remove from chart')
      .should('exist');
    chart().find('rect.bar-tco').should('have.length', 2);
    axisLabels().should('contain.text', `${PROFIT_RUN_DATE} #1`);
    changelog().contains('button', 'Add all to chart').click();
    changelog().find('button:contains("Add to chart")').should('have.length', 0);
    chart().find('rect.bar-tco').should('have.length', 4);
    axisLabels().should('contain.text', `${PROFIT_RUN_DATE} #2`);
    revenueLabels().then(($labels) => {
      const revenues = [...$labels].map((el) => parseCompactUsd(el.textContent ?? ''));
      expect(revenues).to.have.length(4);
      expect(revenues[0]).to.be.lessThan(revenues[1]!);
      expect(revenues[1]).to.be.lessThan(revenues[2]!);
      expect(revenues[2]).to.be.lessThan(revenues[3]!);
    });
  });

  it('hydrates pinned runs from the URL and locks the range endpoints as "On chart"', () => {
    cy.visit(
      `/profit-estimator-per-gigawatt?i_gpus=gb300_sglang&i_dstart=${PROFIT_HISTORY_DATE}&i_dend=${PROFIT_DATE}&i_dates=${PROFIT_RUN_DATE}~r${PROFIT_RUNS[1].runId}`,
      { onBeforeLoad: suppressNudges },
    );
    chart().should('exist');
    chart().find('rect.bar-tco').should('have.length', 3);
    axisLabels()
      .should('contain.text', PROFIT_HISTORY_DATE)
      .and('contain.text', `${PROFIT_RUN_DATE} #2`);
    changelog().find('span:contains("On chart")').should('have.length', 2);
    changelog().find('button:contains("On chart")').should('have.length', 0);
    changelog().find('button:contains("Remove from chart")').should('have.length', 1);
    changelog()
      .contains('span', `${PROFIT_RUN_DATE} #1`)
      .parent()
      .contains('button', 'Add to chart')
      .should('exist');
  });

  it('serves the panel on the Chinese mirror with translated labels', () => {
    cy.visit('/zh/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    waitForChart();
    historyPanel().should('contain.text', '对比历史趋势').and('contain.text', '芯片配置');
    chipTrigger().should('contain.text', '选择芯片配置');
    pickChip('GB300');
    changelog().should('contain.text', '配置变更日志').and('contain.text', '添加到图表');
  });
});

describe('Profit Estimator per GW — chart height follows the viewport', () => {
  beforeEach(stubOpenRouter);

  it('shrinks on a laptop-height viewport and grows back on a tall one', () => {
    cy.viewport(1280, 720);
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: suppressNudges });
    chart().should('exist');
    chartSvg().should('have.attr', 'height', '460');
    cy.viewport(1440, 1200);
    chartSvg().should('have.attr', 'height', '720');
    cy.viewport(1280, 600);
    chartSvg().should('have.attr', 'height', '440');
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
    cy.get('[data-testid="profit-benchmark-panel"] legend').should('have.text', '基准测试配置');
    cy.get('[data-testid="profit-pricing-panel"] legend').should('have.text', '定价配置');
    cy.get('[data-testid="profit-caption"] h2')
      .should('contain.text', '每吉瓦每年收入与利润估算')
      .and('contain.text', '（Beta）');
    cy.contains('每吉瓦收入与利润估算器（Beta）').should('be.visible');
    openFormulaNotes();
    cy.get('[data-testid="profit-formula-notes"]').should('contain.text', '利用率');
  });
});

describe('VR publication economics', () => {
  for (const locale of ['', '/zh']) {
    for (const basis of ['chip-hour', 'gw-year']) {
      it(`prices cached-input TRTLLM data per ${basis} under ${locale || '/en'}`, () => {
        interceptVrPublicationData();
        cy.intercept('GET', 'https://openrouter.ai/api/v1/models', OPENROUTER_MODELS);
        const page = basis === 'chip-hour' ? 'profit-estimator' : 'profit-estimator-per-gigawatt';
        cy.visit(`${locale}/${page}/deepseek-v4`, {
          onBeforeLoad: suppressNudges,
        });
        cy.get('[data-testid="profit-target-input"]').clear().type('40').blur();
        const assertCachePricing = (cacheHitRate: number) =>
          cy.get('[data-testid="profit-estimator-chart"] rect.bar').should(($bars) => {
            const rows = [...$bars].map(
              (node) =>
                (
                  node as unknown as {
                    __data__: {
                      row: {
                        hwKey: string;
                        tco: number;
                        revenue: number;
                      };
                    };
                  }
                ).__data__.row,
            );
            const vr = rows.find((row) => row.hwKey.startsWith('vr200'));
            const gb = rows.find((row) => row.hwKey.startsWith('gb300'));
            expect(vr, 'VR is priced').not.to.equal(undefined);
            expect(gb, 'GB300 remains priced').not.to.equal(undefined);
            const vrHours = basis === 'chip-hour' ? 1 : (1_000_000 / 3.3) * 8760;
            const gbHours = basis === 'chip-hour' ? 1 : (1_000_000 / 2.12) * 8760;
            expect(vr!.tco).to.be.closeTo(vrHours * (basis === 'chip-hour' ? 8.5 : 3.61), 0.01);
            expect(gb!.tco).to.be.closeTo(gbHours * (basis === 'chip-hour' ? 5 : 2.31), 0.01);
            const revenuePerHour =
              (((12_600 * ((1 - cacheHitRate) * 1.32 + cacheHitRate * 0.044) + 5_400 * 3.96) *
                3600) /
                1_000_000) *
              0.6;
            expect(vr!.revenue).to.be.closeTo(revenuePerHour * vrHours, 0.01);
          });
        cy.get('[data-testid="profit-cache-hit-selector"]').should(
          'contain.text',
          'Theroticial Roofline',
        );
        assertCachePricing(0.97);
        cy.get('[data-testid="profit-cache-hit-selector"]').click();
        cy.contains('[role="option"]', /^Actual$/).click();
        assertCachePricing(0.95);
      });
    }
  }
});

it('keeps the latest VR snapshot in the profit estimator, matching the private preference scope', () => {
  interceptVrPublicationData(true);
  cy.intercept('GET', 'https://openrouter.ai/api/v1/models', OPENROUTER_MODELS);
  cy.visit('/profit-estimator/deepseek-v4/cache-hit-mode/actual', { onBeforeLoad: suppressNudges });
  cy.get('[data-testid="profit-target-input"]').clear().type('40').blur();
  cy.get('[data-testid="profit-estimator-chart"] rect.bar').should(($bars) => {
    const rows = [...$bars].map(
      (node) =>
        (
          node as unknown as {
            __data__: {
              row: {
                hwKey: string;
                revenue: number;
                tco: number;
              };
            };
          }
        ).__data__.row,
    );
    const vr = rows.find((row) => row.hwKey.startsWith('vr200'));
    expect(vr).not.to.equal(undefined);
    const revenue =
      (((12_600 * 0.75 * (0.1 * 1.32 + 0.9 * 0.044) + 5_400 * 0.75 * 3.96) * 3600) / 1_000_000) *
      0.6;
    expect(vr!.revenue).to.be.closeTo(revenue, 0.001);
    expect(vr!.tco).to.equal(8.5);
  });
});
