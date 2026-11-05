import {
  bars,
  chart,
  chartSvg,
  pickChip,
  stubOpenRouter,
  suppressNudges,
} from '../support/profit-estimator';
import {
  profitBenchmarkRows,
  profitNvl72Rows,
  PROFIT_DATE,
  PROFIT_HISTORY_DATE,
} from '../support/profit-fixtures';

const scroller = () => chart().find('[data-chart-scroll]');

function unlockPowerGate(win: Cypress.AUTWindow): void {
  suppressNudges(win);
  win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
}

describe('Profit estimator power option', { testIsolation: true }, () => {
  it('prices DeepSeek Flash partial chassis with a one-line power note and CSV labels (en)', () => {
    stubOpenRouter();
    cy.viewport(1280, 900);
    cy.intercept('GET', '/api/v1/benchmarks*', {
      body: profitBenchmarkRows('dsv41flash').map((row) => {
        const gpus = row.hardware === 'b300' ? 2 : 4;
        return {
          ...row,
          prefill_tp: gpus,
          decode_tp: gpus,
          num_prefill_gpu: gpus,
          num_decode_gpu: gpus,
          metrics: {
            ...row.metrics,
            power_valid: 1,
            power_metric_schema_version: 2,
            avg_power_w: 500,
            avg_total_gpu_power_w: 500 * gpus,
          },
        };
      }),
    });
    let csv: Blob | undefined;
    cy.visit('/profit-estimator-per-gigawatt/deepseek-v41-flash?c_power=modeled', {
      onBeforeLoad: (win) => {
        unlockPowerGate(win);
        win.URL.createObjectURL = (blob) => {
          if (blob instanceof win.Blob) csv = blob;
          return 'blob:profit-csv-test';
        };
        win.HTMLAnchorElement.prototype.click = () => {};
      },
    });
    const label = 'Full-chassis extrapolation';
    cy.get('#profit-target').should('have.value', '150');
    chart().find('text.revenue-label').should('have.length', 4);
    chart()
      .should('contain', 'GB300')
      .and('contain', 'B200')
      .and('contain', 'B300')
      .and('contain', 'MI355X')
      .and('contain', label);
    cy.get('[data-testid="profit-power-note"]')
      .should('contain', 'All in Measured')
      .and('not.contain', 'unmeasured components');
    cy.get('[data-testid="profit-power-assumptions"]').should('not.exist');
    cy.get('[data-testid="profit-power-note"]').then(($note) => {
      const box = $note[0].getBoundingClientRect();
      expect(box.left).to.be.at.least(0);
      expect(box.right).to.be.at.most(1280);
    });
    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]').click();
    cy.then(() => csv!.text()).then((text) => {
      expect(text).to.contain(label);
      expect(
        text
          .split('\n')
          .filter(
            (line) =>
              line.startsWith('GB300') ||
              line.startsWith('B200') ||
              line.startsWith('B300') ||
              line.startsWith('MI355X'),
          ),
      ).to.have.length(4);
    });
  });

  it('ignores power URL overrides while locked and returns to provisioned estimates on relock', () => {
    stubOpenRouter();
    let rawRequests = 0;
    cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
      if (req.query['view'] !== 'calculator') rawRequests++;
      req.reply({
        body: profitBenchmarkRows().map((row) => ({
          ...row,
          metrics: {
            ...row.metrics,
            power_valid: 1,
            power_metric_schema_version: 2,
            avg_power_w: 500,
            avg_total_gpu_power_w: 4000,
          },
        })),
      });
    });
    cy.visit('/profit-estimator-per-gigawatt?c_power=compare', {
      onBeforeLoad: (win) => {
        suppressNudges(win);
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    });
    chart().find('text.revenue-label').should('have.length', 4);
    cy.get('#profit-power').should('not.exist');
    cy.get('[data-testid="profit-power-note"]').should('not.exist');
    cy.then(() => expect(rawRequests).to.equal(0));
    cy.get('body').type(
      '{uparrow}{uparrow}{downarrow}{downarrow}{leftarrow}{rightarrow}{leftarrow}{rightarrow}BA',
    );
    cy.get('#profit-power').should('contain', 'Compare both');
    chart().find('text.revenue-label').should('have.length', 7);
    cy.window().then((win) => {
      win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      win.dispatchEvent(new Event('inferencex:feature-gate:locked'));
    });
    cy.get('#profit-power').should('not.exist');
    cy.get('[data-testid="profit-power-note"]').should('not.exist');
    chart().find('text.revenue-label').should('have.length', 4);
  });

  for (const currentValid of [true, false]) {
    it(`keeps historical provisioned bars when measured power is unavailable (${currentValid ? 'with current bars' : 'provisioned bars only'})`, () => {
      stubOpenRouter();
      cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
        const historical = req.query['date'] === PROFIT_HISTORY_DATE;
        const rows = profitBenchmarkRows(
          'kimik3',
          historical ? PROFIT_HISTORY_DATE : PROFIT_DATE,
        ).filter((row) => row.hardware === 'b200' || (historical && row.hardware === 'b300'));
        req.reply({
          body: rows.map((row) => ({
            ...row,
            metrics: {
              ...row.metrics,
              power_valid: !historical && currentValid ? 1 : 0,
              power_metric_schema_version: 2,
              avg_power_w: 500,
              avg_total_gpu_power_w: 4000,
            },
          })),
        });
      });
      cy.visit(
        `/profit-estimator-per-gigawatt?c_power=compare&i_gpus=b200_sglang,b300_vllm&i_dstart=${PROFIT_HISTORY_DATE}&i_dend=${PROFIT_HISTORY_DATE}`,
        { onBeforeLoad: unlockPowerGate },
      );
      chart()
        .find('text.revenue-label')
        .should('have.length', currentValid ? 4 : 3);
    });
  }

  it('loads full telemetry and compares matching hardware when opened from a share URL', () => {
    stubOpenRouter();
    cy.intercept('GET', '/api/v1/benchmarks*', (req) => {
      const rows = profitBenchmarkRows();
      if (req.query['view'] === 'calculator') {
        req.reply({ body: rows });
      } else {
        req.alias = 'power-rows';
        req.reply({
          body: rows.map((row) => ({
            ...row,
            metrics: {
              ...row.metrics,
              power_valid: 1,
              power_metric_schema_version: 2,
              avg_power_w: 500,
              avg_total_gpu_power_w: 4000,
            },
          })),
        });
      }
    });
    cy.visit('/profit-estimator-per-gigawatt?c_power=compare', { onBeforeLoad: unlockPowerGate });
    cy.wait('@power-rows').its('request.query').should('not.have.property', 'view');
    cy.get('#profit-power').should('contain', 'Compare both');
    cy.get('#profit-target').should('have.value', '60');
    chart().find('text.revenue-label').should('have.length', 7);
    chart().should('contain', 'B200').and('contain', 'B300').and('contain', 'MI355X');
    chart().should('contain', 'All in Measured').and('contain', 'All in Provisioned');
  });

  it('keeps all nine power comparison bars readable and reachable on mobile (en)', () => {
    stubOpenRouter();
    cy.viewport(390, 900);
    cy.intercept('GET', '/api/v1/benchmarks*', {
      body: [
        ...profitBenchmarkRows().map((row) => ({
          ...row,
          metrics: {
            ...row.metrics,
            power_valid: 1,
            power_metric_schema_version: 2,
            avg_power_w: 500,
            avg_total_gpu_power_w: 4000,
          },
        })),
        ...profitNvl72Rows(),
      ],
    });
    cy.visit('/profit-estimator-per-gigawatt?c_power=compare', {
      onBeforeLoad: unlockPowerGate,
    });
    chart().find('text.revenue-label').should('have.length', 9);
    chart()
      .find('image.bar-vendor-mark')
      .should(($marks) => {
        const boxes = [...$marks].map((mark) => mark.getBoundingClientRect());
        for (let i = 1; i < boxes.length; i++) {
          expect(boxes[i].left - boxes[i - 1].right, 'space between vendor marks').to.be.at.least(
            4,
          );
        }
      });
    scroller().should('have.attr', 'tabindex', '0').and('have.attr', 'role', 'region');
    scroller()
      .scrollIntoView({ offset: { top: -70, left: 0 } })
      .focus()
      .should('have.focus');
    scroller().then(($scroll) => {
      const el = $scroll[0];
      const event = new el.ownerDocument.defaultView!.KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      expect(event.defaultPrevented, `handled key on ${el.clientWidth}/${el.scrollWidth}`).to.equal(
        true,
      );
      expect(el.scrollLeft, 'synchronous scroll').to.be.greaterThan(0);
    });
    scroller().should(($scroll) => expect($scroll[0].scrollLeft).to.be.greaterThan(0));
    scroller().scrollTo('right');
    chart().find('rect.bar-profit').last().should('be.visible');
    chart().find('rect.bar-profit').last().click({ scrollBehavior: false });
    cy.get('[data-chart-tooltip="profit-estimator-chart"]').should('not.be.visible');
    cy.get('[data-testid="point-details-panel"]').should('be.visible').and('contain', 'MI355X');
    chartSvg().trigger('click', { force: true, scrollBehavior: false });
    cy.get('[data-testid="point-details-panel"]').should('not.exist');
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(390);
    });
    cy.get('[data-testid="profit-caption"]').should(($caption) => {
      const bounds = $caption[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      expect(bounds.right).to.be.at.most(390);
    });
    scroller()
      .scrollIntoView({ offset: { top: -70, left: 0 } })
      .scrollTo('left');
    chart().find('rect.bar-tco').first().should('be.visible');
    scroller().scrollTo('right');
    let exportedPng = '';
    let exportedLabels: string[] = [];
    cy.window().then((win) => {
      win.HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith('.png')) {
          exportedPng = this.href;
          exportedLabels = [
            ...win.document.querySelectorAll('#profit-estimator-chart-export text.revenue-label'),
          ].map((label) => label.textContent ?? '');
        }
      };
    });
    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-png-button"]').click();
    cy.window()
      .should(() => expect(exportedPng).to.match(/^data:image\/png;base64,/u))
      .then((win) => {
        expect(exportedLabels).to.have.length(9);
        cy.writeFile('cypress/downloads/profit-dense-en.png', exportedPng.split(',')[1], 'base64');
        return new Cypress.Promise<void>((resolve, reject) => {
          const png = new win.Image();
          png.addEventListener('load', () => {
            expect(png.naturalWidth).to.be.greaterThan(1500);
            resolve();
          });
          png.addEventListener('error', () => reject(new Error('Profit PNG did not decode')));
          png.src = exportedPng;
        });
      });
    scroller().should(($scroll) => expect($scroll[0].scrollLeft).to.be.greaterThan(0));
    cy.viewport(1280, 900);
    scroller().should('not.have.attr', 'tabindex');
    scroller().should(($scroll) => {
      expect($scroll[0].scrollWidth).to.equal($scroll[0].clientWidth);
    });
    chart().find('text.revenue-label').should('have.length', 9);
  });

  it('keeps the benchmark settings and restores the original chart after unavailable power', () => {
    stubOpenRouter();
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: unlockPowerGate });
    bars().its('length').should('be.greaterThan', 0);
    chart()
      .invoke('text')
      .then((original) => {
        cy.get('#profit-power').click();
        cy.get('[role="option"]').contains('All in Measured').click();
        cy.contains('No SKU can be priced for the current selection').should('be.visible');
        cy.get('#profit-target').should('have.value', '60');
        cy.get('[data-testid="profit-model-selector"]').should('contain', 'Kimi K3');
        cy.get('[data-testid="profit-price-source-selector"]').should('contain', 'Moonshot');
        cy.get('[data-testid="profit-estimator-chart"]').should('not.exist');
        cy.get('#profit-power').click();
        cy.get('[role="option"]').contains('All in Provisioned').click();
        bars().its('length').should('be.greaterThan', 0);
        chart().should('have.text', original);
      });
  });
});

