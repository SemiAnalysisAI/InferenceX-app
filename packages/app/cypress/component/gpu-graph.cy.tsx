import GPUGraph from '@/components/inference/ui/GPUGraph';
import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import { useState } from 'react';
import { mountWithProviders } from '../support/test-utils';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceContextValues,
} from '../support/mock-data';
import { Precision, Sequence } from '@/lib/data-mappings';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

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

    mountWithProviders(
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
    mountWithProviders(
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
    mountWithProviders(
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
    mountWithProviders(
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

    mountWithProviders(
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

  it('draws the historical-power ring and reports measured-point coverage', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 32,
        y: 2.1,
        date: '2025-03-01',
        precision: Precision.FP4,
        power_tier: 'legacy',
      }),
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 1.8,
        date: '2025-03-01',
        precision: Precision.FP4,
        power_tier: 'certified',
      }),
    ];

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-measured-power"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Interactivity (tok/s/user)"
          yLabel="Measured Joules per Output Token (J/tok)"
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
          selectedYAxisMetric: 'y_measuredJPerOutputToken',
          hideNonOptimal: false,
        },
      },
    );

    cy.get('#test-gpu-measured-power svg .legacy-power-ring').should('have.length', 1);
    cy.get('[data-testid="measured-power-summary"]')
      .should('contain.text', 'Showing 2 of 2 measured points')
      .and('contain.text', '1/1 validated')
      .and('contain.text', '1/1 historical');
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

    mountWithProviders(
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

    mountWithProviders(
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

    mountWithProviders(
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

    mountWithProviders(
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
    const [showAllMeasurements, setShowAllMeasurements] = useState(false);
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
            y: metric === 'y_measuredJPerOutputToken' ? 4 - index : 350 + index * 200 + tp,
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
      showAllMeasurements,
      setShowAllMeasurements,
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
              y_measuredAvgPower_roofline: latency ? 'lower_left' : 'lower_right',
              y_measuredJPerOutputToken_roofline: latency ? 'lower_left' : 'lower_right',
            })}
          />
        </div>
      </InferenceContextsProvider>
    );
  }

  it('reveals off-boundary measurements and historical rings without changing power envelopes or axes', () => {
    mountWithProviders(<PowerComparison />);
    cy.get('#gpu-power-curves .roofline-path').should('not.exist');
    cy.get('#gpu-show-all-measurements').should('not.exist');
    cy.get('[data-testid="power-curve-description"]').should('contain', 'single point');
    cy.get('#gpu-hide-non-optimal').click({ force: true });
    cy.get('#gpu-show-all-measurements').should('have.attr', 'data-state', 'unchecked');
    cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    cy.get('#gpu-power-curves .legacy-power-ring').should('have.length', 2);
    cy.get('[data-testid="measured-power-summary"]')
      .should('contain.text', 'Showing 6 of 12 measured points')
      .and('contain.text', '4/6 validated')
      .and('contain.text', '2/6 historical');
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
      cy.get('#gpu-show-all-measurements').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 12);
      cy.get('#gpu-power-curves .legacy-power-ring').should('have.length', 6);
      cy.get('[data-testid="measured-power-summary"]').should(
        'contain.text',
        'Showing 12 of 12 measured points',
      );
      cy.get('#gpu-hide-non-optimal').should('have.attr', 'data-state', 'unchecked');
      cy.get('#gpu-power-curves svg').should(($current) => {
        expect(
          Array.from($current[0].querySelectorAll('.roofline-path'), (p) => p.getAttribute('d')),
        ).to.deep.equal(paths);
        expect(
          Array.from($current[0].querySelectorAll('.x-axis, .y-axis'), (axis) => axis.innerHTML),
        ).to.deep.equal(axes);
      });
      cy.get('#gpu-show-all-measurements').click({ force: true });
      cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
      cy.get('#gpu-power-curves .legacy-power-ring').should('have.length', 2);
    });
    cy.get('#gpu-power-curves .line-label').should('have.length', 2);
    cy.get('[data-testid="legend-advanced-toggle"]').click();
    cy.get('#gpu-perf-ruler').should('not.exist');
    cy.contains('button', 'Hide older date').click();
    cy.get('#gpu-power-curves .roofline-path').should('have.length', 1);
    cy.get('#gpu-power-curves .dot-group').should('have.length', 3);
    cy.get('#gpu-power-curves .line-label').should('have.length', 1);
  });

  it('keeps boundary measurements by default toward lower latency', () => {
    mountWithProviders(<PowerComparison latency />);
    cy.get('#gpu-power-curves .roofline-path').should('not.exist');
    cy.get('#gpu-hide-non-optimal').click({ force: true });
    cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    cy.get('#gpu-power-curves .roofline-path')
      .should('have.length', 2)
      .each(($path) => expect($path.attr('d')).to.contain('C'));
    cy.get('#gpu-power-curves [data-testid="power-curve-description"]')
      .should('contain.text', 'upper power boundary')
      .and('contain.text', 'not efficiency frontiers');
  });

  it('localizes the %TDP measurement toggle without changing the saved Optimal Only preference for energy', () => {
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <PowerComparison />
      </PathnameContext.Provider>,
    );
    cy.contains('button', 'Percent TDP').click();
    cy.get('#gpu-hide-non-optimal').should('not.exist');
    cy.get('#gpu-power-curves .dot-group').should('have.length', 6);
    cy.contains('显示全部测量点').should('be.visible');
    cy.get('#gpu-show-all-measurements').click({ force: true });
    cy.get('#gpu-power-curves .dot-group').should('have.length', 12);
    cy.get('#gpu-power-curves .roofline-path').should('have.length', 2);
    cy.get('[data-testid="power-curve-description"]').should('contain', '不代表能效 Pareto 前沿');
    cy.contains('button', 'Energy').click();
    cy.get('#gpu-show-all-measurements').should('not.exist');
    cy.get('#gpu-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('#gpu-power-curves .roofline-path')
      .should('have.length', 2)
      .each(($path) => expect($path.attr('d')).to.contain('C'));
    cy.get('[data-testid="power-curve-description"]').should('not.exist');
  });
});
