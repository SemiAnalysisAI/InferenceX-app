import {
  singleTurnRows,
  OVERLAY_RUN_ID,
  OVERLAY_RUN_URL,
  SINGLE_TURN_DATE,
} from '../support/overlay-fixtures';
import { expectNoPageOverflow, selectXAxisMode, unlockAgenticGate } from '../support/e2e';

const selection =
  'g_model=DeepSeek-V4-Pro&i_seq=1k%2F1k&i_prec=fp4&i_optimal=0&i_best=0&i_scale=linear';
const powerMetric = 'y_measuredAvgPower';
const energyMetric = 'y_measuredJPerOutputToken';
const comparison = '[data-testid="powerx-comparison"]';
const table = '[data-testid="powerx-iso-table"]';
const availability = '[data-testid="power-metric-availability"]';
const officialPoints = '[data-testid="inference-chart-display"] svg .dot-group';
const overlayPoints = '[data-testid="inference-chart-display"] svg .unofficial-overlay-pt';
const curves = '[data-testid="inference-chart-display"] .roofline-path';

const rows = (hardware = 'h200') =>
  singleTurnRows(null, { hardware })
    .slice(0, 2)
    .map((row, index) => ({
      ...row,
      metrics: {
        ...row.metrics,
        median_intvty: [50, 100][index],
        median_itl: 1 / [50, 100][index],
        median_ttft: [1, 2][index],
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_power_w: [400, 300][index],
        p75_power_w: [450, 350][index],
        p90_power_w: [475, 375][index],
        joules_per_output_token: [400, 600][index],
        output_tput_per_gpu: [100, 50][index],
      },
    }));

function intercept(body = rows()) {
  cy.intercept('GET', '/api/v1/availability', { body });
  cy.intercept('GET', '/api/v1/benchmarks*', { body }).as('powerxRows');
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [] },
  });
}

function selectFamily(family: 'Power' | 'Energy') {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($button) => {
    if ($button.is(':visible') && $button.attr('aria-expanded') !== 'true')
      cy.wrap($button).click();
  });
  cy.get('[data-testid="yaxis-metric-selector"]').click('right');
  cy.contains('[data-slot="select-item"]', new RegExp(`^Measured ${family}$`, 'u'))
    .scrollIntoView()
    .click();
  cy.get('[data-testid="yaxis-metric-selector"]').should('contain', `Measured ${family}`);
}

function selectBoundary(family: 'power' | 'energy', boundary: string) {
  cy.get(`[data-testid="measured-${family}-boundary"]`).click();
  cy.get(`[data-slot="select-item"][data-value="${boundary}"]`).click();
}

function openComparison() {
  cy.get(`${comparison} details`).then(($details) => {
    if (!$details.prop('open')) cy.wrap($details).find('summary').click();
  });
}

function expectPointValues(selector: string, expected: number[]) {
  cy.get<SVGElement & { __data__: { y: number } }>(selector).should(($points) => {
    expect(
      [...$points]
        .filter((point) => point.style.opacity !== '0')
        .map((point) => point.__data__.y)
        .sort((a, b) => a - b),
    ).to.deep.equal(expected);
  });
}

function expectIso(value: number) {
  cy.get(`${table} tbody tr[data-iso-value]`).should(($rows) => {
    expect($rows).to.have.length(1);
    expect(Number($rows[0].dataset.isoValue)).to.be.closeTo(value, 0.02);
  });
}

