import GPUGraph from '@/components/inference/ui/GPUGraph';
import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/components/unofficial-run-provider';
import { useState, type ReactElement } from 'react';
import { mountWithProviders } from '../support/test-utils';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceContextValues,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { Precision, Sequence } from '@/lib/data-mappings';
import { overlayRooflineDasharray, overlayRunColor } from '@/lib/overlay-run-style';
import { computeToggle } from '@/lib/toggle-set';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

// GPUGraph reads the unofficial-run context; no run is loaded unless a test says so.
const mountGpuGraph = (
  tree: ReactElement,
  overrides: Parameters<typeof mountWithProviders>[1] = {},
) => mountWithProviders(tree, { unofficial: {}, ...overrides });

describe('GPUGraph', () => {
  it('renders SVG within chart container', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 210,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu"
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
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );

    cy.get('[data-testid="gpu-graph"] svg').should('exist');
  });

  it('shows empty state when data is empty', () => {
    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-empty"
          modelLabel="DeepSeek R1"
          data={[]}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={defaultChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );

    cy.contains('No data available').should('be.visible');
  });

  it('explains missing role-local energy in GPU comparison mode', () => {
    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-role-energy-empty"
          modelLabel="DeepSeek R1"
          data={[]}
          xLabel="Interactivity"
          yLabel="Measured Decode J per Output Token"
          chartDefinition={defaultChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['mi355x'],
          selectedDates: ['2026-07-25'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2026-07-25_mi355x']),
          selectedPrecisions: [Precision.FP8],
          selectedYAxisMetric: 'y_measuredDecodeJPerOutputToken',
        },
      },
    );

    cy.contains('This dataset does not report role-level prefill/decode energy.').should(
      'be.visible',
    );
  });

  it('localizes the Chinese comparison empty state', () => {
    mountGpuGraph(
      <PathnameContext.Provider value="/zh/inference">
        <div style={{ width: 390, height: 600 }}>
          <GPUGraph
            chartId="test-gpu-empty-zh"
            modelLabel="DeepSeek R1"
            data={[]}
            xLabel="并发数"
            yLabel="单芯片吞吐量 (tok/s)"
            chartDefinition={defaultChartDef}
          />
        </div>
      </PathnameContext.Provider>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );
    cy.contains('暂无数据').should('be.visible');
    cy.contains('请调整模型、序列长度、精度、日期范围或芯片选项。').should('be.visible');
  });

  it('renders chart with points when data and selectedGPUs are provided', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 210,
        date: '2025-02-28',
        precision: Precision.FP4,
        conc: 64,
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 32,
        y: 180,
        date: '2025-03-01',
        precision: Precision.FP4,
        conc: 32,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 64,
        y: 350,
        date: '2025-03-01',
        precision: Precision.FP4,
        conc: 64,
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-data"
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
          selectedDates: ['2025-02-28', '2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-02-28_h100', '2025-03-01_h100', '2025-03-01_b200']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );

    cy.get('[data-testid="gpu-graph"] svg').should('exist');

    // Scatter points should be rendered (visible-shape elements from scatter layer)
    cy.get('[data-testid="gpu-graph"] svg .visible-shape').should('have.length.greaterThan', 0);
  });

  it('shows spec decoding only on hover while retaining the offload halo', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 32,
        y: 180,
        date: '2025-03-01',
        precision: Precision.FP4,
        benchmark_type: 'agentic_traces',
        spec_decoding: 'mtp',
        offload_mode: 'on',
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 210,
        date: '2025-03-01',
        precision: Precision.FP4,
        benchmark_type: 'agentic_traces',
        spec_decoding: 'none',
        offload_mode: 'off',
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-agentic-decorations"
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
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
          selectedSequence: Sequence.AgenticTraces,
        },
      },
    );

    cy.get('#test-gpu-agentic-decorations svg .spec-decode-marker').should('not.exist');
    cy.get('#test-gpu-agentic-decorations svg .offload-halo').should('have.length', 1);
    cy.get('#test-gpu-agentic-decorations [data-testid="spec-decode-marker-key"]').should(
      'not.exist',
    );
    // The KV-offload key and optimization note moved to the axis-metric info
    // footer rendered by ChartDisplay, so the chart itself carries neither.
    cy.get('#test-gpu-agentic-decorations [data-testid="offload-halo-key"]').should('not.exist');
    cy.get('#test-gpu-agentic-decorations [data-testid="agentic-optimization-note"]').should(
      'not.exist',
    );
    cy.get('#test-gpu-agentic-decorations svg .dot-group').first().trigger('mouseenter');
    cy.get('[data-chart-tooltip]').should('contain.text', 'Speculative Decoding');
    cy.get('[data-chart-tooltip]').should('contain.text', 'MTP');
  });

  it('renders date line labels along each roofline when showLineLabels is on', () => {
    // Two GPUs × two dates with enough points each to form rooflines.
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 8,
        y: 240,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 16,
        y: 200,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 32,
        y: 150,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 8,
        y: 320,
        date: '2025-03-15',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 16,
        y: 280,
        date: '2025-03-15',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'b200',
        x: 32,
        y: 220,
        date: '2025-03-15',
        precision: Precision.FP4,
      }),
    ];
    const interactivityChartDef = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-line-labels"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Interactivity"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={interactivityChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['h100', 'b200'],
          selectedDates: ['2025-03-01', '2025-03-15'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100', '2025-03-15_b200']),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
        },
      },
    );

    // One label per visible (date, hwKey) — labels carry both the hw config
    // and the date so the chart-side label is self-contained.
    cy.get('#test-gpu-line-labels svg .line-label').should('have.length', 2);
    cy.get('#test-gpu-line-labels svg .line-label').should('contain.text', '2025-03-01');
    cy.get('#test-gpu-line-labels svg .line-label').should('contain.text', '2025-03-15');
    // Hw display labels (e.g. "H100", "B200") appear alongside the dates.
    cy.get('#test-gpu-line-labels svg .line-label')
      .invoke('text')
      .then((txt) => {
        expect(txt.toLowerCase()).to.match(/h100|h 100/iu);
        expect(txt.toLowerCase()).to.match(/b200|b 200/iu);
      });
    // Each label has the rounded background rect.
    cy.get('#test-gpu-line-labels svg .line-label .ll-bg').should('have.length', 2);
  });

  it('hides line labels when showLineLabels is off', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 8,
        y: 240,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 16,
        y: 200,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-no-line-labels"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Interactivity"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={createMockChartDefinition({
            chartType: 'interactivity',
            y_tpPerGpu_roofline: 'upper_left',
          })}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: false,
        },
      },
    );

    cy.get('#test-gpu-no-line-labels svg .line-label').should('not.exist');
  });

  it('renders legend with GPU and date entries', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 210,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    ];

    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-legend"
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
          selectedGPUs: ['h100'],
          selectedDates: ['2025-03-01'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100']),
          selectedPrecisions: [Precision.FP4],
        },
      },
    );

    cy.get('.sidebar-legend').should('exist');
    // Legend should show at least one entry (date + GPU combo)
    cy.get('.sidebar-legend label').should('have.length.greaterThan', 0);
  });
});

