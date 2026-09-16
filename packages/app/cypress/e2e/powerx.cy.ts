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
const availability = '[data-testid="power-metric-availability"]';
const officialPoints = '[data-testid="inference-chart-display"] svg .dot-group';
const comparisonChart = '[data-testid="measured-comparison-charts"]';
const comparisonPoints = `${comparisonChart} circle[data-metric]`;

const rows = (hardware = 'h200') =>
  singleTurnRows(null, { hardware })
    .slice(0, 2)
    .map((row, index) => ({
      ...row,
      metrics: {
        ...row.metrics,
        median_intvty: [50, 100][index],
        mean_intvty: [60, 110][index],
        mean_itl: 1 / [60, 110][index],
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

function expandControls() {
  cy.get('[data-testid="inference-secondary-controls"] > button').then(($button) => {
    if ($button.is(':visible') && $button.attr('aria-expanded') !== 'true')
      cy.wrap($button).click();
  });
}

function selectFamily(family: 'Power' | 'Energy') {
  expandControls();
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

function selectComparison(mode: 'single' | 'boundaries' | 'roles' | 'role-energy' | 'relative') {
  expandControls();
  cy.get('#measured-comparison').click();
  cy.get(`[data-slot="select-item"][data-value="${mode}"]`).click();
}

function expectValues(selector: string, expected: number[], field: 'x' | 'y' = 'y') {
  cy.get<SVGElement & { __data__: { x: number; y: number } }>(selector).should(($points) => {
    expect(
      [...$points]
        .filter((point) => point.style.opacity !== '0')
        .map((point) => point.__data__[field])
        .sort((a, b) => a - b),
    ).to.deep.equal(expected);
  });
}

const metricPoints = (metric: string, source = 'official') =>
  `${comparisonPoints}[data-metric="${metric}"][data-source="${source}"]`;

describe('PowerX within the existing measured dashboards', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    intercept();
  });

  it('keeps the shared feature gate and existing measured family controls', () => {
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
    expectValues(officialPoints, [300, 400]);
    selectFamily('Energy');
    cy.get('[data-testid="measured-energy-denominator"]').should('contain', 'Output token');
    expectValues(officialPoints, [400, 600]);
    cy.location('pathname').should('eq', '/inference');
    cy.get('[data-testid="powerx-iso-table"]').should('not.exist');
    cy.get('[data-testid="gpu-metrics-run-input"]').should('not.exist');
  });

  it('plots the accounting boundaries together and omits unsupported modeled values', () => {
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}&i_mcompare=boundaries`);
    cy.wait('@powerxRows');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    expectValues(metricPoints('powerxGpuProvisionedEnergy'), [7, 14]);
    expectValues(metricPoints('powerxUtilityProvisionedEnergy'), [13.7, 27.4]);
    expectValues(metricPoints('measuredAvgPower'), [300, 400]);
    expectValues(metricPoints('powerxGpuProvisionedWatts'), [700, 700]);
    cy.get(metricPoints('powerxUtilityModeledEnergy')).should('not.exist');
    cy.get(comparisonChart).should('contain', 'J/output token').and('contain', 'W/GPU');
    cy.get('[data-testid="model-selector"]').should('contain', 'DeepSeek V4 Pro');
    cy.get('[data-testid="scenario-selector"]').should('contain', '1K / 1K');
    cy.get('[data-testid="precision-multiselect"]').should('contain', 'FP4');
    cy.get(`${comparisonChart} [data-testid="measured-comparison-precision"]`).should(
      'contain',
      'FP4',
    );
    expectNoPageOverflow();
    cy.get(comparisonChart).screenshot('powerx-boundaries-desktop');
  });

  it('renders all four boundaries for validated 8K/1K telemetry with a supported chassis model', () => {
    const body = rows('b200').map((row) => ({
      ...row,
      isl: 8192,
      metrics: { ...row.metrics, avg_total_gpu_power_w: row.metrics.avg_power_w * 8 },
    }));
    intercept(body);
    cy.visit(
      `/inference?${selection.replace('i_seq=1k%2F1k', 'i_seq=8k%2F1k')}&i_metric=${energyMetric}&i_mcompare=boundaries`,
    );
    cy.wait('@powerxRows');
    // Existing dashboard modeling applies facility PUE 1.3 after chassis AC.
    expectValues(metricPoints('powerxUtilityModeledWatts'), [716.2875, 856.25]);
    cy.get(comparisonChart).should('contain', 'PUE 1.3');
    expectValues(metricPoints('powerxUtilityModeledEnergy'), [856.25, 1432.575]);
    expectValues(metricPoints('powerxGpuProvisionedWatts'), [1000, 1000]);
    cy.get('[data-testid="measured-panel-boundaries-energy"] circle[data-metric]').should(
      ($points) => {
        expect(new Set([...$points].map((point) => point.dataset.metric)).size).to.equal(4);
      },
    );
  });

  it('preserves P90 and legacy admission when returning from another boundary or comparison', () => {
    const body = rows();
    delete (body[0].metrics as Record<string, number>).power_valid;
    delete (body[0].metrics as Record<string, number>).power_metric_schema_version;
    intercept(body);
    cy.visit(`/inference?${selection}&i_metric=${powerMetric}`);
    cy.wait('@powerxRows');
    expectValues(officialPoints, [300, 400]);
    cy.get('.legacy-power-ring').should('have.length', 1);
    cy.get('[data-testid="measured-power-statistic-p90"]').click();
    expectValues(officialPoints, [375]);
    selectBoundary('power', 'gpu-provisioned');
    expectValues(officialPoints, [700, 700]);
    selectBoundary('power', 'gpu-measured');
    cy.get('[data-testid="measured-power-statistic-p90"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    expectValues(officialPoints, [375]);
    selectComparison('boundaries');
    expectValues(metricPoints('measuredAvgPower'), [300, 400]);
    selectComparison('single');
    cy.get('[data-testid="measured-power-statistic-p90"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    expectValues(officialPoints, [375]);
  });

  it('restores comparison mode and hardware filters from the native share link', () => {
    intercept([...rows(), ...rows('b200')]);
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}`, {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.wait('@powerxRows');
    cy.get('[data-testid="chart-legend"] [role="button"][aria-label^="Hide"][aria-label*="B200"]')
      .first()
      .click();
    selectComparison('boundaries');
    cy.get('[data-testid="measured-comparison-statistic"]').click();
    cy.contains('[data-slot="select-item"]', /^Mean$/u).click();
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    expectValues(metricPoints('measuredJPerOutputToken'), [60, 110], 'x');
    cy.contains(`${comparisonChart} label`, 'B200').click();
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 400, 600, 600]);
    cy.contains(`${comparisonChart} label`, 'H200').click();
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    cy.get('[data-testid="measured-comparison-iso"]').type('75');
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.pathname).to.equal('/inference');
        expect(url.searchParams.get('i_mcompare')).to.equal('boundaries');
        expect(url.searchParams.get('i_mstat')).to.equal('mean');
        expect(url.searchParams.get('i_iso')).to.equal('75');
        expect(url.searchParams.get('i_iso_axis')).to.equal('mean_intvty');
        expect(url.searchParams.get('i_active')).to.include('h200');
        expect(url.searchParams.get('i_active')).not.to.include('b200');
        cy.visit(url.href, {
          onBeforeLoad(win) {
            win.localStorage.removeItem('inferencex-feature-gate');
          },
        });
      });
    cy.get('#measured-comparison').should('contain', 'Power boundaries');
    cy.get('[data-testid="measured-comparison-statistic"]').should('contain', 'Mean');
    cy.get('[data-testid="measured-comparison-iso"]').should('have.value', '75');
    cy.get(`${comparisonChart} .comparison-iso text`).should('exist');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    expectValues(metricPoints('measuredJPerOutputToken'), [60, 110], 'x');
    expectValues(metricPoints('powerxGpuProvisionedEnergy'), [7, 14]);
    cy.get('[data-testid="scenario-selector"]').should('contain', '1K / 1K');
  });

  it('restores the native Perf Ruler before delayed benchmark data arrives and shares it', () => {
    const body = [
      ...rows(),
      ...rows('b200').map((row) => ({
        ...row,
        metrics: {
          ...row.metrics,
          joules_per_output_token: row.metrics.joules_per_output_token * 2,
        },
      })),
    ];
    intercept(body);
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}`);
    cy.wait('@powerxRows');
    cy.get<SVGPathElement>('[data-testid="inference-chart-display"] .roofline-path')
      .should('have.length', 2)
      .then(($curves) => {
        const curveKeys = [...$curves].map((curve) =>
          [...curve.classList].find((key) => key !== 'roofline-path')!,
        );
        const value = JSON.stringify({
          axis: `median_intvty\u0000${energyMetric}`,
          rulers: [[...curveKeys, 75]],
        });
        cy.intercept('GET', '/api/v1/benchmarks*', { body, delay: 200 }).as('delayedRows');
        cy.visit(
          `/inference?${selection}&i_metric=${energyMetric}&i_rulers=${encodeURIComponent(value)}`,
        );
      });
    cy.wait('@delayedRows');
    cy.get('.perf-ruler .pr-text-ratio').should('have.length', 1).and('contain', '2');
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(JSON.parse(url.searchParams.get('i_rulers')!).rulers[0][2]).to.equal(75);
        cy.visit(url.href);
      });
    cy.get('.perf-ruler .pr-text-ratio').should('have.length', 1).and('contain', '2');
    selectXAxisMode('ttft');
    cy.get('.perf-ruler').should('not.exist');
  });

  it('automatically adds new live points to every applicable comparison series', () => {
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);
    cy.visit(`/inference?${selection}&i_metric=${energyMetric}&i_mcompare=boundaries`);
    cy.wait('@powerxRows');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
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
        output_tput_per_gpu: 25,
      },
    });
    cy.intercept('GET', '/api/v1/benchmarks*', { body }).as('newRows');
    cy.tick(300_000);
    cy.wait('@newRows');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600, 800]);
    expectValues(metricPoints('powerxGpuProvisionedEnergy'), [7, 14, 28]);
    cy.get('#measured-comparison').should('contain', 'Power boundaries');
    cy.get('[data-testid="yaxis-metric-selector"]').should('contain', 'Measured Energy');
  });

  it('keeps historical data pinned while all comparison panels follow the selected X axis', () => {
    cy.clock(Date.now(), ['setInterval', 'clearInterval']);
    cy.visit(
      `/inference?${selection}&g_rundate=${SINGLE_TURN_DATE}&i_metric=${energyMetric}&i_mcompare=boundaries`,
    );
    cy.wait('@powerxRows');
    const body = rows();
    body[1].metrics.joules_per_output_token = 800;
    cy.intercept('GET', '/api/v1/benchmarks*', { body }).as('correctedSnapshot');
    cy.tick(300_000);
    cy.get('@correctedSnapshot.all').should('have.length', 0);
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    selectXAxisMode('ttft');
    expectValues(metricPoints('measuredJPerOutputToken'), [1, 2], 'x');
    expectValues(metricPoints('measuredAvgPower'), [1, 2], 'x');
    cy.get(comparisonChart).should('contain', 'Time To First Token');
  });

  it('includes visible unofficial runs in every comparison and removes them on dismissal', () => {
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
    cy.visit(
      `/inference?${selection}&i_metric=${energyMetric}&i_mcompare=boundaries&unofficialrun=${OVERLAY_RUN_ID}`,
    );
    cy.wait('@powerxOverlay');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    expectValues(metricPoints('measuredJPerOutputToken', 'overlay-0'), [500, 700]);
    expectValues(metricPoints('powerxGpuProvisionedEnergy', 'overlay-0'), [7, 14]);
    cy.contains(`${comparisonChart} label`, '✕ H200').click();
    cy.get(metricPoints('measuredJPerOutputToken', 'overlay-0')).should('not.exist');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    cy.contains(`${comparisonChart} label`, '✕ H200').click();
    expectValues(metricPoints('measuredJPerOutputToken', 'overlay-0'), [500, 700]);
    cy.get('button[aria-label="Dismiss powerx-test"]').click();
    cy.get(`${comparisonPoints}[data-source="overlay-0"]`).should('not.exist');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
  });

  it('omits invalid and missing measurements without zero-filling on Chinese mobile', () => {
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
    selectComparison('boundaries');
    expectValues(metricPoints('measuredJPerOutputToken'), [400, 600]);
    expectValues(metricPoints('powerxGpuProvisionedEnergy'), [7, 7, 14, 14]);
    cy.get(comparisonChart).should('contain', 'GPU 实测');
    expectNoPageOverflow();
    cy.get(comparisonChart).screenshot('powerx-boundaries-mobile-zh');
  });

  it('compares explicitly chosen hardware at the same service level and restores the complete share state', () => {
    const fingerprint = '0123456789abcdef'.repeat(4);
    const legacyBaseline = rows().map((row) => {
      delete (row.metrics as Record<string, number>).power_valid;
      delete (row.metrics as Record<string, number>).power_metric_schema_version;
      return { ...row, recipe_fingerprint: fingerprint };
    });
    intercept([
      ...legacyBaseline,
      ...rows('mi355x'),
      ...rows('b200').map((row) => ({
        ...row,
        metrics: {
          ...row.metrics,
          avg_power_w: row.metrics.avg_power_w * 1.1,
          output_tput_per_gpu: row.metrics.output_tput_per_gpu * 1.2,
          joules_per_output_token: row.metrics.joules_per_output_token * 0.8,
        },
      })),
    ]);
    cy.visit(`/inference?${selection}&i_metric=${powerMetric}&i_mcompare=relative`);
    cy.wait('@powerxRows');
    cy.get(comparisonChart).should('contain', 'Select two distinct sources');
    cy.get('[data-testid="measured-relative-baseline"]').click();
    cy.contains('[data-slot="select-item"]', 'H200').click();
    cy.get('[data-testid="measured-relative-comparator"]').click();
    cy.contains('[data-slot="select-item"]', 'B200').click();
    cy.contains(`${comparisonChart} label`, 'H200').should('exist');
    cy.contains(`${comparisonChart} label`, 'B200').should('exist');
    cy.contains(`${comparisonChart} label`, 'MI355X').should('not.exist');
    cy.get('[data-testid="measured-relative-sources"]')
      .should('contain', `${fingerprint.slice(0, 12)}…`)
      .and('not.contain', fingerprint);
    cy.get('[data-testid="measured-relative-sources"] [title]')
      .first()
      .should('have.attr', 'title')
      .and('include', fingerprint);
    cy.get('[data-testid="measured-comparison-historical"]').should(
      'contain',
      '2 historical measurements',
    );
    cy.get('[data-testid="measured-comparison-iso"]').type('75');
    for (const [metric, expected] of [
      ['relativePower', 10],
      ['relativeThroughput', 20],
      ['relativeEnergy', 20],
    ] as const) {
      cy.get<SVGElement & { __data__: { x: number; y: number } }>(metricPoints(metric)).should(
        ($points) => {
          expect([...$points].map((p) => p.__data__.x)).to.deep.equal([50, 75, 100]);
          for (const p of $points) expect(p.__data__.y).to.be.closeTo(expected, 1e-10);
        },
      );
    }
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.searchParams.get('i_mcompare')).to.equal('relative');
        expect(url.searchParams.get('i_mbase')).to.include('h200');
        expect(url.searchParams.get('i_mbase')).to.include(fingerprint);
        expect(url.searchParams.get('i_mcomp')).to.include('b200');
        expect(url.searchParams.get('i_iso_axis')).to.equal('median_intvty');
        cy.visit(url.href);
      });
    cy.get('[data-testid="measured-comparison-iso"]').should('have.value', '75');
    cy.get('[data-testid="measured-relative-sources"]')
      .should('contain', 'H200')
      .and('contain', 'B200');
    cy.get(comparisonChart).screenshot('powerx-relative-desktop');
    cy.viewport(390, 844);
    expectNoPageOverflow();
    cy.get<SVGTextElement>(`${comparisonChart} .comparison-iso text`).each(($text) => {
      const element = $text[0];
      const svg = element.closest('svg')!;
      const textBox = element.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      expect(textBox.left).to.be.at.least(svgBox.left);
      expect(textBox.right).to.be.at.most(svgBox.right);
    });
    cy.get(comparisonChart).screenshot('powerx-relative-mobile');
    selectComparison('boundaries');
    cy.contains(`${comparisonChart} label`, 'MI355X').should('exist');
    selectComparison('single');
    selectXAxisMode('ttft');
    selectComparison('relative');
    cy.get('[data-testid="measured-comparison-iso"]').should('have.value', '');
    cy.get(`${comparisonChart} .comparison-iso text`).should('not.exist');
  });

  it('compares both roles and reconstructs energy with a common output-token denominator', () => {
    const body = rows('gb200').map((row, index) => ({
      ...row,
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
      prefill_tp: 4,
      decode_tp: 4,
      metrics: {
        ...row.metrics,
        prefill_avg_power_w: 250 + index * 50,
        decode_avg_power_w: 400 + index * 50,
        joules_per_input_token: 1,
        joules_per_output_token: 8,
        prefill_joules_per_input_token: 0.25,
        decode_joules_per_output_token: 6,
      },
    }));
    delete (body[1].metrics as Record<string, number>).decode_joules_per_output_token;
    intercept([...body, ...rows('gb300')]);
    cy.visit(`/inference?${selection}&i_metric=${powerMetric}&i_mcompare=roles`);
    cy.wait('@powerxRows');
    expectValues(metricPoints('measuredPrefillAvgPower'), [250, 300]);
    expectValues(metricPoints('measuredDecodeAvgPower'), [400, 450]);
    expectValues(metricPoints('measuredPrefillJPerInputToken'), [0.25, 0.25]);
    expectValues(metricPoints('measuredDecodeJPerOutputToken'), [6]);
    selectComparison('role-energy');
    expectValues(metricPoints('prefill'), [2]);
    expectValues(metricPoints('decode'), [6]);
    expectValues(metricPoints('prefillShare'), [25]);
    expectValues(metricPoints('measuredPrefillAvgPower'), [250, 300]);
    expectValues(metricPoints('measuredDecodeAvgPower'), [400, 450]);
    cy.get('[data-testid="measured-panel-role-power"]').should('exist');
    cy.get('[data-testid="measured-panel-prefill-share"]').should('exist');
    cy.get('[data-testid="measured-panel-request-energy"]').should('exist');
    cy.get(`${comparisonChart} [data-testid="measured-comparison-unavailable-hardware"]`)
      .should('contain', 'GB300')
      .and('contain', 'No values for the selected metrics')
      .and('not.contain', 'GB200');
    cy.get(`${comparisonChart} [data-testid="measured-comparison-precision"]`).should(
      'contain',
      'FP4',
    );
    cy.get(comparisonChart).should('contain', 'J/output token');
    expectNoPageOverflow();
    cy.get(comparisonChart).screenshot('powerx-request-energy-desktop');
  });
});
