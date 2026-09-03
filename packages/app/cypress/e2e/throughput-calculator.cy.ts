import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

import {
  availability as agenticAvailability,
  b300Rows as agenticB300Rows,
} from '../support/overlay-fixtures';
import { unlockAgenticGate } from '../support/e2e';

describe('TCO Calculator', () => {
  // ---------------------------------------------------------------------------
  // Tab navigation (must start from /inference to test tab switching)
  // ---------------------------------------------------------------------------

  describe('tab navigation', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/inference');
    });

    it('shows the TCO Calculator tab trigger', () => {
      cy.get('[data-testid="tab-trigger-calculator"]').should('be.visible');
      cy.get('[data-testid="tab-trigger-calculator"]').should('contain.text', 'TCO Calculator');
    });

    it('clicking the calculator tab navigates to it', () => {
      cy.get('[data-testid="tab-trigger-calculator"]').click();
      cy.url().should('include', '/calculator');
    });

    it('switches back to inference tab and then returns to calculator', () => {
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.url().should('include', '/inference');
      cy.get('[data-testid="tab-trigger-calculator"]').click();
      cy.url().should('include', '/calculator');
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
    });
  });

  // ---------------------------------------------------------------------------
  // All remaining tests share a single /calculator page load
  // ---------------------------------------------------------------------------

  describe('controls, interactions, and features', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    // Clear stale Radix scroll lock before each test to prevent pointer-events: none
    beforeEach(() => {
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
    });

    // -------------------------------------------------------------------------
    // Controls and chart rendering
    // -------------------------------------------------------------------------

    it('renders the calculator controls section with heading', () => {
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
      cy.get('[data-testid="calculator-controls"]').should('contain.text', 'TCO Calculator');
    });

    it('groups benchmark economics above the comparison target', () => {
      cy.viewport(1280, 900);
      cy.get('[data-testid="calculator-controls"] fieldset').should('have.length', 2);
      cy.get('[data-testid="calculator-controls"] fieldset').then(($groups) => {
        const rects = [...$groups].map((group) => group.getBoundingClientRect());
        expect(rects[1].top).to.be.greaterThan(rects[0].bottom);
      });
      cy.get('[data-testid="calc-cost-selector"]').should('contain.text', 'Hyperscaler');
      cy.get('[data-testid="calculator-metric-throughput"]').should('be.visible');
      cy.get('[data-testid="calculator-metric-throughput"]')
        .parent()
        .should(($group) => {
          const bounds = $group[0].getBoundingClientRect();
          const buttons = [...$group[0].querySelectorAll('button')];
          const first = buttons[0].getBoundingClientRect();
          expect(bounds.height, 'metric group matches regular desktop controls').to.equal(36);
          expect(first.top, 'joined fill reaches the upper border').to.equal(bounds.top + 1);
          expect(first.bottom, 'joined fill reaches the lower border').to.equal(bounds.bottom - 1);
          for (let i = 1; i < buttons.length; i++) {
            // Firefox can round adjacent fractional coordinates differently;
            // a subpixel tolerance still rejects any visible inset or gap.
            expect(
              buttons[i].getBoundingClientRect().left,
              'segments have no inset gaps',
            ).to.be.closeTo(buttons[i - 1].getBoundingClientRect().right, 0.1);
          }
        });
      cy.get('input[type="range"]').should('be.visible');
    });

    it('renders Model selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-model').should('exist');
      });
    });

    it('renders Sequence selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-sequence').should('exist');
      });
    });

    it('shows the precision for a single-precision model', () => {
      // FP4 remains visible as benchmark context even without alternatives.
      cy.get('[data-testid="calc-cost-selector"]').should('exist');
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.contains('Precision').should('be.visible');
        cy.get('button#calc-precision').should('have.text', 'FP4').and('be.disabled');
      });
    });

    it('renders Cost Provider selector', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').should('exist');
      });
    });

    it('renders bar metric toggle buttons', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('[data-testid="calculator-metric-throughput"]').should('be.visible');
        cy.get('[data-testid="calculator-metric-power"]').should('be.visible');
        cy.get('[data-testid="calculator-metric-cost"]').should('be.visible');
      });
    });

    it('throughput metric is active by default', () => {
      cy.get('[data-testid="calculator-metric-throughput"]').should('have.class', 'bg-primary');
    });

    it('renders the Chart | Table view toggle', () => {
      cy.get('[data-testid="calculator-view-toggle"]').should('be.visible');
      cy.get('[data-testid="calculator-chart-view-btn"]').should('be.visible');
      cy.get('[data-testid="calculator-table-view-btn"]').should('be.visible');
    });

    it('chart view is selected by default', () => {
      cy.get('[data-testid="calculator-chart-view-btn"]').should(
        'have.attr',
        'aria-selected',
        'true',
      );
    });

    it('renders the bar chart with SVG bars', () => {
      cy.get('[data-testid="calculator-bar-chart"]').should('be.visible');
      cy.get('[data-testid="calculator-bar-chart"] svg').should('exist');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('does NOT show "No data available" when data loads', () => {
      cy.get('[data-testid="calculator-no-data"]').should('not.exist');
    });

    it('renders chart title matching the selected metric', () => {
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Total Token Throughput per Chip');
    });

    it('renders subtitle with source', () => {
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'SemiAnalysis InferenceX',
      );
    });

    it('renders the chart legend with GPU entries', () => {
      cy.get('.legend-container').scrollIntoView().should('exist');
      cy.get('.legend-container li').should('have.length.greaterThan', 0);
    });

    it('renders the target value slider and input', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]').should('exist');
        cy.get('input[type="number"]').should('exist');
      });
    });

    it('places the config-range toggle beside its label above the slider', () => {
      cy.get('[data-testid="calculator-hide-over-limit-control"]').then(($control) => {
        const label = $control.children().first()[0].getBoundingClientRect();
        const toggle = $control.find('button[role="switch"]')[0].getBoundingClientRect();
        const slider = $control
          .closest('[data-testid="calculator-controls"]')
          .find('input[type="range"]')[0]
          .getBoundingClientRect();
        expect(toggle.left - label.right).to.be.lessThan(12);
        expect(toggle.bottom).to.be.lessThan(slider.top);
      });
    });

    it('does not show badges when throughput metric is selected', () => {
      cy.get('[data-testid="calculator-cost-badges"]').should('not.exist');
    });

    it('bar chart SVG contains Y-axis tick labels (GPU names)', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .y-axis')
        .find('.tick text')
        .should('have.length.greaterThan', 0);
      cy.get('[data-testid="calculator-bar-chart"] svg .y-axis .tick text')
        .first()
        .invoke('text')
        .should('have.length.greaterThan', 0);
    });

    it('bar chart SVG contains value labels on bars', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .value-label').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="calculator-bar-chart"] svg .value-label')
        .first()
        .invoke('text')
        .should('match', /\d/u);
    });

    // -------------------------------------------------------------------------
    // Metric switching and badges
    // -------------------------------------------------------------------------

    it('clicking power metric button switches the chart metric', () => {
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-metric-power"]').should('have.class', 'bg-primary');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('shows power badges when tok/s/MW metric is selected', () => {
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'All in Power/Chip');
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'kW');
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'SemiAnalysis Datacenter Industry Model',
      );
    });

    it('clicking cost metric button switches the chart metric', () => {
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-metric-cost"]').should('have.class', 'bg-primary');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('shows TCO badges when cost metric is selected', () => {
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', 'TCO $/chip/hr');
      cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', '$');
      cy.get('[data-testid="calculator-chart-section"]')
        .contains('a', TCO_SOURCE_TITLE)
        .should('have.attr', 'href', TCO_SOURCE_URL);
    });

    it('displays chart title that updates when metric changes', () => {
      cy.get('[data-testid="calculator-metric-throughput"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Total Token Throughput per Chip');
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Tokens per Provisioned All-in Megawatt');
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Cost per Million');
    });

    // -------------------------------------------------------------------------
    // View toggle and table (reset to throughput + chart view first)
    // -------------------------------------------------------------------------

    it('switching to table view shows the results table', () => {
      cy.get('[data-testid="calculator-metric-throughput"]').click();
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-results-table"]').should('be.visible');
      cy.get('[data-testid="calculator-results-table"] table').should('exist');
      cy.get('[data-testid="calculator-results-table"] tbody tr').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="calculator-bar-chart"]').should('not.exist');
    });

    it('hides the table logo with the unofficial-domain notice', () => {
      cy.contains('This deployment is not hosted at').should('be.visible');
      cy.get('[data-testid="calculator-results-table"] img[src="/brand/logo-color.webp"]').should(
        'not.exist',
      );
    });

    it('results table contains expected column headers', () => {
      cy.get('[data-testid="calculator-results-table"]').within(() => {
        cy.get('thead').should('contain.text', 'Chip');
        cy.get('thead').should('contain.text', 'tok/s/MW');
        cy.get('thead').should('contain.text', 'Concurrency');
      });
    });

    it('table view rows contain numeric throughput and cost values', () => {
      cy.get('[data-testid="calculator-results-table"] tbody tr')
        .first()
        .within(() => {
          cy.get('td').eq(0).invoke('text').should('have.length.greaterThan', 0);
          cy.get('td')
            .eq(1)
            .invoke('text')
            .should('match', /\d+\.\d/u);
          cy.get('td')
            .eq(2)
            .invoke('text')
            .should('match', /\$\d+\.\d/u);
          cy.get('td').eq(3).invoke('text').should('match', /\d+/u);
          cy.get('td').eq(4).invoke('text').should('match', /~\d+/u);
        });
    });

    it('switching back to chart view shows the bar chart', () => {
      cy.get('[data-testid="calculator-chart-view-btn"]').click();
      cy.get('[data-testid="calculator-bar-chart"]').should('be.visible');
    });

    it('table total matches bar count (first page caps at 10 rows)', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .its('length')
        .then((barCount) => {
          cy.get('[data-testid="calculator-table-view-btn"]').click();
          cy.get('[data-testid="calculator-results-table"] tbody tr').should(
            'have.length',
            Math.min(barCount, 10),
          );
          if (barCount > 10) {
            // The pagination footer carries the full result count
            cy.get('[data-testid="calculator-chart-section"]').should(
              'contain.text',
              `of ${barCount}`,
            );
          }
        });
    });

    // -------------------------------------------------------------------------
    // Selector interactions (reset to chart view + throughput)
    // -------------------------------------------------------------------------

    it('model selector has selectable options', () => {
      cy.get('[data-testid="calculator-chart-view-btn"]').click();
      cy.get('[data-testid="calculator-metric-throughput"]').click();
      cy.get('#calc-model').should('not.contain.text', 'Model');
      cy.get('#calc-model').click();
      cy.get('[role="option"]').should('have.length.greaterThan', 0);
      cy.get('body').type('{esc}');
    });

    it('sequence selector has selectable options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-sequence').click('right');
      });
      cy.get('[data-select-option]').should('have.length.greaterThan', 0);
      cy.get('body').type('{esc}');
      // Wait for the preceding popover's focus restoration before opening the next menu.
      cy.get('#calc-sequence').should('be.focused');
    });

    it('cost provider selector appears and has all three options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').click();
      });
      cy.get('[role="option"]').should('have.length', 3);
      cy.get('[role="option"]').eq(0).should('contain.text', 'Hyperscaler');
      cy.get('[role="option"]').eq(1).should('contain.text', 'Neocloud');
      cy.get('[role="option"]').eq(2).should('contain.text', '3yr Rental');
      cy.get('body').type('{esc}');
    });

    it('token type selector has Total, Input, and Output options', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').should('have.length', 3);
      cy.get('[role="option"]').eq(0).should('contain.text', 'Total Tokens');
      cy.get('[role="option"]').eq(1).should('contain.text', 'Input Tokens');
      cy.get('[role="option"]').eq(2).should('contain.text', 'Output Tokens');
      cy.get('body').type('{esc}');
    });

    it('switching token type to Input updates the chart title text', () => {
      cy.get('[data-testid="calculator-chart-section"] h2').first().should('contain.text', 'Total');
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Input Tokens').click();
      cy.get('[data-testid="calculator-chart-section"] h2').first().should('contain.text', 'Input');
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('not.contain.text', 'Total');
    });

    it('switching token type to Output updates the chart title text', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Output Tokens').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Output');
    });

    it('switching token type updates table column headers', () => {
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-results-table"] thead').should(
        'contain.text',
        'Output Throughput',
      );
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost-type').click();
      });
      cy.get('[role="option"]').contains('Total Tokens').click();
      cy.get('[data-testid="calculator-results-table"] thead').should(
        'contain.text',
        'Total Throughput',
      );
      cy.get('[data-testid="calculator-chart-view-btn"]').click();
    });

    it('changing cost provider updates the cost metric chart title', () => {
      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Owning - Hyperscaler');
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('#calc-cost').click();
      });
      cy.get('[role="option"]').contains('Neocloud').click();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'Owning - Neocloud');
    });

    // -------------------------------------------------------------------------
    // Target interactivity slider (reset to throughput)
    // -------------------------------------------------------------------------

    it('slider input value matches the number input value', () => {
      cy.get('[data-testid="calculator-metric-throughput"]').click();
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]')
          .invoke('val')
          .then((sliderVal) => {
            cy.get('input[type="number"]').should('have.value', String(sliderVal));
          });
      });
    });

    it('typing a new value in the number input updates the chart title', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="number"]').clear().type('50');
      });
      cy.get('[data-testid="calculator-controls"] input[type="number"]').blur();
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', '50 tok/s/user');
    });

    it('slider shows min and max range labels', () => {
      cy.get('[data-testid="calculator-controls"]').within(() => {
        cy.get('input[type="range"]')
          .parent()
          .find('.relative.text-muted-foreground span')
          .should('have.length.greaterThan', 0)
          .each(($span) => {
            const text = $span.text().trim();
            expect(Number(text)).to.be.a('number');
            expect(Number.isNaN(Number(text))).to.equal(false);
          });
      });
    });

    // -------------------------------------------------------------------------
    // Legend interactions (fresh visit to reset accumulated state changes)
    // -------------------------------------------------------------------------

    it('legend items have colored dot indicators and text labels', () => {
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
      cy.get('.legend-container li').each(($li) => {
        cy.wrap($li).find('span').first().should('have.css', 'background-color');
        cy.wrap($li).find('label').invoke('text').should('have.length.greaterThan', 0);
      });
    });

    it('toggling a legend item changes visible bar count', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .should('have.length.greaterThan', 1)
        .its('length')
        .then((initialCount) => {
          cy.get('.sidebar-legend label').first().click();
          cy.get('[data-testid="calculator-bar-chart"] svg .bar').should(
            'have.length.lessThan',
            initialCount,
          );
        });
    });

    // -------------------------------------------------------------------------
    // Click-to-compare bars (fresh visit to ensure clean chart state)
    // -------------------------------------------------------------------------

    it('clicking one bar shows a comparison banner with "selected" text', () => {
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 1);
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').first().click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('be.visible');
      cy.get('[data-testid="calculator-comparison-banner"]').should('contain.text', 'selected');
      cy.get('[data-testid="calculator-comparison-banner"]').should(
        'contain.text',
        'Click another bar to compare',
      );
    });

    it('selected bars have higher opacity than unselected bars', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .first()
        .should('have.attr', 'opacity')
        .and('satisfy', (val: string) => parseFloat(val) > 0.5);
      cy.get('[data-testid="calculator-bar-chart"] svg .bar')
        .eq(1)
        .should('have.attr', 'opacity')
        .and('satisfy', (val: string) => parseFloat(val) < 0.5);
    });

    it('clicking two bars shows a comparison ratio', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').eq(1).click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('be.visible');
      cy.get('[data-testid="calculator-comparison-banner"]').should('contain.text', 'x more');
    });

    it('clear selection button dismisses the comparison banner', () => {
      cy.get('[data-testid="calculator-comparison-banner"]').contains('Clear selection').click();
      cy.get('[data-testid="calculator-comparison-banner"]').should('not.exist');
    });

    // -------------------------------------------------------------------------
    // Metric-specific disclaimers (fresh visit to reset accumulated state)
    // -------------------------------------------------------------------------

    it('shows disaggregated throughput disclaimer for throughput metric', () => {
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
      cy.get('[data-testid="calculator-chart-section"]').should(
        'contain.text',
        'Disaggregated inference configurations',
      );
      cy.get('[data-testid="calculator-chart-section"]')
        // The direction is the point of the warning, not the phrasing: on these
        // token types a disaggregated config reads high. Asserting the old wording
        // alone let the note be reworded into something that no longer said which
        // way it was wrong.
        .should('contain.text', 'per prefill chip and per decode chip')
        .and('contain.text', 'reads faster per chip than it is');
    });

    // A disagg config's input/output cost is attributed to only its prefill or
    // decode chips, so those token types carry the caveat. The total-token cost
    // divides by the whole chip count — the same denominator an aggregated
    // config uses — so it must not.
    it('shows the disaggregated cost disclaimer only for per-token-type cost', () => {
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
      cy.get('[data-testid="calculator-metric-cost"]').click();

      // Token type defaults to Total Tokens.
      cy.get('[data-testid="calculator-disagg-cost-note"]').should('not.be.visible');

      for (const tokenType of ['Output Tokens', 'Input Tokens']) {
        cy.get('[data-testid="calc-cost-type-selector"]').click();
        cy.contains('[role="option"]', tokenType).click();
        cy.get('body').type('{esc}');
        cy.get('[data-testid="calculator-disagg-cost-note"]')
          .should('be.visible')
          .and('contain.text', 'per prefill chip and per decode chip')
          // Cheaper, specifically — the flattering direction is what a reader
          // comparing costs needs told.
          .and('contain.text', 'reads cheaper than it is');
      }

      cy.get('[data-testid="calc-cost-type-selector"]').click();
      cy.contains('[role="option"]', 'Total Tokens').click();
      cy.get('body').type('{esc}');
      cy.get('[data-testid="calculator-disagg-cost-note"]').should('not.be.visible');
    });

    it('shows disaggregated throughput disclaimer for power metric', () => {
      cy.get('[data-testid="calculator-metric-power"]').click();
      cy.get('[data-testid="calculator-chart-section"]')
        // The direction is the point of the warning, not the phrasing: on these
        // token types a disaggregated config reads high. Asserting the old wording
        // alone let the note be reworded into something that no longer said which
        // way it was wrong.
        .should('contain.text', 'per prefill chip and per decode chip')
        .and('contain.text', 'reads faster per chip than it is');
    });
  });

  // ---------------------------------------------------------------------------
  // Direct URL navigation (separate visit to verify fresh load)
  // ---------------------------------------------------------------------------

  describe('direct URL navigation', () => {
    it('navigating to /calculator directly loads the calculator tab with data', () => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.url().should('include', '/calculator');
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    // Regression: SSR'd HTML must reflect the URL-supplied model so share links
    // open straight to the right model without a flash of the default. See #430.
    it('?g_model= seeds the model selector before client hydration', () => {
      cy.request('/calculator?g_model=DeepSeek-V4-Pro').then((response) => {
        expect(response.body).to.contain('DeepSeek V4 Pro 0813 1.6T');
        expect(response.body).not.to.contain('DeepSeek R1 0528 671B');
      });
    });

    it('renders the URL-supplied model in the dropdown after navigating', () => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator?g_model=DeepSeek-V4-Pro');
      cy.get('[data-testid="calc-model-selector"]').should(
        'contain.text',
        'DeepSeek V4 Pro 0813 1.6T',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // DeepSeek V4 agentic trace calculations
  // ---------------------------------------------------------------------------

  describe('availability failure degradation', () => {
    it('keeps usable benchmark results visible when availability metadata fails', () => {
      cy.intercept('GET', '/api/v1/availability*', {
        statusCode: 503,
        body: { error: 'temporarily unavailable' },
      }).as('availabilityFailure');

      cy.visit('/calculator');
      cy.wait('@availabilityFailure');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
      cy.get('[data-testid="calculator-controls"]').should('be.visible');
      cy.contains('Error loading calculator data').should('not.exist');
    });
  });

  describe('DeepSeek V4 agentic calculations', () => {
    beforeEach(() => {
      const b300Rows = agenticB300Rows(null);
      const b200Rows = agenticB300Rows(null).map((row) => ({
        ...row,
        hardware: 'b200',
      }));
      cy.intercept('GET', '/api/v1/availability', {
        body: [
          ...agenticAvailability,
          ...agenticAvailability.map((row) => ({ ...row, hardware: 'b200' })),
        ],
      }).as('agenticAvailability');
      cy.intercept('GET', '/api/v1/benchmarks*', { body: [...b300Rows, ...b200Rows] }).as(
        'agenticBenchmarks',
      );
      cy.visit('/calculator?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          // The percentile control sits behind the ↑↑↓↓ gate; unlock it so the
          // specs below can still exercise switching to P75.
          unlockAgenticGate(win);
        },
      });
      cy.wait('@agenticBenchmarks');
    });

    it('renders throughput and cost calculations from null-ISL/OSL agentic rows', () => {
      cy.get('button[data-testid="calc-sequence-selector"]')
        .should('be.visible')
        .and('have.text', 'Agentic')
        .and('be.disabled');
      cy.get('button[data-testid="calc-precision-selector"]')
        .should('have.text', 'FP4')
        .and('be.disabled');
      cy.get('[data-testid="calc-percentile-selector"]').should('contain.text', 'p90');
      cy.get('[data-testid="calculator-no-data"]').should('not.exist');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length', 2);
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'P90 Interactivity');

      cy.get('[data-testid="calculator-metric-cost"]').click();
      cy.get('[data-testid="calculator-bar-chart"] svg .value-label')
        .first()
        .should('contain.text', '$');
    });

    it('recalculates agentic results at P75 and includes it in the share link', () => {
      cy.get('[data-testid="calc-percentile-selector"]').click();
      cy.get('[role="option"]').contains('p75').click();

      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length', 2);
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'P75 Interactivity');
      cy.get('[data-testid="calculator-controls"]').should(
        'contain.text',
        'Target P75 Interactivity',
      );
      cy.get('[data-testid="share-button"]').click();
      cy.get('[data-testid="share-url-input"]').invoke('val').should('include', 'i_pctl=p75');
    });

    it('preserves a soloed GPU when the agentic percentile changes', () => {
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length', 2);

      cy.get('.sidebar-legend label').first().click();
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length', 1);

      cy.get('[data-testid="calc-percentile-selector"]').click();
      cy.get('[role="option"]').contains('p75').click();

      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length', 1);
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'P75 Interactivity');
    });

    // AgentX publishes on P90, so the percentile control is insider-only. With
    // the gate locked it must not render at all, and the calculator must still
    // compute on P90.
    it('hides the percentile selector behind the feature gate and defaults to P90', () => {
      cy.visit('/calculator?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          win.localStorage.removeItem('inferencex-feature-gate');
        },
      });
      cy.wait('@agenticBenchmarks');

      // Scenario and precision stay readable; only percentile is feature-gated.
      cy.get('button[data-testid="calc-sequence-selector"]')
        .should('be.visible')
        .and('have.text', 'Agentic')
        .and('be.disabled');
      cy.get('button[data-testid="calc-precision-selector"]')
        .should('have.text', 'FP4')
        .and('be.disabled');
      cy.get('[data-testid="calc-percentile-selector"]').should('not.exist');
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'P90 Interactivity');
      cy.get('[data-testid="calculator-controls"]').should(
        'contain.text',
        'Target P90 Interactivity',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Cost target: the inverse of the interactivity slider. The MW-budget input
  // lives here now that the Fleet Lifecycle section moved to its own /fleet
  // page — see fleet-lifecycle.cy.ts. Both pages share the `c_mw` URL param.
  // ---------------------------------------------------------------------------

  describe('cost target', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('sits directly under the interactivity slider, since it inverts it', () => {
      // Reading order is the point: the slider fixes a speed and the cost falls
      // out; this fixes the cost and the speed falls out. Anything between them
      // makes the pair read as unrelated.
      cy.get('[data-testid="calculator-costcap-section"]').should('be.visible');
      cy.get('[data-testid="calculator-costcap-empty"]').should('be.visible');
      cy.get('[data-testid="calculator-controls"]').then(($controls) => {
        cy.get('[data-testid="calculator-costcap-section"]').then(($costcap) => {
          const order = $controls[0]!.compareDocumentPosition($costcap[0]!);
          // eslint-disable-next-line no-bitwise
          expect(order & Node.DOCUMENT_POSITION_FOLLOWING).to.be.greaterThan(0);
        });
      });
      cy.get('[data-testid="calculator-chart-section"]').then(($chart) => {
        cy.get('[data-testid="calculator-costcap-section"]').then(($costcap) => {
          const order = $chart[0]!.compareDocumentPosition($costcap[0]!);
          // eslint-disable-next-line no-bitwise
          expect(order & Node.DOCUMENT_POSITION_PRECEDING).to.be.greaterThan(0);
        });
      });
    });

    it('owns the MW budget input now that the lifecycle section moved to /fleet', () => {
      cy.get('[data-testid="calculator-costcap-section"]')
        .find('[data-testid="calc-costcap-mw-input"]')
        .should('have.value', '10');
      cy.get('[data-testid="calculator-lifecycle-section"]').should('not.exist');
      // A pointer to the new page replaces the section.
      cy.get('[data-testid="calculator-fleet-pointer-link"]')
        .should('have.attr', 'href')
        .and('match', /\/fleet$/);
    });

    it('entering a generous cost target renders reachable interactivity per GPU', () => {
      cy.get('[data-testid="calc-costcap-input"]').type('100');
      cy.get('[data-testid="calculator-costcap-table"]').should('be.visible');
      cy.get('[data-testid="calculator-costcap-table"]').within(() => {
        cy.contains('th', 'Max Interactivity (tok/s/user)').should('exist');
        cy.get('tbody tr').should('have.length.greaterThan', 0);
        // At $100/M tok everything is affordable — values must be numeric
        cy.get('tbody tr')
          .first()
          .find('td')
          .eq(1)
          .invoke('text')
          .should('match', /^\d+(?:\.\d+)?$/u);
      });
    });

    it('an unreachably low cost target shows Not reachable rows', () => {
      cy.get('[data-testid="calc-costcap-input"]').clear();
      cy.get('[data-testid="calc-costcap-input"]').type('0.000001');
      cy.get('[data-testid="calculator-costcap-table"]').should('contain.text', 'Not reachable');
    });

    it('cost-cap table follows legend visibility (soloing a GPU filters its rows)', () => {
      cy.get('[data-testid="calc-costcap-input"]').clear();
      cy.get('[data-testid="calc-costcap-input"]').type('100');
      cy.get('[data-testid="calculator-costcap-table"] tbody tr').then(($rows) => {
        const fullCount = $rows.length;
        // Clicking a legend item while all GPUs are visible solos it
        cy.get('.sidebar-legend label').first().click();
        cy.get('[data-testid="calculator-costcap-table"] tbody tr')
          .should('have.length.lessThan', fullCount)
          .and('have.length.greaterThan', 0);
        // Clicking the solo GPU again restores all
        cy.get('.sidebar-legend label').first().click();
        cy.get('[data-testid="calculator-costcap-table"] tbody tr').should(
          'have.length',
          fullCount,
        );
      });
    });
  });

  describe('folding sections away', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit('/calculator');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('folds the chart away, keeping its title as the handle', () => {
      // Folded means unmounted, not hidden: these bodies hold D3 charts, and a
      // reader who folded one should not still be paying to render it.
      cy.get('[data-testid="calculator-chart-collapse"]').click();
      cy.get('[data-testid="calculator-figure"]').should('not.exist');
      // The title only appears in the header once folded — while open the chart's
      // own caption carries it, and two copies would be worse than none.
      cy.get('[data-testid="calculator-chart-section"] h2')
        .should('have.length', 1)
        .and('contain.text', 'Total Token Throughput per Chip');

      cy.get('[data-testid="calculator-chart-collapse"]').click();
      cy.get('[data-testid="calculator-figure"]').should('be.visible');
      cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    });

    it('folds the cost-target section away, keeping its heading as the handle', () => {
      cy.get('[data-testid="calc-costcap-input"]').should('be.visible');
      cy.get('[data-testid="calculator-costcap-collapse"]').click();
      cy.get('[data-testid="calc-costcap-input"]').should('not.exist');
      // The heading stays put, so the folded section still says what it is.
      cy.get('[data-testid="calculator-costcap-section"]').should(
        'contain.text',
        'Interactivity Within a Cost Target',
      );
      cy.get('[data-testid="calculator-costcap-collapse"]').click();
      cy.get('[data-testid="calc-costcap-input"]').should('be.visible');
    });
  });
});

