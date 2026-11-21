import GPUGraph from '@/components/inference/ui/GPUGraph';
import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/providers/unofficial-run-provider';
import { useState, type ReactElement } from 'react';
import { mountWithProviders } from '../support/test-utils';
import { hoverTopmostOver } from '../support/scatter-points';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceContextValues,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { Precision } from '@/lib/catalog/data-mappings';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { computeToggle } from '@/lib/shared/toggle-set';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

const mountGpuGraph = (
  tree: ReactElement,
  overrides: Parameters<typeof mountWithProviders>[1] = {},
) => mountWithProviders(tree, { unofficial: {}, ...overrides });

describe('GPUGraph', () => {
  it('places and clears perf rulers across chip history comparison curves', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 32,
        y: 100,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 150,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 32,
        y: 200,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 64,
        y: 300,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-ruler"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={defaultChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['h100', 'b200'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100', '2025-03-01_b200']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );

    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').click({ force: true });
    cy.get('#test-gpu-ruler .perf-ruler-hit').should('have.length', 2);
    cy.get('#test-gpu-ruler .perf-ruler-hit').eq(0).click({ force: true });
    cy.get('#test-gpu-ruler .perf-ruler-hit').eq(1).click({ force: true });
    cy.get('#test-gpu-ruler .perf-ruler .pr-text-ratio').should('have.text', '2.00x');
    cy.get('[data-testid="gpu-clear-perf-rulers"]').click();
    cy.get('#test-gpu-ruler .perf-ruler').should('not.exist');
  });
});