describe('GPU comparison power envelopes', () => {
  function PowerComparison({ latency = false }: { latency?: boolean }) {
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
        <button onClick={() => setActiveDates(new Set(['2026-09-10_h100']))}>
          Hide older date
        </button>
        <div style={{ width: 1000, height: 600 }}>
          <GPUGraph
            chartId="gpu-power-curves"
            modelLabel="Qwen3.5 397B"
            data={rows}
            xLabel={latency ? 'Latency' : 'Interactivity'}
            yLabel="Power"
            chartDefinition={createMockChartDefinition({
              chartType: latency ? 'e2e' : 'interactivity',
              [`${metric}_roofline`]: latency ? 'lower_left' : 'lower_right',
            })}
          />
        </div>
      </InferenceContextsProvider>
    );
  }

  it('reveals off-boundary measurements without changing power envelopes or axes', () => {
    mountGpuGraph(<PowerComparison />);
    cy.get('#gpu-show-all-measurements').should('not.exist');
    cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    cy.get('#gpu-power-curves .roofline-path')
      .should('have.length', 2)
      .each(($path) => {
        expect($path.attr('d')).to.contain('C');
        expect($path.attr('stroke')).not.to.equal('#6b7280');
      });
    cy.get('#gpu-power-curves svg').then(($svg) => {
      const paths = Array.from($svg[0].querySelectorAll('.roofline-path'), (p) =>
        p.getAttribute('d'),
      );
      const axes = Array.from(
        $svg[0].querySelectorAll('.x-axis, .y-axis'),
        (axis) => axis.innerHTML,
      );
      cy.get('#gpu-hide-non-optimal').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 12);
      cy.get('#gpu-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
      cy.get('#gpu-power-curves svg').should(($current) => {
        expect(
          Array.from($current[0].querySelectorAll('.roofline-path'), (p) => p.getAttribute('d')),
        ).to.deep.equal(paths);
        expect(
          Array.from($current[0].querySelectorAll('.x-axis, .y-axis'), (axis) => axis.innerHTML),
        ).to.deep.equal(axes);
      });
      cy.get('#gpu-show-all-measurements').should('not.exist');
      cy.get('#gpu-hide-non-optimal').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    });
    cy.get('#gpu-power-curves .line-label').should('have.length', 2);
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').should('exist');
    cy.contains('button', 'Hide older date').click();
    cy.get('#gpu-power-curves .roofline-path').should('have.length', 1);
    cy.get('#gpu-power-curves .dot-group').should('have.length', 3);
    cy.get('#gpu-power-curves .line-label').should('have.length', 1);
  });

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

  it('keeps boundary measurements by default toward lower latency', () => {
    mountGpuGraph(<PowerComparison latency />);
    cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    cy.get('#gpu-power-curves .roofline-path')
      .should('have.length', 2)
      .each(($path) => expect($path.attr('d')).to.contain('C'));
  });

  it('uses the same boundary toggle for percent TDP and fleet percentiles while preserving energy Pareto', () => {
    mountGpuGraph(
      <PathnameContext.Provider value="/zh/inference">
        <PowerComparison />
      </PathnameContext.Provider>,
    );
    for (const label of ['Percent TDP', 'P75', 'P90']) {
      cy.contains('button', label).click();
      cy.get('#gpu-hide-non-optimal').should('have.attr', 'data-state', 'checked');
      cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
      cy.get('#gpu-power-curves .roofline-path').should('have.length', 2);
      cy.get('#gpu-show-all-measurements').should('not.exist');
      cy.get('#gpu-hide-non-optimal').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 12);
      cy.get('#gpu-power-curves .roofline-path').should('have.length', 2);
      cy.get('#gpu-show-all-measurements').should('not.exist');
      cy.get('#gpu-hide-non-optimal').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    }
    cy.contains('button', 'Energy').click();
    cy.get('#gpu-show-all-measurements').should('not.exist');
    cy.get('#gpu-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('#gpu-power-curves .roofline-path')
      .should('have.length', 2)
      .each(($path) => expect($path.attr('d')).to.contain('C'));
  });
});