describe('TCO Calculator Chinese route', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    cy.visit('/zh/calculator', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
  });

  it('localizes chart internals, table headers, and preserved units', () => {
    cy.contains('label', '计价方式').should('be.visible');
    cy.get('[data-testid="calculator-secondary-controls"] > button').click();
    cy.contains('label', '目标交互性 (tok/s/user)')
      .parent()
      .find('button')
      .trigger('pointerover', { pointerType: 'mouse' });
    cy.get('[role="dialog"]')
      .should('contain.text', '用于插值计算的交互性目标值。')
      .and('contain.text', '拖动滑块，可比较不同交互性要求下各芯片的吞吐量、成本和能效。');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="calculator-chart-section"]').should('contain.text', '分离式推理配置');
    cy.get('[data-testid="calculator-bar-chart"] svg .x-axis-label-calc').should(
      'contain.text',
      '每芯片吞吐量 (tok/s/chip)',
    );
    cy.get('[data-testid="calculator-bar-chart"]').should('contain.text', 'Shift+滚轮横向缩放');
    cy.get('[data-testid="calculator-bar-chart"] svg .bar')
      .first()
      .trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain.text', '吞吐量：')
      .and('contain.text', '成本：');
    cy.get('[data-testid="calculator-metric-power"]').click();
    cy.get('[data-testid="calculator-cost-badges"]').should('contain.text', '单芯片整机功耗：');
    // At 390px the desktop toolbar is hidden; use the mobile view toggle.
    cy.contains('[role="tab"]:visible', '表格').click();
    cy.get('[data-testid="calculator-results-table"] thead')
      .should('contain.text', '芯片')
      .and('contain.text', '成本 ($/M tok)')
      .and('contain.text', '并发数');
  });

  it('supports the complete chart-to-table path at 1440px', () => {
    cy.viewport(1440, 900);
    cy.reload();
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').first().click();
    cy.get('[data-testid="calculator-comparison-banner"]')
      .should('be.visible')
      .and('contain.text', '已选中。点击其他柱形即可对比。');
    cy.get('[data-testid="calculator-table-view-btn"]').click();
    cy.get('[data-testid="calculator-results-table"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('keeps dense tables internally scrollable without body overflow at 390px', () => {
    // At 390px the desktop toolbar is hidden; use the mobile view toggle.
    cy.contains('[role="tab"]:visible', '表格').click();
    // DataTable renders its horizontal scroller inside the testid wrapper.
    cy.get('[data-testid="calculator-results-table"] .overflow-x-auto')
      .first()
      .then(($scroller) => {
        expect($scroller[0].scrollWidth).to.be.greaterThan($scroller[0].clientWidth);
      });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('keeps the localized chart contained at 375px', () => {
    cy.viewport(375, 812);
    cy.get('[data-testid="calculator-bar-chart"] svg .x-axis-label-calc').should(
      'contain.text',
      '每芯片吞吐量 (tok/s/chip)',
    );
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('emits bidirectional hreflang metadata', () => {
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/calculator');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/calculator');
  });
});