function PowerComparison({
  latency = false,
  normalized = false,
}: {
  latency?: boolean;
  normalized?: boolean;
}) {
  const [optimal, setOptimal] = useState(true);
  const [metric, setMetric] = useState('y_measuredAvgPower');
  const [activeDates, setActiveDates] = useState(new Set(['2026-09-09_h100', '2026-09-10_h100']));
  const rows = ['2026-09-09', '2026-09-10'].flatMap((date) =>
    [4, 8].flatMap((tp) =>
      [1, 8, 32].map((conc, index) => {
        const interactivity =
          metric === 'y_measuredJPerOutputToken' || tp === 8
            ? 200 - index * 70
            : [200, 120, 130][index];
        return createMockInferenceData({
          hwKey: 'h100',
          precision: Precision.FP8,
          date,
          tp,
          conc,
          x: latency ? 1000 / interactivity : interactivity,
          y:
            metric === 'y_measuredJPerOutputToken'
              ? 4 - index
              : (350 + index * 200 + tp) * (metric === 'y_measuredPowerPercentTdp' ? 0.1 : 1),
          run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${date}`,
          power_tier: tp === 4 ? 'legacy' : 'certified',
        });
      }),
    ),
  );
  const value = createMockInferenceContextValues({
    selectedYAxisMetric: metric,
    hideNonOptimal: optimal,
    setHideNonOptimal: setOptimal,
    selectedGPUs: ['h100'],
    selectedDates: ['2026-09-09', '2026-09-10'],
    selectedDateRange: { startDate: '', endDate: '' },
    activeDates,
    selectedPrecisions: [Precision.FP8],
    hardwareConfig: hwConfig,
    showLineLabels: true,
  });
  return (
    <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
      <button onClick={() => setMetric('y_measuredPowerPercentTdp')}>Percent TDP</button>
      <button onClick={() => setMetric('y_measuredP75Power')}>P75</button>
      <button onClick={() => setMetric('y_measuredP90Power')}>P90</button>
      <button onClick={() => setMetric('y_measuredJPerOutputToken')}>Energy</button>
      <button onClick={() => setActiveDates(new Set(['2026-09-10_h100']))}>Hide older date</button>
      <div style={{ width: 1000, height: 600 }}>
        <GPUGraph
          chartId="gpu-power-curves"
          modelLabel="Qwen3.5 397B"
          data={rows}
          xLabel={latency ? 'Latency' : 'Interactivity'}
          yLabel="Power"
          chartDefinition={createMockChartDefinition({
            chartType: latency || normalized ? 'e2e' : 'interactivity',
            [`${metric}_roofline`]: latency ? 'lower_left' : 'lower_right',
          })}
        />
      </div>
    </InferenceContextsProvider>
  );
}

describe('GPU comparison power envelopes', () => {
  it('measures power boundaries by comparison date and resets rulers when the metric changes', () => {
    mountGpuGraph(<PowerComparison />);
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').click({ force: true });
    const chartId = 'gpu-power-curves';
    const placeRuler = () => {
      cy.get('#gpu-power-curves .perf-ruler-hit').should('have.length', 2);
      cy.get('#gpu-power-curves .perf-ruler-hit').eq(0).click({ force: true });
      cy.get('#gpu-power-curves .perf-ruler-hit').eq(1).click({ force: true });
      cy.get(`#${chartId} .perf-ruler .pr-text-ratio`).should('have.text', '1.00x');
    };
    placeRuler();
    cy.get('#gpu-hide-non-optimal').click({ force: true });
    cy.get('#gpu-power-curves .dot-group').should('have.length', 12);
    cy.get(`#${chartId} .perf-ruler .pr-text-ratio`).should('have.text', '1.00x');
    cy.get('#gpu-power-curves svg').should(($svg) => {
      const paths = [...$svg[0].querySelectorAll('.roofline-path')].map((path) =>
        path.getAttribute('d'),
      );
      const hits = [...$svg[0].querySelectorAll('.perf-ruler-hit')].map((path) =>
        path.getAttribute('d'),
      );
      expect(hits, 'ruler targets the drawn upper boundaries').to.deep.equal(paths);
    });
    cy.contains('button', 'P75').click();
    cy.get('#gpu-power-curves .perf-ruler').should('not.exist');
    cy.get('#gpu-perf-ruler').should('have.attr', 'aria-checked', 'true');
    placeRuler();
    cy.contains('button', 'Energy').click();
    cy.get('#gpu-power-curves .perf-ruler').should('not.exist');
    cy.get('#gpu-perf-ruler').should('have.attr', 'aria-checked', 'true');
    placeRuler();
    cy.contains('button', 'Hide older date').click();
    cy.get('#gpu-power-curves .perf-ruler-hit').should('have.length', 1);
    cy.get('#gpu-power-curves .perf-ruler').should('not.exist');
  });
});

const runUrl = (id: number) => `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`;

describe('GPU comparison with unofficial runs', () => {
  const OVERLAY_RUN_URL = runUrl(31415926535);
  const DATES = ['2025-03-01', '2025-03-15'];
  const ALL_SERIES = new Set(DATES.map((date) => `${date}_h100`));

  const official = (date: string, conc: number, y: number, tp = 8) =>
    createMockInferenceData({
      hwKey: 'h100',
      date,
      conc,
      tp,
      x: conc,
      y,
      precision: Precision.FP4,
      run_url: runUrl(DATES.indexOf(date) + 1000),
    });
  const overlay = (conc: number, y: number) =>
    createMockInferenceData({
      hwKey: 'b200',
      date: '2025-03-20',
      conc,
      tp: 8,
      x: conc,
      y,
      precision: Precision.FP4,
      run_url: OVERLAY_RUN_URL,
    });

  function Comparison({
    chartDefinition,
    data,
    overlayPoints,
    unofficial,
    context,
  }: {
    chartDefinition: ChartDefinition;
    data: InferenceData[];
    overlayPoints: InferenceData[];
    unofficial: UnofficialRunContextType;
    context?: Parameters<typeof createMockInferenceContextValues>[0];
  }) {
    const [activeDates, setActiveDates] = useState(new Set(ALL_SERIES));
    const [overlayHw, setOverlayHw] = useState(new Set(['b200']));
    const [showOffloadingLabel, setShowOffloadingLabel] = useState(true);
    const value = createMockInferenceContextValues({
      hardwareConfig: hwConfig,
      selectedGPUs: ['h100'],
      selectedDates: DATES,
      selectedDateRange: { startDate: '', endDate: '' },
      activeDates,
      toggleActiveDate: (id: string) =>
        setActiveDates((prev) => computeToggle(prev, id, ALL_SERIES)),
      selectedPrecisions: [Precision.FP4],
      showLineLabels: true,
      ...context,
      showOffloadingLabel,
      setShowOffloadingLabel,
    });
    return (
      <UnofficialRunContext.Provider value={{ ...unofficial, activeOverlayHwTypes: overlayHw }}>
        <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
          <button onClick={() => setOverlayHw(new Set())}>Hide overlay hardware</button>
          <div style={{ width: 1000, height: 600 }}>
            <GPUGraph
              chartId="gpu-overlay"
              modelLabel="DeepSeek R1"
              data={data}
              xLabel="X"
              yLabel="Throughput / Chip (tok/s)"
              chartDefinition={chartDefinition}
              overlayData={{
                data: overlayPoints,
                hardwareConfig: hwConfig,
                label: 'feat/power-sweep',
                runUrl: OVERLAY_RUN_URL,
              }}
            />
          </div>
        </InferenceContextsProvider>
      </UnofficialRunContext.Provider>
    );
  }

  const mountComparison = (
    chartDefinition: ChartDefinition,
    data: InferenceData[],
    overlayPoints: InferenceData[],
    context?: Parameters<typeof createMockInferenceContextValues>[0],
  ) => {
    const unofficial = createMockUnofficialRunContext({
      isUnofficialRun: true,
      unofficialRunInfos: [
        {
          id: 31415926535,
          name: 'Run Sweep',
          branch: 'feat/power-sweep',
          sha: 'abc123',
          createdAt: '2025-03-20T00:00:00Z',
          url: OVERLAY_RUN_URL,
          conclusion: 'success',
          status: 'completed',
          isNonMainBranch: true,
        },
      ],
      runIndexByUrl: { [OVERLAY_RUN_URL]: 0 },
    });
    mountWithProviders(
      <Comparison
        chartDefinition={chartDefinition}
        data={data}
        overlayPoints={overlayPoints}
        unofficial={unofficial}
        context={context}
      />,
    );
  };

  it('keeps unofficial warnings and run colors when hovering and pinning history overlays', () => {
    mountComparison(
      createMockChartDefinition({ chartType: 'interactivity', y_tpPerGpu_roofline: 'upper_left' }),
      [official(DATES[0], 32, 250)],
      [
        {
          ...overlay(64, 300),
          benchmark_type: 'agentic_traces',
          server_gpu_cache_hit_rate: 0.8,
          total_prompt_tokens: 75000,
          total_generation_tokens: 25000,
        },
      ],
    );
    cy.get('#gpu-overlay .unofficial-overlay-pt')
      .first()
      .trigger('mouseenter')
      .trigger('mousemove', { clientX: 400, clientY: 300 });
    cy.get('[data-chart-tooltip="gpu-overlay"]').should('have.css', 'display', 'block');
    cy.get('[data-chart-tooltip="gpu-overlay"] [data-hover-notice]').should(
      'have.text',
      '✕ feat/power-sweep',
    );
    cy.get('[data-chart-tooltip="gpu-overlay"] [data-hover-context]').should(
      'contain.text',
      '2025-03-20',
    );
    cy.get('[data-chart-tooltip="gpu-overlay"] [data-hover-cache-bar] > div')
      .first()
      .invoke('attr', 'style')
      .should('include', `background: ${overlayRunColor(0)}`);
    cy.get('#gpu-overlay .unofficial-overlay-pt .overlay-x').first().click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain.text', '✕ feat/power-sweep')
      .and('not.contain.text', 'Unofficial run')
      .and('not.contain.text', 'Branch')
      .should(($panel) => {
        // The warning stays in the fixed header, outside the scrolling details body.
        const panel = $panel[0];
        const warning = panel.querySelector('p.text-destructive')!;
        expect(warning.closest('[data-slot="point-details-body"]')).to.equal(null);
        expect(warning.getBoundingClientRect().top).to.be.at.least(
          panel.getBoundingClientRect().top,
        );
      });
    cy.get('[data-testid="point-details-panel"] [data-pinned-tokens]').should(
      'contain.text',
      '75,000',
    );
  });

  it('shows the unofficial card for an overlay point drawn on an official point', () => {
    mountComparison(
      createMockChartDefinition({ chartType: 'interactivity', y_tpPerGpu_roofline: 'upper_left' }),
      [official(DATES[0], 32, 250), official(DATES[0], 8, 100)],
      [overlay(32, 250)],
    );
    const tooltip = '[data-chart-tooltip="gpu-overlay"]';
    cy.get('#gpu-overlay .unofficial-overlay-pt > circle').then(([hit]) => hoverTopmostOver(hit));
    cy.get(`${tooltip} [data-hover-notice]`).should('have.text', '✕ feat/power-sweep');
    cy.get('#gpu-overlay .dot-group')
      .filter((_, group) => (group as unknown as { __data__: InferenceData }).__data__.conc === 8)
      .find('.visible-shape')
      .then(([shape]) => hoverTopmostOver(shape));
    cy.get(tooltip)
      .should('contain.text', 'conc 8')
      .find('[data-hover-notice]')
      .should('not.exist');
  });

  it('measures an unofficial curve from its point and removes the ruler when hidden', () => {
    mountComparison(
      createMockChartDefinition({ chartType: 'interactivity', y_tpPerGpu_roofline: 'upper_left' }),
      DATES.flatMap((date) => [8, 16, 32].map((x) => official(date, x, 300 - x))),
      [8, 16, 32].map((x) => overlay(x, 2 * (300 - x))),
    );
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').click({ force: true });
    cy.get('#gpu-overlay .dot-group .visible-shape').first().click({ force: true });
    cy.get('#gpu-overlay .unofficial-overlay-pt .overlay-x').first().click({ force: true });
    cy.get('#gpu-overlay .perf-ruler .pr-text-ratio').should('have.text', '2.00x');
    cy.contains('button', 'Hide overlay hardware').click();
    cy.get('#gpu-overlay .perf-ruler').should('not.exist');
  });
});
