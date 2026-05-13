import GPUGraph from '@/components/inference/ui/GPUGraph';
import { mountWithProviders } from '../support/test-utils';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
} from '../support/mock-data';
import { Precision } from '@/lib/data-mappings';

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
          yLabel="Throughput / GPU (tok/s)"
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
          yLabel="Throughput / GPU (tok/s)"
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
          yLabel="Throughput / GPU (tok/s)"
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
          yLabel="Throughput / GPU (tok/s)"
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
          yLabel="Throughput / GPU (tok/s)"
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
          yLabel="Throughput / GPU (tok/s)"
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