describe('Profit Estimator — responsive control panels', () => {
  beforeEach(stubOpenRouter);

  for (const route of ['/profit-estimator']) {
    for (const width of [375, 768, 1280]) {
      it(`keeps benchmark and pricing controls grouped on ${route} at ${width}px`, () => {
        cy.viewport(width, 1000);
        cy.visit(route, { onBeforeLoad: suppressNudges });
        chart().should('exist');
        cy.get('[data-testid="profit-benchmark-panel"]').within(() => {
          cy.get('legend').should('have.text', 'Benchmark config');
          cy.get('#profit-model').should('contain.text', 'Kimi K3');
          cy.get('#profit-target').should('have.value', '60');
        });
        cy.get('[data-testid="profit-controls"]').should(($controls) => {
          const bounds = (selector: string) => $controls.find(selector)[0]!.getBoundingClientRect();
          const model = bounds('#profit-model');
          const target = bounds('#profit-target');
          const cache = bounds('#profit-cache-hit');
          const pricing = bounds('#profit-price-source');
          if (width >= 768) {
            expect(Math.abs(model.bottom - target.bottom), 'model/target aligned').to.be.lessThan(
              2,
            );
            expect(Math.abs(target.bottom - cache.bottom), 'target/cache aligned').to.be.lessThan(
              2,
            );
            expect(target.left, 'target beside model').to.be.greaterThan(model.right);
            expect(cache.left, 'cache beside target').to.be.greaterThan(target.right);
          } else {
            expect(target.top, 'target below model').to.be.greaterThan(model.bottom);
            expect(cache.top, 'cache below target').to.be.greaterThan(target.bottom);
          }
          if (width >= 1280) {
            expect(Math.abs(cache.bottom - pricing.bottom), 'pricing aligned').to.be.lessThan(2);
            expect(pricing.left, 'pricing beside benchmark').to.be.greaterThan(cache.right);
          }
          const history = bounds('[data-testid="profit-history-panel"]');
          const chip = bounds('#profit-history-gpu');
          expect(history.right - chip.right, 'no empty history column').to.be.lessThan(24);
        });
        cy.get('[data-testid="profit-pricing-panel"]').within(() => {
          cy.get('legend').should('have.text', 'Pricing config');
          cy.get('#profit-price-source').click();
        });
        cy.get('[data-testid="result-context-utilization"] #profit-utilization').should(
          'have.value',
          '60',
        );
        cy.get('[data-testid="result-context-license-fee"] #profit-lab-cut').should(
          'have.value',
          '30',
        );
        cy.contains('[role="option"]', 'Custom $/M tok').click();
        cy.get('#profit-price-source').should('have.focus');
        cy.get('[data-testid="profit-pricing-panel"] [data-testid="profit-custom-prices"]')
          .find('input')
          .should('have.length', 3);
        cy.get('[data-testid="profit-pricing-panel"] #profit-cost').should('not.exist');
        cy.get('[data-testid="profit-footer"] [data-testid="profit-tco-badge"] input').should(
          'have.length.greaterThan',
          0,
        );
        cy.get('[data-testid="profit-controls"]').should(($controls) => {
          const benchmark = $controls
            .find('[data-testid="profit-benchmark-panel"]')[0]!
            .getBoundingClientRect();
          const pricing = $controls
            .find('[data-testid="profit-pricing-panel"]')[0]!
            .getBoundingClientRect();
          if (width >= 1280) {
            expect(pricing.top - benchmark.bottom, 'custom prices on a full row').to.be.at.least(
              15,
            );
            expect(Math.abs(benchmark.width - pricing.width), 'full-width pricing').to.be.lessThan(
              2,
            );
          } else {
            expect(pricing.top - benchmark.bottom, 'stacked panels').to.be.at.least(15);
          }
          for (const panel of $controls.find('fieldset')) {
            const bounds = panel.getBoundingClientRect();
            expect(bounds.left).to.be.at.least(0);
            expect(bounds.right).to.be.at.most(width);
            for (const control of panel.querySelectorAll('input, button[role="combobox"]')) {
              const rect = control.getBoundingClientRect();
              expect(rect.left, `${control.id} left`).to.be.at.least(bounds.left);
              expect(rect.right, `${control.id} right`).to.be.at.most(bounds.right);
              expect(rect.height, `${control.id} height`).to.be.at.least(width < 768 ? 44 : 36);
            }
          }
        });
        cy.get('#profit-utilization').clear().type('50').blur();
        cy.get('[data-testid="result-context-utilization"]').should('have.text', '50%');
        cy.get('#profit-price-source').click();
        cy.contains('[role="option"]', 'Moonshot list price').click();
        cy.get('[data-testid="profit-custom-prices"]').should('not.exist');
        pickChip('GB300');
        cy.get('[data-testid="profit-history-date-range"]').should('be.visible');
        cy.get('[data-testid="profit-history-panel"]').should(($panel) => {
          const chip = $panel.find('#profit-history-gpu')[0]!.getBoundingClientRect();
          const dates = $panel
            .find('[data-testid="profit-history-date-range"]')[0]!
            .getBoundingClientRect();
          if (width >= 768) {
            expect(dates.left, 'date range beside chip').to.be.greaterThan(chip.right);
          } else {
            expect(dates.top, 'date range below chip').to.be.greaterThan(chip.bottom);
          }
        });
      });
    }
  }
});