const runUrl = (id: number) => `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`;

describe('GPU comparison with unofficial runs and load sweeps', () => {
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
  }: {
    chartDefinition: ChartDefinition;
    data: InferenceData[];
    overlayPoints: InferenceData[];
    unofficial: UnofficialRunContextType;
  }) {
    const [activeDates, setActiveDates] = useState(new Set(ALL_SERIES));
    const [overlayHw, setOverlayHw] = useState(new Set(['b200']));
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
      />,
    );
  };

  it('keeps unofficial runs on the date comparison in the run color and dash', () => {
    mountComparison(
      createMockChartDefinition({ chartType: 'interactivity', y_tpPerGpu_roofline: 'upper_left' }),
      DATES.flatMap((date, d) => [8, 16, 32].map((x, i) => official(date, x, 300 - i * 60 + d))),
      [8, 16, 32].map((x, i) => overlay(x, 400 - i * 60)),
    );

    cy.get('#gpu-overlay .unofficial-overlay-pt').should('have.length', 3);
    cy.get('#gpu-overlay .unofficial-overlay-pt .overlay-x').each(($marker) => {
      expect($marker.attr('stroke')).to.equal(overlayRunColor(0));
    });
    cy.get('#gpu-overlay .roofline-overlay-run0_b200_fp4')
      .should('have.attr', 'stroke', overlayRunColor(0))
      .and('have.attr', 'stroke-dasharray', overlayRooflineDasharray(0));
    cy.get('.sidebar-legend')
      .should('contain.text', 'UNOFFICIAL: feat/power-sweep')
      .and('contain.text', '✕ B200');
    cy.get('#gpu-overlay .line-label').should('have.length', 3).and('contain.text', '✕ B200');

    // A date toggle hides that official series; the unofficial run stays.
    cy.get('.sidebar-legend label').contains('2025-03-15').click();
    cy.get('#gpu-overlay .dot-group').should('have.length', 3);
    cy.get('#gpu-overlay .unofficial-overlay-pt').should('have.length', 3);

    cy.contains('button', 'Hide overlay hardware').click();
    cy.get('#gpu-overlay .unofficial-overlay-pt').should('not.exist');
    cy.get('#gpu-overlay .roofline-overlay-run0_b200_fp4').should('not.exist');
    cy.get('.sidebar-legend').should('not.contain.text', 'UNOFFICIAL');
  });

  it('draws concurrency load sweeps per date, run and topology without frontier tools', () => {
    mountComparison(
      createMockChartDefinition({
        chartType: 'interactivity',
        x_scale_field: 'conc',
        y_tpPerGpu_roofline: 'upper_left',
      }),
      [
        // A load sweep is not a frontier: the dip at c16 stays on the line.
        ...DATES.flatMap((date, d) => [
          official(date, 8, 300 + d),
          official(date, 16, 250 + d),
          official(date, 32, 320 + d),
        ]),
        // Another topology on the later date is a separate sweep.
        official(DATES[1], 8, 150, 4),
        official(DATES[1], 16, 180, 4),
      ],
      [overlay(8, 400), overlay(16, 380), overlay(32, 450)],
    );

    cy.get('#gpu-overlay .roofline-path').should('have.length', 4);
    cy.get('#gpu-overlay .roofline-path').each(($path) => {
      expect($path.attr('d'), 'straight segments between observations').not.to.contain('C');
    });
    cy.get('#gpu-overlay .roofline-path[class*="2025-03-01_h100_fp4"]')
      .invoke('attr', 'd')
      .should('match', /^M[^L]+L[^L]+L[^L]+$/u);
    cy.get('#gpu-overlay .roofline-path[class*="overlay-run0_b200_fp4"]').should(
      'have.attr',
      'stroke-dasharray',
      overlayRooflineDasharray(0),
    );
    cy.get('#gpu-overlay .dot-group').should('have.length', 8);
    cy.get('#gpu-hide-non-optimal').should('not.exist');
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').should('not.exist');
  });
});
