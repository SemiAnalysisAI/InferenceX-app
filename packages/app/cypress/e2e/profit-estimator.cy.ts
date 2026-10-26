import { interceptVrPublicationData } from '../support/vr-publication-fixtures';

import {
  interceptProfitData,
  profitBenchmarkRows,
  profitNvl72Rows,
  PROFIT_CHANGELOG_NOTES,
  PROFIT_DATE,
  PROFIT_HISTORY_DATE,
  PROFIT_RUN_DATE,
  PROFIT_RUNS,
} from '../support/profit-fixtures';

const OPENROUTER_MODELS = {
  data: [
    {
      id: 'meta/muse-spark-open',
      pricing: { prompt: '0.00000125', completion: '0.00000425', input_cache_read: '0.00000015' },
    },
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
    {
      id: 'deepseek/deepseek-v4.1-flash',
      pricing: { prompt: '0.00000015', completion: '0.0000006', input_cache_read: '0.000000003' },
    },
    {
      id: 'minimax/minimax-m3.1-flash',
      pricing: { prompt: '0.00000015', completion: '0.0000006', input_cache_read: '0.00000003' },
    },
    {
      id: 'qwen/qwen3.5-397b-a17b',
      pricing: { prompt: '0.0000005', completion: '0.0000036', input_cache_read: '0.00000005' },
    },
    {
      id: 'qwen/qwen3.8-flash',
      pricing: { prompt: '0.00000015', completion: '0.00000047', input_cache_read: '0.00000002' },
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

function unlockPowerGate(win: Cypress.AUTWindow): void {
  suppressNudges(win);
  win.localStorage.setItem('inferencex-feature-gate', '1');
}

const chart = () => cy.get('[data-testid="profit-estimator-chart"]');
const chartSvg = () => chart().find('svg').filter(':has(.chart-root)').first();
const bars = () => chart().find('rect.bar');

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

describe('New agentic models on profit estimators', () => {
  for (const [slug, label, dbKey, target] of [
    ['muse-spark-open', 'Muse Spark Open', 'musespark', 85],
    ['minimax-m31-flash', 'MiniMax M3.1 Flash', 'minimaxm31flash', 125],
    ['qwen-3-5', 'Qwen3.5', 'qwen3.5', 115],
    ['qwen-3-8-flash-next', 'Qwen3.8 Flash Next', 'qwen3.8next', 90],
  ] as const) {
    for (const basis of ['profit-estimator', 'profit-estimator-per-gigawatt'] as const) {
      it(`opens ${label} on ${basis} with more measured SKUs than target 45`, () => {
        stubOpenRouter();
        cy.intercept('GET', '/api/v1/benchmarks*', { body: coverageRows(dbKey, target) });
        cy.visit(`/${basis}/${slug}`, { onBeforeLoad: suppressNudges });
        cy.location('pathname').should('eq', `/${basis}/${slug}`);
        cy.get('[data-testid="profit-model-selector"]').should('contain.text', label);
        cy.get('button#profit-price-source').should('contain.text', 'OpenRouter');
        cy.get('[data-testid="profit-target-input"]').should('have.value', String(target));
        chart().find('text.revenue-label').should('have.length', 4);

        cy.get('[data-testid="profit-target-input"]').clear().type('45').blur();
        chart().find('text.revenue-label').should('have.length', 1);
      });
    }
  }
});

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

describe('Profit estimator power option', { testIsolation: true }, () => {
  for (const locale of ['en', 'zh'] as const) {
    it(`keeps available estimates without a per-configuration warning list (${locale})`, () => {
      stubOpenRouter();
      const width = locale === 'en' ? 1280 : 390;
      cy.viewport(width, 900);
      cy.intercept('GET', '/api/v1/benchmarks*', {
        body: profitBenchmarkRows().map((row) => ({
          ...row,
          metrics: {
            ...row.metrics,
            power_valid: row.hardware === 'b300' ? 0 : 1,
            power_metric_schema_version: 2,
            avg_power_w: 500,
            avg_total_gpu_power_w: 4000,
          },
        })),
      });
      cy.visit(`${locale === 'zh' ? '/zh' : ''}/profit-estimator-per-gigawatt?c_power=compare`, {
        onBeforeLoad: unlockPowerGate,
      });
      chart().find('text.revenue-label').should('have.length', 6);
      chart()
        .find('.x-axis')
        .should('not.contain', 'H200')
        .and('contain', 'B300')
        .and('contain', 'GB300');
      cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
      chart().scrollIntoView();
      cy.screenshot(`profit-no-unavailable-list-${locale}`, {
        capture: 'viewport',
        overwrite: true,
      });
    });

    it(`prices DeepSeek Flash partial chassis with a one-line power note and CSV labels (${locale})`, () => {
      stubOpenRouter();
      cy.viewport(locale === 'en' ? 1280 : 393, 900);
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
      cy.visit(
        `${locale === 'zh' ? '/zh' : ''}/profit-estimator-per-gigawatt/deepseek-v41-flash?c_power=modeled`,
        {
          onBeforeLoad: (win) => {
            unlockPowerGate(win);
            win.URL.createObjectURL = (blob) => {
              if (blob instanceof win.Blob) csv = blob;
              return 'blob:profit-csv-test';
            };
            win.HTMLAnchorElement.prototype.click = () => {};
          },
        },
      );
      const label = locale === 'en' ? 'Full-chassis extrapolation' : '整机外推';
      cy.get('#profit-target').should('have.value', '150');
      chart().find('text.revenue-label').should('have.length', 4);
      chart()
        .should('contain', 'GB300')
        .and('contain', 'B200')
        .and('contain', 'B300')
        .and('contain', 'MI355X')
        .and('contain', label);
      cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
      cy.get('[data-testid="profit-power-note"]')
        .should('contain', locale === 'en' ? 'All in Measured' : '整体实测功耗')
        .and('not.contain', locale === 'en' ? 'unmeasured components' : '未实测的组件');
      cy.get('[data-testid="profit-power-assumptions"]').should('not.exist');
      cy.get('[data-testid="profit-power-note"]').then(($note) => {
        const box = $note[0].getBoundingClientRect();
        expect(box.left).to.be.at.least(0);
        expect(box.right).to.be.at.most(locale === 'en' ? 1280 : 393);
      });
      chart().scrollIntoView();
      cy.screenshot(`profit-partial-chassis-${locale}`, { capture: 'viewport', overwrite: true });
      cy.get('[data-testid="export-button"]').first().click();
      cy.get('[data-testid="export-csv-button"]').click();
      cy.then(() => csv!.text()).then((text) => {
        expect(text).to.contain(label);
        expect(text).to.contain(
          locale === 'en' ? 'same per-GPU power and throughput' : '每卡功耗和吞吐量保持不变',
        );
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
  }

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
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });
    chart().find('text.revenue-label').should('have.length', 4);
    cy.get('#profit-power').should('not.exist');
    cy.get('[data-testid="profit-power-note"]').should('not.exist');
    cy.then(() => expect(rawRequests).to.equal(0));
    cy.get('body').type('{uparrow}{uparrow}{downarrow}{downarrow}');
    cy.get('#profit-power').should('contain', 'Compare both');
    chart().find('text.revenue-label').should('have.length', 7);
    cy.window().then((win) => {
      win.localStorage.removeItem('inferencex-feature-gate');
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
    cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
  });

  it('prices GB200 NVL72 trays on measured GPU and Grace-socket power and names the basis', () => {
    stubOpenRouter();
    cy.viewport(1280, 900);
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
    let csv: Blob | undefined;
    cy.visit('/profit-estimator-per-gigawatt?c_power=compare', {
      onBeforeLoad: (win) => {
        unlockPowerGate(win);
        win.URL.createObjectURL = (blob) => {
          if (blob instanceof win.Blob) csv = blob;
          return 'blob:profit-nvl72-csv-test';
        };
        win.HTMLAnchorElement.prototype.click = () => {};
      },
    });
    chart().find('text.revenue-label').should('have.length', 9);
    chart().should('contain', 'GB200').and('contain', 'All in Measured');
    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]').click();
    cy.then(() => csv!.text()).then((text) => {
      expect(text).to.contain('PUE 1.3 (air-cooled chassis) or 1.1 (liquid-cooled NVL72)');
      const rows = text.split('\n').filter((line) => line.startsWith('GB200'));
      expect(rows).to.have.length(2);
      expect(rows.some((row) => row.includes('All in Provisioned'))).to.equal(true);
      expect(rows.some((row) => row.includes('measured GPU board and Grace socket'))).to.equal(
        true,
      );
      expect(text).not.to.contain('regulator');
    });
  });

  for (const locale of ['en', 'zh'] as const) {
    it(`keeps all nine power comparison bars readable and reachable on mobile (${locale})`, () => {
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
      cy.visit(`${locale === 'zh' ? '/zh' : ''}/profit-estimator-per-gigawatt?c_power=compare`, {
        onBeforeLoad: unlockPowerGate,
      });
      chart()
        .find('text.revenue-label')
        .should('have.length', 9)
        .should(($labels) => {
          const boxes = [...$labels].map((label) => label.getBoundingClientRect());
          for (let i = 1; i < boxes.length; i++) {
            expect(
              boxes[i].left - boxes[i - 1].right,
              'space between revenue and margin labels',
            ).to.be.at.least(4);
          }
        });
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
      const scroller = () => chart().find('[data-chart-scroll]');
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
        expect(
          event.defaultPrevented,
          `handled key on ${el.clientWidth}/${el.scrollWidth}`,
        ).to.equal(true);
        expect(el.scrollLeft, 'synchronous scroll').to.be.greaterThan(0);
      });
      scroller().should(($scroll) => expect($scroll[0].scrollLeft).to.be.greaterThan(0));
      scroller().scrollTo('right');
      chart().find('rect.bar-profit').last().should('be.visible');
      chart().find('rect.bar-profit').last().click({ scrollBehavior: false });
      cy.get('[data-chart-tooltip="profit-estimator-chart"]')
        .should('be.visible')
        .and('contain', 'MI355X');
      chartSvg().trigger('click', { force: true, scrollBehavior: false });
      cy.get('[data-chart-tooltip="profit-estimator-chart"]').should('not.be.visible');
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
      cy.screenshot(`profit-dense-${locale}-mobile-left`, { capture: 'viewport', overwrite: true });
      scroller().scrollTo('right');
      cy.screenshot(`profit-dense-${locale}-mobile-right`, {
        capture: 'viewport',
        overwrite: true,
      });
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
          cy.writeFile(
            `cypress/downloads/profit-dense-${locale}.png`,
            exportedPng.split(',')[1],
            'base64',
          );
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
      chartSvg().scrollIntoView({ offset: { top: -70, left: 0 } });
      cy.screenshot(`profit-dense-${locale}-desktop`, { capture: 'viewport', overwrite: true });
    });
  }

  it('keeps the benchmark settings and restores the original chart after unavailable power', () => {
    stubOpenRouter();
    cy.visit('/profit-estimator-per-gigawatt', { onBeforeLoad: unlockPowerGate });
    bars().its('length').should('be.greaterThan', 0);
    chart()
      .invoke('text')
      .then((original) => {
        cy.get('#profit-power').click();
        cy.get('[role="option"]').contains('All in Measured').click();
        cy.get('[data-testid="profit-power-unavailable"]').should('not.exist');
        cy.contains('No SKU can be priced for the current selection.').should('be.visible');
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
      .should('have.length', 9)
      .and('contain.text', 'Muse Spark Open')
      .and('contain.text', 'Kimi K3')
      .and('contain.text', 'GLM5.2/GLM5.3')
      .and('contain.text', 'MiniMax M3')
      .and('contain.text', 'DeepSeek V4 Pro')
      .and('contain.text', 'DeepSeek V4.1 Flash')
      .and('contain.text', 'MiniMax M3.1 Flash')
      .and('contain.text', 'Qwen3.5')
      .and('contain.text', 'Qwen3.8 Flash Next');
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
const chipTrigger = () =>
  cy.get('[data-testid="profit-history-gpu-multiselect"] [role="combobox"]');
const axisLabels = () => chartSvg().find('.x-axis text');
const changelog = () => cy.get('[data-testid="profit-history-changelog"]');
const waitForChart = () => {
  chart().should('exist');
  bars().should('have.length.greaterThan', 0);
};
const pickChip = (label: string) => {
  chipTrigger().click({ force: true });
  cy.get('[role="option"]').contains(label).click();
  cy.get('body').type('{esc}');
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
      cy.request(`${prefix}/profit-estimator-per-gigawatt/qwen-3-5`)
        .its('status')
        .should('eq', 200);
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

describe('Profit Estimator — responsive control panels', () => {
  beforeEach(stubOpenRouter);

  for (const route of ['/profit-estimator', '/profit-estimator-per-gigawatt']) {
    for (const width of [375, 768, 1280, 1440]) {
      it(`keeps benchmark and pricing controls grouped on ${route} at ${width}px`, () => {
        cy.viewport(width, 1000);
        cy.visit(route, { onBeforeLoad: suppressNudges });
        chart().should('exist');
        cy.get('[data-testid="profit-benchmark-panel"]').within(() => {
          cy.get('legend').should('have.text', 'Benchmark Config');
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
          cy.get('legend').should('have.text', 'Pricing Config');
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
        cy.get('[data-testid="profit-pricing-panel"] [data-testid="profit-custom-prices"]')
          .find('input')
          .should('have.length', 3);
        cy.get('[data-testid="profit-pricing-panel"] #profit-cost').should('not.exist');
        cy.get('[data-testid="profit-caption"] [data-testid="profit-tco-badge"] input').should(
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
