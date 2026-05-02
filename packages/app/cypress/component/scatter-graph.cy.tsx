import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { mountWithProviders } from '../support/test-utils';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
} from '../support/mock-data';
import { Precision } from '@/lib/data-mappings';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

describe('ScatterGraph', () => {
  it('renders SVG within chart container', () => {
    const data = [
      createMockInferenceData({ hwKey: 'b200_trt', x: 64, y: 320, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100', x: 32, y: 210, precision: Precision.FP4 }),
    ];

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter"
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
          activeHwTypes: new Set(['b200_trt', 'h100']),
          hwTypesWithData: new Set(['b200_trt', 'h100']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {},
      },
    );

    cy.get('#test-scatter svg').should('exist');
  });

  it('shows empty state when data array is empty', () => {
    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-empty"
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
          activeHwTypes: new Set(['b200_trt', 'h100']),
          hwTypesWithData: new Set(['b200_trt', 'h100']),
        },
        unofficial: {},
      },
    );

    cy.contains('No data available').should('be.visible');
  });

  it('renders scatter points as shapes in SVG with mock data', () => {
    const data = [
      createMockInferenceData({
        hwKey: 'b200_trt',
        x: 64,
        y: 320,
        conc: 64,
        precision: Precision.FP4,
      }),
      createMockInferenceData({ hwKey: 'h100', x: 32, y: 210, conc: 32, precision: Precision.FP4 }),
      createMockInferenceData({
        hwKey: 'mi300x',
        x: 16,
        y: 180,
        conc: 16,
        precision: Precision.FP4,
      }),
    ];

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-points"
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
          activeHwTypes: new Set(['b200_trt', 'h100', 'mi300x']),
          hwTypesWithData: new Set(['b200_trt', 'h100', 'mi300x']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {},
      },
    );

    // The scatter layer renders point groups with class 'dot-group'
    cy.get('#test-scatter-points svg .dot-group').should('exist');
    // Each point gets a <g> with a visible shape inside
    cy.get('#test-scatter-points svg .visible-shape').should('have.length.greaterThan', 0);
  });

  it('renders legend with hardware items', () => {
    const data = [
      createMockInferenceData({ hwKey: 'b200_trt', x: 64, y: 320, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100', x: 32, y: 210, precision: Precision.FP4 }),
    ];

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-legend"
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
          activeHwTypes: new Set(['b200_trt', 'h100']),
          hwTypesWithData: new Set(['b200_trt', 'h100']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {},
      },
    );

    cy.get('.sidebar-legend').should('exist');
    cy.get('.sidebar-legend label').should('have.length.greaterThan', 0);
  });

  it('renders line labels for both official and overlay (unofficial) rooflines', () => {
    const interactivityChartDef = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = [
      createMockInferenceData({ hwKey: 'h100', x: 8, y: 240, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100', x: 16, y: 200, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100', x: 32, y: 150, precision: Precision.FP4 }),
    ];
    const overlayData = {
      data: [
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 8,
          y: 320,
          precision: Precision.FP4,
          run_url: 'https://github.com/x/y/actions/runs/12345',
        }),
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 16,
          y: 280,
          precision: Precision.FP4,
          run_url: 'https://github.com/x/y/actions/runs/12345',
        }),
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 32,
          y: 220,
          precision: Precision.FP4,
          run_url: 'https://github.com/x/y/actions/runs/12345',
        }),
      ],
      hardwareConfig: hwConfig,
      label: 'feature-branch',
      runUrl: 'https://github.com/x/y/actions/runs/12345',
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-overlay-labels"
          modelLabel="DeepSeek R1"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / GPU (tok/s)"
          chartDefinition={interactivityChartDef}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['h100']),
          hwTypesWithData: new Set(['h100']),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['b200_trt']),
          allOverlayHwTypes: new Set(['b200_trt']),
          runIndexByUrl: { 'https://github.com/x/y/actions/runs/12345': 0, '12345': 0 },
          unofficialRunInfos: [
            {
              id: 12345,
              name: 'CI run',
              branch: 'feature-branch',
              sha: 'abc123',
              createdAt: '2026-05-01T00:00:00Z',
              url: 'https://github.com/x/y/actions/runs/12345',
              conclusion: 'success',
              status: 'completed',
              isNonMainBranch: true,
            },
          ],
        },
      },
    );

    // Both the official roofline and the overlay (unofficial) roofline render.
    cy.get('#test-scatter-overlay-labels svg .roofline-path').should('have.length.greaterThan', 0);
    cy.get('#test-scatter-overlay-labels svg .overlay-roofline-path').should(
      'have.length.greaterThan',
      0,
    );
    // Both an official-keyed and an overlay-keyed line label should render.
    cy.get('#test-scatter-overlay-labels svg .line-label').should('have.length.greaterThan', 0);
    cy.get('#test-scatter-overlay-labels svg .line-label')
      .filter('[data-line-key^="overlay-"]')
      .should('have.length.greaterThan', 0);
    cy.get('#test-scatter-overlay-labels svg .line-label')
      .filter('[data-line-key]:not([data-line-key^="overlay-"])')
      .should('have.length.greaterThan', 0);
    // Overlay label text is the run's branch name (matching the overlay legend),
    // not the hw label.
    cy.get('#test-scatter-overlay-labels svg .line-label[data-line-key^="overlay-"]')
      .find('text')
      .should('contain.text', 'feature-branch');
  });
});