describe('PowerX within the existing measured dashboards', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    intercept();
  });

  it('unlocks the existing measured families and adds their boundary control in place', () => {
    cy.visit(`/inference?${selection}`, {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    });
    cy.wait('@powerxRows');
    cy.get('[data-testid="yaxis-metric-selector"]').click('right');
    cy.contains('[data-slot="select-item"]', /^Measured Power$/u).should('not.exist');
    cy.contains('[data-slot="select-item"]', /^Measured Energy$/u).should('not.exist');
    cy.get('[data-slot="select-item"][data-value="y_tpPerGpu"]').click();
    cy.get('body').type('{uparrow}{uparrow}{downarrow}{downarrow}');
    selectFamily('Power');
    cy.get('[data-testid="measured-power-boundary"]').should('contain', 'GPU measured');
    cy.get('[data-testid="measured-power-scope"]').should('contain', 'All GPUs');
    cy.get('[data-testid="measured-power-statistic-average"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="measured-power-display"]').should('contain', 'W/chip');
    openComparison();
    expectIso(350);
    expectPointValues(officialPoints, [300, 400]);
    selectFamily('Energy');
    cy.get('[data-testid="measured-energy-boundary"]').should('contain', 'GPU measured');
    cy.get('[data-testid="measured-energy-denominator"]').should('contain', 'Output token');
    cy.get('[data-testid="measured-energy-unit"]').should('contain', 'J');
    expectPointValues(officialPoints, [400, 600]);
    cy.location('pathname').should('eq', '/inference');
    cy.get('[data-testid="powerx-feature"]').should('not.exist');
    cy.get('[data-testid="gpu-metrics-run-input"]').should('not.exist');
  });

  it('selects four boundaries inside both measured families and carries the selected basis', () => {
    cy.visit(`/inference?${selection}&g_rundate=${SINGLE_TURN_DATE}&i_metric=${powerMetric}`, {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.wait('@powerxRows');
    openComparison();
    expectIso(350);
    for (const [basis, watts, joules] of [
      ['gpu-provisioned', 700, 14],
      ['utility-provisioned', 1370, 27.4],
    ] as const) {
      selectBoundary('power', basis);
      expectPointValues(officialPoints, [watts, watts]);
      expectIso(watts);
      cy.get('[data-testid="measured-power-scope"]').should('not.exist');
      cy.get('[data-testid="measured-boundary-assumptions"]').should('be.visible');
      selectFamily('Energy');
      cy.get('[data-testid="measured-energy-boundary"]').should(
        'contain',
        basis === 'gpu-provisioned' ? 'GPU provisioned' : 'All-in utility provisioned',
      );
      expectPointValues(officialPoints, [joules / 2, joules]);
      expectIso(joules * 0.75);
      selectFamily('Power');
    }
    selectBoundary('power', 'utility-modeled');
    cy.get('[data-testid="measured-power-boundary"]').should('contain', 'All-in utility modeled');
    cy.get('[data-testid="measured-boundary-assumptions"]').should('contain', 'modeled');
    cy.get(officialPoints).should('not.exist');
    cy.get(`${table} tbody tr[data-iso-value]`).should('not.exist');
    selectFamily('Energy');
    cy.get('[data-testid="measured-energy-boundary"]').should('contain', 'All-in utility modeled');
    cy.get(officialPoints).should('not.exist');
    selectBoundary('energy', 'gpu-measured');
    expectPointValues(officialPoints, [400, 600]);
    cy.get('[data-testid="measured-energy-denominator"]').should('contain', 'Output token');
    cy.get('[data-testid="model-selector"]').should('contain', 'DeepSeek V4 Pro');
    cy.get('[data-testid="scenario-selector"]').should('contain', '1K / 1K');
    cy.get('[data-testid="precision-multiselect"]').should('contain', 'FP4');
    expectNoPageOverflow();
  });

  it('preserves legacy measured data and the existing percentile and TDP controls', () => {
    const body = rows();
    delete (body[0].metrics as Record<string, number>).power_valid;
    delete (body[0].metrics as Record<string, number>).power_metric_schema_version;
    intercept(body);
    cy.visit(`/inference?${selection}&i_metric=${powerMetric}`, {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.wait('@powerxRows');
    expectPointValues(officialPoints, [300, 400]);
    cy.get('.legacy-power-ring').should('have.length', 1);
    cy.get(availability).should('contain', '2 of 2 points have this metric');
    cy.get('[data-testid="measured-power-statistic-p75"]').click();
    // Native synchronized percentiles require a validated schema-2 measurement.
    expectPointValues(officialPoints, [350]);
    openComparison();
    cy.get('[data-testid="powerx-iso"]').clear().type('100');
    expectIso(350);
    cy.get('[data-testid="measured-power-statistic-p90"]').click();
    expectPointValues(officialPoints, [375]);
    cy.get('[data-testid="measured-power-statistic-average"]').click();
    cy.get('[data-testid="measured-power-display"]').click();
    cy.get('[data-slot="select-item"][data-value="tdp"]').click();
    cy.get('[data-testid="chart-figure"] h2').should('contain', 'TDP');
    cy.get('[data-testid="measured-power-boundary"]').should('contain', 'GPU measured');
    selectBoundary('power', 'gpu-provisioned');
    expectPointValues(officialPoints, [700, 700]);
    selectBoundary('power', 'gpu-measured');
    expectPointValues(officialPoints, [300, 400]);
    cy.get('.legacy-power-ring').should('have.length', 1);
  });

  it('retains hardware filters and the selected boundary in a locked shared link', () => {
    intercept([...rows(), ...rows('b200')]);
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}`, {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.wait('@powerxRows');
    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B200"]')
      .first()
      .click();
    openComparison();
    cy.get(table).should('contain', 'H200').and('not.contain', 'B200');
    cy.get('[data-testid="powerx-iso"]').clear().type('80');
    expectIso(520);
    selectBoundary('energy', 'gpu-provisioned');
    cy.get('[data-testid="chart-legend"] [title^="Show B200"]').should('exist');
    expectPointValues(officialPoints, [7, 14]);
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.pathname).to.equal('/inference');
        expect(url.searchParams.get('i_metric')).to.equal('y_powerxGpuProvisionedEnergy');
        expect(url.searchParams.get('i_iso')).to.equal('80');
        expect(url.searchParams.get('i_active')).to.include('h200');
        expect(url.searchParams.get('i_active')).not.to.include('b200');
        cy.visit(url.href, {
          onBeforeLoad(win) {
            win.localStorage.removeItem('inferencex-feature-gate');
          },
        });
      });
    openComparison();
    cy.get('[data-testid="tab-trigger-hidden"]').should('not.exist');
    cy.get('[data-testid="measured-energy-boundary"]').should('contain', 'GPU provisioned');
    cy.get('[data-testid="powerx-iso"]').should('have.value', '80');
    cy.get(table).should('contain', 'H200').and('not.contain', 'B200');
    expectIso(11.2);
    cy.get('[data-testid="scenario-selector"]').should('contain', '1K / 1K');
    cy.get('[data-testid="precision-multiselect"]').should('contain', 'FP4');
  });

  it('automatically includes new live points without changing the measured dashboard', () => {
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}`);
    cy.wait('@powerxRows');
    cy.get(availability).should('contain', '2 of 2 points have this metric');
    const body = rows();
    body.push({
      ...body[1],
      id: 99991,
      conc: 16,
      metrics: {
        ...body[1].metrics,
        median_intvty: 120,
        median_itl: 1 / 120,
        joules_per_output_token: 800,
      },
    });
    cy.intercept('GET', '/api/v1/benchmarks*', { body }).as('newRows');
    cy.tick(300_000);
    cy.wait('@newRows');
    cy.get(availability).should('contain', '3 of 3 points have this metric');
    cy.get('[data-testid="yaxis-metric-selector"]').should('contain', 'Measured Energy');
    expectPointValues(officialPoints, [400, 600, 800]);
    openComparison();
    cy.get('[data-testid="powerx-iso"]').clear().type('120');
    expectIso(800);
  });

  it('keeps historical snapshots pinned and clears ISO targets when axis units change', () => {
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);
    cy.visit(`/inference?${selection}&g_rundate=${SINGLE_TURN_DATE}&i_metric=${energyMetric}`);
    cy.wait('@powerxRows');
    openComparison();
    expectIso(500);
    const body = rows();
    body[1].metrics.joules_per_output_token = 800;
    cy.intercept('GET', '/api/v1/benchmarks*', { body }).as('correctedSnapshot');
    cy.tick(300_000);
    cy.get('@correctedSnapshot.all').should('have.length', 0);
    expectIso(500);
    selectXAxisMode('ttft');
    cy.get('[data-testid="powerx-iso"]').should('have.value', '');
    cy.get('[data-testid="chart-figure"] h2').should('contain', 'Time To First Token');
    cy.get('[data-testid="powerx-iso"]').type('1');
    expectIso(400);
  });

  it('compares visible unofficial runs and removes their ISO rows on dismiss', () => {
    const benchmarkRows = rows().map((row) => ({
      ...row,
      run_url: OVERLAY_RUN_URL,
      metrics: {
        ...row.metrics,
        joules_per_output_token: row.metrics.joules_per_output_token + 100,
      },
    }));
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: OVERLAY_RUN_ID,
            name: 'powerx-test',
            branch: 'powerx-test',
            sha: 'abc000',
            createdAt: `${SINGLE_TURN_DATE}T00:00:00Z`,
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: benchmarkRows,
        evaluations: [],
      },
    }).as('powerxOverlay');
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}&unofficialrun=${OVERLAY_RUN_ID}`);
    cy.wait('@powerxOverlay');
    openComparison();
    cy.get(`${table} tbody tr[data-iso-value]`).should(($rows) => {
      const values = Array.from($rows, (row) => Number(row.dataset.isoValue)).sort();
      expect(values).to.have.length(2);
      expect(values[0]).to.be.closeTo(500, 0.02);
      expect(values[1]).to.be.closeTo(600, 0.02);
    });
    expectPointValues(officialPoints, [400, 600]);
    expectPointValues(overlayPoints, [500, 700]);
    cy.get('button[aria-label="Dismiss powerx-test"]').click();
    expectIso(500);
    cy.get(overlayPoints).should('not.exist');
    expectPointValues(officialPoints, [400, 600]);
  });

  it('explains invalid and missing measurements without zero-filling on Chinese mobile', () => {
    const body = rows();
    body.push(
      {
        ...body[0],
        id: 99992,
        conc: 16,
        metrics: {
          ...body[0].metrics,
          median_intvty: 75,
          median_itl: 1 / 75,
          power_valid: 0,
          joules_per_output_token: 500,
        },
      },
      {
        ...body[1],
        id: 99993,
        conc: 32,
        metrics: { ...body[1].metrics, median_intvty: 85, median_itl: 1 / 85 },
      },
    );
    delete (body[3].metrics as Record<string, number>).joules_per_output_token;
    intercept(body);
    cy.viewport(390, 844);
    cy.visit(`/zh/inference?${selection}&i_metric=${energyMetric}`);
    cy.wait('@powerxRows');
    cy.get(availability)
      .should('contain', '4 个数据点中有 2 个提供此指标')
      .and('contain', '验证失败: 1')
      .and('contain', '未提供此指标: 1');
    cy.get('[data-testid="measured-energy-boundary"]').should('contain', 'GPU 实测');
    expectPointValues(officialPoints, [400, 600]);
    openComparison();
    cy.get('[data-testid="powerx-iso"]').clear().type('50');
    expectIso(400);
    cy.get(table)
      .parent()
      .should('have.css', 'overflow-x', 'auto')
      .and(($container) => {
        expect($container[0].scrollWidth).to.be.greaterThan($container[0].clientWidth);
      });
    expectNoPageOverflow();
    cy.get('[data-testid="inference-secondary-controls"] > button').then(($button) => {
      if ($button.attr('aria-expanded') !== 'true') cy.wrap($button).click();
    });
    cy.get('[data-testid="measured-energy-boundary"]').should('be.visible');
    selectBoundary('energy', 'gpu-provisioned');
    cy.get('[data-testid="measured-energy-boundary"]').should('contain', 'GPU 额定');
    expectPointValues(officialPoints, [7, 7, 14, 14]);
    selectBoundary('energy', 'gpu-measured');
    expectPointValues(officialPoints, [400, 600]);
    cy.get('[data-testid="measured-metric-controls"]').scrollIntoView({
      offset: { top: -80, left: 0 },
    });
    cy.screenshot('powerx-measured-mobile-zh-controls', { capture: 'viewport' });
    cy.get(comparison).scrollIntoView({ offset: { top: -80, left: 0 } });
    cy.screenshot('powerx-measured-mobile-zh-iso', { capture: 'viewport' });
  });

  it('reads ISO from the native curve, preserves Optimal Only geometry, and never extrapolates', () => {
    const body = rows();
    body[0].metrics.avg_power_w = 500;
    body[1].metrics.avg_power_w = 300;
    body.push({
      ...body[0],
      id: 99994,
      conc: 16,
      metrics: { ...body[0].metrics, median_intvty: 75, median_itl: 1 / 75, avg_power_w: 450 },
    });
    intercept(body);
    cy.visit(`/inference?${selection}&i_metric=${powerMetric}`);
    cy.wait('@powerxRows');
    openComparison();
    cy.get('[data-testid="powerx-iso"]').clear().type('65');
    cy.get(curves).should('have.length', 1).and('have.attr', 'data-curve-kind', 'power-envelope');
    cy.get(curves).invoke('attr', 'd').should('contain', 'C');
    cy.get(`${table} tbody tr[data-iso-value]`).should(($rows) => {
      const document = $rows[0].ownerDocument;
      const path = document.querySelector<SVGPathElement>(curves)!;
      const points = [
        ...document.querySelectorAll<
          SVGGElement & {
            __data__: {
              x: number;
              y: number;
            };
          }
        >(officialPoints),
      ].sort((a, b) => a.__data__.x - b.__data__.x);
      const [first, last] = [points[0], points.at(-1)!];
      const firstPixel = first.transform.baseVal.consolidate()!.matrix;
      const lastPixel = last.transform.baseVal.consolidate()!.matrix;
      const targetPixel = firstPixel.e + ((65 - 50) / 50) * (lastPixel.e - firstPixel.e);
      let lower = 0;
      let upper = path.getTotalLength();
      for (let iteration = 0; iteration < 40; iteration++) {
        const middle = (lower + upper) / 2;
        if (path.getPointAtLength(middle).x < targetPixel) lower = middle;
        else upper = middle;
      }
      const pixelY = path.getPointAtLength((lower + upper) / 2).y;
      const expected = 500 - ((pixelY - firstPixel.f) / (lastPixel.f - firstPixel.f)) * 200;
      const actual = Number($rows[0].dataset.isoValue);
      expect(actual, 'ISO follows the visible SVG curve').to.be.closeTo(expected, 0.05);
      expect(actual, 'the native smooth curve is retained').not.to.be.closeTo(470, 0.1);
    });
    cy.get(curves)
      .invoke('attr', 'd')
      .then((geometry) => {
        cy.get('#scatter-hide-non-optimal').click();
        cy.get(curves).should('have.attr', 'd', geometry);
      });
    cy.get('[data-testid="powerx-iso"]').clear().type('50');
    expectIso(500);
    cy.get(`${table} tbody tr`).should('have.attr', 'data-iso-status', 'exact');
    cy.writeFile('cypress/downloads/chart-0-powerx-iso.csv', '');
    cy.get('[data-testid="powerx-iso-csv"]').click();
    cy.readFile('cypress/downloads/chart-0-powerx-iso.csv')
      .should('contain', powerMetric)
      .and('contain', 'exact')
      .and('contain', '500');
    cy.get('[data-testid="powerx-iso"]').clear().type('120');
    cy.get(`${table} tbody tr`).should('have.attr', 'data-iso-status', 'outside-range');
    cy.get(`${table} tbody tr[data-iso-value]`).should('not.exist');
    expectNoPageOverflow();
    cy.get('[data-testid="measured-metric-controls"]').scrollIntoView({
      offset: { top: -80, left: 0 },
    });
    cy.screenshot('powerx-measured-desktop-controls', { capture: 'viewport' });
    cy.get(comparison).scrollIntoView({ offset: { top: -80, left: 0 } });
    cy.screenshot('powerx-measured-desktop-iso', { capture: 'viewport' });
  });
});
