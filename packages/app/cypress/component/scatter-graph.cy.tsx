import { useReducer, useState } from 'react';
import { GlobalFilterSelectionContext } from '@/components/GlobalFilterContext';
import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import {
  overlaySelectionReducer,
  UnofficialRunContext,
} from '@/components/unofficial-run-provider';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { chartDefinitions } from '@/components/inference/metric-registry';
import ChartDisplay from '@/components/inference/ui/ChartDisplay';
import { mountWithProviders } from '../support/test-utils';
import { expandLegendAdvanced } from '../support/legend-advanced';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockGlobalFilterContexts,
  createMockInferenceContextValues,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { Model, Precision, Sequence } from '@/lib/data-mappings';
import { buildExclusion, resolveExclusionGroups } from '@/lib/exclusion';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

describe('ScatterGraph', () => {
  for (const mixedRuns of [false, true]) {
    it(`${mixedRuns ? 'hides' : 'shows'} the refresh changelog for a ${mixedRuns ? 'mixed' : 'matching'} run series`, () => {
      const refreshUrl =
        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33219708211/attempts/1';
      const point = createMockInferenceData({
        hwKey: 'gb300_dynamo-trt',
        model: Model.Qwen3_5,
        run_url: refreshUrl,
        benchmark_type: 'agentic_traces',
      });
      const description = 'Refresh to collect TensorRT-LLM server metrics.';
      mountWithProviders(
        <div style={{ width: 1000, height: 600 }}>
          <ScatterGraph
            chartId="changelog-provenance"
            modelLabel="Qwen3.5 397B"
            data={
              mixedRuns
                ? [
                    point,
                    {
                      ...point,
                      x: 50,
                      run_url:
                        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/31927376673/attempts/1',
                    },
                  ]
                : [point]
            }
            xLabel="Interactivity"
            yLabel="Throughput"
            chartDefinition={defaultChartDef}
          />
        </div>,
        {
          inference: {
            selectedModel: Model.Qwen3_5,
            selectedSequence: Sequence.AgenticTraces,
            selectedRunId: '33219708211',
            selectedPrecisions: [Precision.FP4],
            activeHwTypes: new Set(['gb300_dynamo-trt']),
            hwTypesWithData: new Set(['gb300_dynamo-trt']),
            hardwareConfig: {
              'gb300_dynamo-trt': {
                name: 'gb300-dynamo-trt',
                label: 'GB300',
                suffix: '(Dynamo TRTLLM)',
                gpu: 'GB300',
              },
            },
            availableRuns: {
              '33219708211': {
                runId: '33219708211',
                runUrl: refreshUrl,
                runDate: '2026-09-01',
                conclusion: 'success',
                changelog: {
                  entries: [
                    {
                      config_keys: ['qwen3.5-fp4-gb300-dynamo-trt-agentic-disagg'],
                      description,
                      pr_link: null,
                    },
                  ],
                },
              },
            },
          },
          unofficial: {},
        },
      );
      cy.get('label[for="checkbox-gb300_dynamo-trt"]')
        .parent()
        .trigger('pointermove', { pointerType: 'mouse' });
      cy.contains('[role="tooltip"]', description).should(mixedRuns ? 'not.exist' : 'exist');
    });
  }

  it('offers the complete table when matching official points are all clipped', () => {
    const point = createMockInferenceData({ hwKey: 'b200_trt', precision: Precision.FP4 });
    mountWithProviders(
      <div style={{ width: 800 }}>
        <ScatterGraph
          chartId="empty-clipped"
          modelLabel="DeepSeek R1"
          data={[]}
          clippedData={[{ point, reasons: ['cost'] }]}
          xLabel="Concurrency"
          yLabel="Cost"
          chartDefinition={defaultChartDef}
          onShowTable={cy.stub().as('showCompleteTable')}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['b200_trt']),
          hwTypesWithData: new Set(['b200_trt']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {},
      },
    );
    cy.get('[data-testid="scatter-empty-state"]').should('have.attr', 'data-reason', 'clipped');
    cy.get('[data-testid="scatter-empty-show-table"]').click();
    cy.get('@showCompleteTable').should('have.been.calledOnce');
    cy.get('@setQuickFilterVendors').should('not.have.been.called');
    cy.get('@selectAllHwTypes').should('not.have.been.called');
  });

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
          yLabel="Throughput / Chip (tok/s)"
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
          yLabel="Throughput / Chip (tok/s)"
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

  it('explains when the selected dataset lacks role-local energy', () => {
    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-role-energy-empty"
          modelLabel="DeepSeek R1"
          data={[]}
          xLabel="Interactivity"
          yLabel="Measured Prefill J per Input Token"
          chartDefinition={defaultChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['mi355x']),
          hwTypesWithData: new Set(),
          selectedYAxisMetric: 'y_measuredPrefillJPerInputToken',
        },
        unofficial: {},
      },
    );

    cy.contains('This dataset does not report role-level prefill/decode energy.').should(
      'be.visible',
    );
    cy.contains(
      'No measurements to plot for this selection. Review the benchmark controls above or adjust quick filters.',
    ).should('not.exist');
  });

  it('localizes the complete Chinese empty state', () => {
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <div style={{ width: 375, height: 600 }}>
          <ScatterGraph
            chartId="test-scatter-empty-zh"
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
          activeHwTypes: new Set(['b200_trt']),
          hwTypesWithData: new Set(['b200_trt']),
        },
        unofficial: {},
      },
    );
    cy.contains('暂无数据').should('be.visible');
    cy.contains('请检查上方的基准测试设置，或调整快捷筛选。').should('be.visible');
    cy.contains('No data available').should('not.exist');
  });

  it('localizes the missing role-energy explanation', () => {
    mountWithProviders(
      <PathnameContext.Provider value="/zh/inference">
        <div style={{ width: 375, height: 600 }}>
          <ScatterGraph
            chartId="test-scatter-role-energy-empty-zh"
            modelLabel="DeepSeek R1"
            data={[]}
            xLabel="交互性"
            yLabel="每输入 token 实测 Prefill 能耗"
            chartDefinition={defaultChartDef}
          />
        </div>
      </PathnameContext.Provider>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['mi355x']),
          hwTypesWithData: new Set(),
          selectedYAxisMetric: 'y_measuredPrefillJPerInputToken',
        },
        unofficial: {},
      },
    );

    cy.contains('当前数据集未提供 Prefill/Decode 各角色的能耗数据。').should('be.visible');
    cy.contains('当前选择没有可绘制的测量数据。请检查上方的基准测试设置，或调整快捷筛选。').should(
      'not.exist',
    );
  });

  for (const selectedYAxisMetric of ['y_tpPerGpu', 'y_measuredPrefillJPerInputToken'] as const) {
    it(`offers targeted quick-filter recovery on ${selectedYAxisMetric} without changing model, precision or date`, () => {
      mountWithProviders(
        <div style={{ width: 800 }}>
          <ScatterGraph
            chartId="empty-filtered"
            modelLabel="DeepSeek R1"
            data={[]}
            xLabel="Concurrency"
            yLabel="Throughput"
            chartDefinition={defaultChartDef}
          />
        </div>,
        {
          inference: {
            selectedYAxisMetric,
            quickFilters: {
              vendors: ['AMD'],
              frameworks: ['vllm'],
              deployment: [],
              spec: [],
              power: [],
            },
          },
          unofficial: {},
        },
      );
      cy.get('[data-testid="scatter-empty-state"]').should('have.attr', 'data-reason', 'filtered');
      cy.contains('No points match this selection. Try removing a quick filter;').should(
        'be.visible',
      );
      cy.contains('This dataset does not report role-level prefill/decode energy.').should(
        'not.exist',
      );
      cy.get('[data-testid="scatter-empty-clear-filters"]').click();
      cy.get('@setQuickFilterVendors').should('have.been.calledWith', []);
      cy.get('@setQuickFilterFrameworks').should('have.been.calledWith', []);
      cy.get('@setSelectedModel').should('not.have.been.called');
      cy.get('@setSelectedPrecisions').should('not.have.been.called');
      cy.get('@setSelectedDateRange').should('not.have.been.called');
    });
  }

  it('restores hidden matching official and unofficial chip series together', () => {
    const restore = cy.stub().as('restoreUnified');
    const official = createMockInferenceData({ hwKey: 'b200_trt', precision: Precision.FP4 });
    const overlay = createMockInferenceData({ hwKey: 'h100', precision: Precision.FP4 });
    mountWithProviders(
      <div style={{ width: 800 }}>
        <ScatterGraph
          chartId="empty-hidden"
          modelLabel="DeepSeek R1"
          data={[official]}
          xLabel="Concurrency"
          yLabel="Throughput"
          chartDefinition={defaultChartDef}
          overlayData={{ data: [overlay], hardwareConfig: hwConfig, label: 'test-run' }}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(),
          hwTypesWithData: new Set(['b200_trt']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {
          isUnofficialRun: true,
          localOfficialOverride: new Set(),
          activeOverlayHwTypes: new Set(),
          allOverlayHwTypes: new Set(['h100']),
          setUnifiedOverlaySelection: restore,
        },
      },
    );
    cy.get('[data-testid="scatter-empty-state"]').should('have.attr', 'data-reason', 'hidden');
    cy.get('[data-testid="scatter-empty-show-chips"]').click();
    cy.get('@restoreUnified')
      .should('have.been.calledOnce')
      .then(() => {
        expect([...restore.lastCall.args[0]]).to.include('b200_trt');
        expect([...restore.lastCall.args[1]]).to.include('h100');
      });
    cy.get('@setQuickFilterVendors').should('not.have.been.called');
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
          yLabel="Throughput / Chip (tok/s)"
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

  it('keeps official-only legend toggles active after a scope change', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = ['b200_sglang', 'h100_vllm'].flatMap((hwKey, hwIndex) =>
      [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey,
          x,
          y: 320 - hwIndex * 20 - index * 40,
          precision: Precision.FP4,
        }),
      ),
    );
    const baseInference = createMockInferenceContextValues();

    function OfficialScopeHarness() {
      const [secondScope, setSecondScope] = useState(false);
      const activeHwTypes = new Set([secondScope ? 'h100_vllm' : 'b200_sglang']);
      const selectedModel = secondScope ? Model.DeepSeek_R1 : Model.DeepSeek_V4_Pro;
      const inference = {
        ...baseInference,
        hardwareConfig: hwConfig,
        activeHwTypes,
        hwTypesWithData: new Set(['b200_sglang', 'h100_vllm']),
        selectedModel,
        selectedSequence: Sequence.AgenticTraces,
        selectedPrecisions: [Precision.FP4],
      };

      return (
        <InferenceContextsProvider
          data={inference}
          filters={inference}
          display={inference}
          actions={inference}
        >
          <button data-testid="change-official-scope" onClick={() => setSecondScope(true)}>
            Change official scope
          </button>
          <div style={{ width: 800, height: 600 }}>
            <ScatterGraph
              chartId="test-scatter-official-scope"
              modelLabel={selectedModel}
              data={officialData}
              xLabel="Concurrency"
              yLabel="Throughput / Chip (tok/s)"
              chartDefinition={chartDefinition}
            />
          </div>
        </InferenceContextsProvider>
      );
    }

    mountWithProviders(<OfficialScopeHarness />, { unofficial: {} });

    cy.get('#test-scatter-official-scope svg .roofline-path[data-hw-key="b200_sglang"]').should(
      'have.css',
      'opacity',
      '1',
    );
    cy.get('#test-scatter-official-scope svg .roofline-path[data-hw-key="h100_vllm"]').should(
      'have.css',
      'opacity',
      '0',
    );

    cy.get('[data-testid="change-official-scope"]').click();
    cy.get('#test-scatter-official-scope svg .roofline-path[data-hw-key="b200_sglang"]').should(
      'have.css',
      'opacity',
      '0',
    );
    cy.get('#test-scatter-official-scope svg .roofline-path[data-hw-key="h100_vllm"]').should(
      'have.css',
      'opacity',
      '1',
    );
  });

  it('keeps a preview scope pending until official data arrives', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const baseInference = createMockInferenceContextValues();
    const baseUnofficial = createMockUnofficialRunContext();

    function DelayedOfficialScopeHarness() {
      const [secondScope, setSecondScope] = useState(false);
      const [secondScopeLoaded, setSecondScopeLoaded] = useState(false);
      const [activeOverlayKeys, setActiveOverlayKeys] = useState(new Set(['h100_vllm']));
      const [officialOverride, setOfficialOverride] = useState<Set<string> | null>(
        new Set(['h100_sglang']),
      );
      const model = secondScope ? Model.DeepSeek_R1 : Model.DeepSeek_V4_Pro;
      const officialKeys = secondScope ? ['b200_sglang', 'h100_vllm'] : ['h100_sglang'];
      const visibleOfficialKeys = secondScope && !secondScopeLoaded ? [] : officialKeys;
      const officialRows = visibleOfficialKeys.flatMap((hwKey, hwIndex) =>
        [8, 16, 32].map((x, index) =>
          createMockInferenceData({
            hwKey,
            model,
            x,
            y: 320 - hwIndex * 20 - index * 40,
            precision: Precision.FP4,
          }),
        ),
      );
      const overlayKey = secondScope ? 'b200_vllm' : 'h100_vllm';
      const overlayData = {
        data: [8, 16, 32].map((x, index) =>
          createMockInferenceData({
            hwKey: overlayKey,
            model,
            x,
            y: 260 - index * 40,
            precision: Precision.FP4,
          }),
        ),
        hardwareConfig: hwConfig,
        label: 'delayed-official-scope',
      };
      const inference = {
        ...baseInference,
        hardwareConfig: hwConfig,
        activeHwTypes: new Set([officialKeys[0]]),
        hwTypesWithData: new Set(visibleOfficialKeys),
        loading: secondScope && !secondScopeLoaded,
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        selectedPrecisions: [Precision.FP4],
      };
      const unofficial = {
        ...baseUnofficial,
        isUnofficialRun: true,
        activeOverlayHwTypes: activeOverlayKeys,
        setUnifiedOverlaySelection: (official: Set<string>, overlay: Set<string>) => {
          setOfficialOverride(official);
          setActiveOverlayKeys(overlay);
        },
        allOverlayHwTypes: new Set(['h100_vllm', 'b200_vllm']),
        localOfficialOverride: officialOverride,
      };

      return (
        <UnofficialRunContext.Provider value={unofficial}>
          <InferenceContextsProvider
            data={inference}
            filters={inference}
            display={inference}
            actions={inference}
          >
            <button data-testid="change-delayed-chart-scope" onClick={() => setSecondScope(true)}>
              Change scope
            </button>
            <button
              data-testid="load-delayed-chart-scope"
              onClick={() => {
                setOfficialOverride(new Set(officialKeys));
                setSecondScopeLoaded(true);
              }}
            >
              Load official data
            </button>
            <output data-testid="official-preview-override">
              {officialOverride === null ? 'none' : [...officialOverride].join(',')}
            </output>
            <div style={{ width: 800, height: 600 }}>
              <ScatterGraph
                chartId="test-scatter-delayed-official-scope"
                modelLabel={model}
                data={officialRows}
                xLabel="Concurrency"
                yLabel="Throughput / Chip (tok/s)"
                chartDefinition={chartDefinition}
                overlayData={overlayData}
              />
            </div>
          </InferenceContextsProvider>
        </UnofficialRunContext.Provider>
      );
    }

    mountWithProviders(<DelayedOfficialScopeHarness />);
    cy.get('[data-testid="change-delayed-chart-scope"]').click();
    cy.get('[data-testid="official-preview-override"]').should('have.text', 'h100_sglang');

    cy.get('[data-testid="load-delayed-chart-scope"]').click();
    cy.get(
      '#test-scatter-delayed-official-scope svg .roofline-path[data-hw-key="b200_sglang"]',
    ).should('have.css', 'opacity', '1');
    cy.get(
      '#test-scatter-delayed-official-scope svg .roofline-path[data-hw-key="h100_vllm"]',
    ).should('have.css', 'opacity', '1');
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
          yLabel="Throughput / Chip (tok/s)"
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
    const runId = 32177976542;
    const runBranch = 'qwen3.5-fp4-gb200-dynamo-sglang-agentic-mtp-pareto-refresh';
    const runUrl = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`;
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
          run_url: runUrl,
        }),
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 16,
          y: 280,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 32,
          y: 220,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ],
      hardwareConfig: hwConfig,
      label: runBranch,
      runUrl,
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-overlay-labels"
          modelLabel="DeepSeek R1"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
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
          runIndexByUrl: { [runUrl]: 0, [String(runId)]: 0 },
          unofficialRunInfos: [
            {
              id: runId,
              name: 'CI run',
              branch: runBranch,
              sha: '7a4a06b',
              createdAt: '2026-08-18T19:40:51Z',
              url: runUrl,
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
    // The exact branch that crashed the production page remains visible in the
    // overlay line label and legend after ScatterGraph's render-time updates.
    cy.get('#test-scatter-overlay-labels svg .line-label[data-line-key^="overlay-"]')
      .find('text')
      .should('contain.text', runBranch);
    cy.get(
      '#test-scatter-overlay-labels svg .line-label[data-line-key^="overlay-"] .ll-gpu',
    ).should('not.exist');
    cy.get('#test-scatter-overlay-labels [data-testid="chart-legend"]').should(
      'contain.text',
      runBranch,
    );
  });

  it('places precision between the GPU and engine in multi-precision labels', () => {
    const runUrl = 'https://github.com/x/y/actions/runs/precision-order';
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const data = [Precision.FP4, Precision.FP8].flatMap((precision, precisionIndex) =>
      [8, 16].map((x, index) =>
        createMockInferenceData({
          hwKey: 'b200_trt',
          x,
          y: 320 - precisionIndex * 20 - index * 40,
          precision,
        }),
      ),
    );
    const overlayData = {
      data: [Precision.FP4, Precision.FP8].flatMap((precision, precisionIndex) =>
        [8, 16].map((x, index) =>
          createMockInferenceData({
            hwKey: 'h100_vllm',
            x,
            y: 260 - precisionIndex * 20 - index * 40,
            precision,
            run_url: runUrl,
          }),
        ),
      ),
      hardwareConfig: hwConfig,
      label: '',
      runUrl,
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-precision-order"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={chartDefinition}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['b200_trt']),
          hwTypesWithData: new Set(['b200_trt']),
          selectedPrecisions: [Precision.FP4, Precision.FP8],
          showLineLabels: true,
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['h100_vllm']),
          allOverlayHwTypes: new Set(['h100_vllm']),
          runIndexByUrl: { [runUrl]: 0, 'precision-order': 0 },
          // No run metadata: exercise the hardware-label fallback path.
          unofficialRunInfos: [],
        },
      },
    );

    cy.get('#test-scatter-precision-order svg .line-label[data-hw-key="b200_trt"] .ll-text')
      .should('have.length', 2)
      .then(($labels) => {
        expect($labels.toArray().map((label) => label.textContent)).to.have.members([
          'B200 FP4 (TRTLLM)',
          'B200 FP8 (TRTLLM)',
        ]);
        for (const label of $labels) {
          expect(
            [...label.querySelectorAll('tspan')].map((segment) => segment.className.baseVal),
          ).to.deep.equal(['ll-gpu', 'll-precision', 'll-engine']);
        }
      });
    cy.get('#test-scatter-precision-order svg .line-label[data-line-key^="overlay-"] .ll-text')
      .should('have.length', 2)
      .then(($labels) => {
        expect($labels.toArray().map((label) => label.textContent)).to.have.members([
          'H100 FP4 (vLLM)',
          'H100 FP8 (vLLM)',
        ]);
      });
  });

  it('renders a line label for a singleton unofficial overlay series', () => {
    const runUrl = 'https://github.com/x/y/actions/runs/31266452885';
    const interactivityChartDef = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const overlayData = {
      data: [
        createMockInferenceData({
          hwKey: 'b200_trt',
          x: 24,
          y: 310,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ],
      hardwareConfig: hwConfig,
      label: 'tileRT',
      runUrl,
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-singleton-overlay-label"
          modelLabel="DeepSeek R1"
          data={[]}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={interactivityChartDef}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(),
          hwTypesWithData: new Set(),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['b200_trt']),
          allOverlayHwTypes: new Set(['b200_trt']),
          runIndexByUrl: { [runUrl]: 0, '31266452885': 0 },
          unofficialRunInfos: [
            {
              id: 31266452885,
              name: 'CI run',
              branch: 'tileRT',
              sha: 'abc123',
              createdAt: '2026-08-09T00:00:00Z',
              url: runUrl,
              conclusion: 'success',
              status: 'completed',
              isNonMainBranch: true,
            },
          ],
        },
      },
    );

    cy.get('#test-scatter-singleton-overlay-label svg .unofficial-overlay-pt').should(
      'have.length',
      1,
    );
    cy.get('#test-scatter-singleton-overlay-label svg .line-label[data-line-key^="overlay-"]')
      .should('have.length', 1)
      .find('text')
      .should('contain.text', 'tileRT');

    cy.get('#test-scatter-singleton-overlay-label svg').then(($svg) => {
      const svg = $svg[0];
      const bounds = svg.getBoundingClientRect();
      svg.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -240,
          clientX: bounds.x + bounds.width / 2,
          clientY: bounds.y + bounds.height / 2,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    cy.get(
      '#test-scatter-singleton-overlay-label svg .line-label[data-line-key^="overlay-"]',
    ).should('have.css', 'opacity', '1');
  });

  it('renders a line label for a singleton ingested hardware series', () => {
    const interactivityChartDef = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const data = [
      createMockInferenceData({
        hwKey: 'b200_tilert_mtp',
        x: 340,
        y: 150,
        precision: Precision.FP8,
      }),
      createMockInferenceData({ hwKey: 'h100', x: 300, y: 190, precision: Precision.FP8 }),
      createMockInferenceData({ hwKey: 'h100', x: 340, y: 150, precision: Precision.FP8 }),
    ];
    const baseInference = createMockInferenceContextValues();

    function IngestedSingletonLabelHarness() {
      const [showLineLabels, setShowLineLabels] = useState(true);
      const inference = {
        ...baseInference,
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200_tilert_mtp', 'h100']),
        hwTypesWithData: new Set(['b200_tilert_mtp', 'h100']),
        selectedPrecisions: [Precision.FP8],
        showLineLabels,
        setShowLineLabels,
      };
      return (
        <InferenceContextsProvider
          data={inference}
          filters={inference}
          display={inference}
          actions={inference}
        >
          <div style={{ width: 800, height: 600 }}>
            <ScatterGraph
              chartId="test-scatter-ingested-singleton-label"
              modelLabel="GLM5/5.1 744B"
              data={data}
              xLabel="Interactivity (tok/s/user)"
              yLabel="Token Throughput per GPU"
              chartDefinition={interactivityChartDef}
            />
          </div>
        </InferenceContextsProvider>
      );
    }

    mountWithProviders(<IngestedSingletonLabelHarness />, { unofficial: {} });

    cy.get('#test-scatter-ingested-singleton-label svg .unofficial-overlay-pt').should('not.exist');
    cy.get('#test-scatter-ingested-singleton-label svg .line-label[data-hw-key="b200_tilert_mtp"]')
      .should('have.css', 'opacity', '1')
      .find('text')
      .should('have.text', 'B200 (TileRT, MTP)');
    cy.get(
      '#test-scatter-ingested-singleton-label svg .line-label[data-hw-key="b200_tilert_mtp"] .ll-gpu',
    )
      .should('have.text', 'B200')
      .and('have.attr', 'font-weight', '700');
    cy.get(
      '#test-scatter-ingested-singleton-label svg .line-label[data-hw-key="b200_tilert_mtp"] .ll-engine',
    )
      .should('have.text', ' (TileRT, MTP)')
      .and('have.attr', 'fill', '#d1d5db');

    expandLegendAdvanced();
    cy.get('#scatter-line-labels').click();
    cy.get('#test-scatter-ingested-singleton-label svg .line-label').should('not.exist');
    cy.get('#scatter-line-labels').click();
    cy.get('#test-scatter-ingested-singleton-label svg .line-label[data-hw-key="b200_tilert_mtp"]')
      .should('have.css', 'opacity', '1')
      .find('text')
      .should('have.text', 'B200 (TileRT, MTP)');
  });

  it('renders M3 mtp rooflines with the EAGLE label (official + overlay)', () => {
    const interactivityChartDef = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = [
      createMockInferenceData({ hwKey: 'h100_vllm_mtp', x: 8, y: 240, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100_vllm_mtp', x: 16, y: 200, precision: Precision.FP4 }),
      createMockInferenceData({ hwKey: 'h100_vllm_mtp', x: 32, y: 150, precision: Precision.FP4 }),
    ];
    // Overlay roofline with no run metadata, so its line label falls back to the
    // hw label — exercising the overlay path's model-aware suffix resolution.
    const runUrl = 'https://github.com/x/y/actions/runs/999';
    const overlayData = {
      data: [
        createMockInferenceData({
          hwKey: 'b200_vllm_mtp',
          x: 8,
          y: 320,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
        createMockInferenceData({
          hwKey: 'b200_vllm_mtp',
          x: 16,
          y: 280,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
        createMockInferenceData({
          hwKey: 'b200_vllm_mtp',
          x: 32,
          y: 220,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ],
      hardwareConfig: hwConfig,
      label: '',
      runUrl,
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-m3-eagle"
          modelLabel="MiniMax-M3"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={interactivityChartDef}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['h100_vllm_mtp']),
          hwTypesWithData: new Set(['h100_vllm_mtp']),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['b200_vllm_mtp']),
          allOverlayHwTypes: new Set(['b200_vllm_mtp']),
          runIndexByUrl: { [runUrl]: 0, '999': 0 },
          // Intentionally empty so the overlay label falls back to the hw label.
          unofficialRunInfos: [],
        },
      },
    );

    // Official roofline label reads "EAGLE", not the generic "MTP".
    cy.get('#test-scatter-m3-eagle svg .line-label')
      .filter('[data-line-key]:not([data-line-key^="overlay-"])')
      .find('text')
      .should('contain.text', 'EAGLE');
    // Overlay roofline (no run metadata → hw-label fallback) also reads "EAGLE".
    cy.get('#test-scatter-m3-eagle svg .line-label[data-line-key^="overlay-"]')
      .find('text')
      .should('contain.text', 'EAGLE');
    cy.get('#test-scatter-m3-eagle svg .line-label[data-line-key^="overlay-"] .ll-gpu')
      .should('have.text', 'B200')
      .and('have.attr', 'font-weight', '700');
    cy.get('#test-scatter-m3-eagle svg .line-label[data-line-key^="overlay-"] .ll-engine')
      .should('contain.text', 'EAGLE')
      .and('have.attr', 'fill', '#d1d5db');
    // No label should show the generic MTP token for M3.
    cy.get('#test-scatter-m3-eagle svg .line-label text').should('not.contain.text', 'MTP');
  });

  it('renders cross-engine official and unofficial AgentX STP series together in preview mode', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = ['b200_sglang', 'h100_vllm'].flatMap((hwKey, hwIndex) =>
      [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey,
          x,
          y: 320 - hwIndex * 20 - index * 40,
          precision: Precision.FP4,
        }),
      ),
    );
    const runUrl = 'https://github.com/x/y/actions/runs/agentx-vllm';
    const overlayData = {
      data: [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey: 'h100_vllm',
          x,
          y: 260 - index * 40,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ),
      hardwareConfig: hwConfig,
      label: 'agentx-vllm',
      runUrl,
    };
    const exclusion = buildExclusion([
      {
        suffix: null,
        stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
        scope: 'hardware',
      },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      scopesOf: (key: string) =>
        exclusion.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };
    const blockedToggle = cy.stub().as('blockedComparisonToggle').returns(null);

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-agentx-engine-guard"
          modelLabel="DeepSeek V4 Pro"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={chartDefinition}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['b200_sglang']),
          hwTypesWithData: new Set(['b200_sglang', 'h100_vllm']),
          selectedModel: Model.DeepSeek_V4_Pro,
          selectedSequence: Sequence.AgenticTraces,
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
          resolveComparisonSelection: (proposed, prev = new Set()) =>
            resolveExclusionGroups(proposed, prev, namespacedExclusion, 'keep-sticky'),
          toggleComparisonSelection: blockedToggle,
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['h100_vllm']),
          allOverlayHwTypes: new Set(['h100_vllm']),
        },
      },
    );

    // Preview mode is diagnostic, so cross-engine official and unofficial
    // results remain visible together instead of choosing one engine family.
    cy.get('#test-scatter-agentx-engine-guard svg .overlay-roofline-path').should('exist');
    cy.get(
      '#test-scatter-agentx-engine-guard svg .roofline-path[data-hw-key="b200_sglang"]',
    ).should('have.css', 'opacity', '1');
    // The exclusion resolver must be bypassed rather than resolving in favor of
    // either the official or overlay engine family.
    cy.get('@setUnifiedOverlaySelection').should('not.have.been.called');

    // An additional official engine can also be selected while the preview is
    // loaded; the production-only conflict toggle must not be consulted.
    cy.get('label[for="checkbox-h100_vllm"]').click();
    cy.get('@blockedComparisonToggle').should('not.have.been.called');
    cy.get('@setUnifiedOverlaySelection').should((setSelection) => {
      const official = setSelection.lastCall.args[0] as Set<string>;
      expect([...official]).to.have.members(['b200_sglang', 'h100_vllm']);
    });
  });

  it('keeps the unofficial overlay active when soloing an official hardware series', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = ['b200_sglang', 'h100_vllm'].flatMap((hwKey, hwIndex) =>
      [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey,
          x,
          y: 320 - hwIndex * 20 - index * 40,
          precision: Precision.FP4,
        }),
      ),
    );
    const runUrl = 'https://github.com/x/y/actions/runs/official-solo';
    const overlayData = {
      data: [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey: 'h100_vllm',
          x,
          y: 260 - index * 40,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ),
      hardwareConfig: hwConfig,
      label: 'official-solo',
      runUrl,
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-official-solo"
          modelLabel="DeepSeek V4 Pro"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={chartDefinition}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['b200_sglang', 'h100_vllm']),
          hwTypesWithData: new Set(['b200_sglang', 'h100_vllm']),
          selectedModel: Model.DeepSeek_V4_Pro,
          selectedSequence: Sequence.AgenticTraces,
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['h100_vllm']),
          allOverlayHwTypes: new Set(['h100_vllm']),
        },
      },
    );

    cy.get('#test-scatter-official-solo svg .overlay-roofline-path').should('exist');
    cy.get('label[for="checkbox-h100_vllm"]').click();
    cy.get('@setUnifiedOverlaySelection').should((setSelection) => {
      const official = setSelection.lastCall.args[0] as Set<string>;
      const overlay = setSelection.lastCall.args[1] as Set<string>;
      expect([...official]).to.deep.equal(['h100_vllm']);
      expect([...overlay]).to.deep.equal(['h100_vllm']);
    });
  });

  it('renders both official and overlay AgentX STP series from the same engine family', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = [8, 16, 32].map((x, index) =>
      createMockInferenceData({
        hwKey: 'b200_vllm',
        x,
        y: 320 - index * 40,
        precision: Precision.FP4,
      }),
    );
    const runUrl = 'https://github.com/x/y/actions/runs/agentx-vllm-same-family';
    const overlayData = {
      data: [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey: 'h100_vllm',
          x,
          y: 260 - index * 40,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ),
      hardwareConfig: hwConfig,
      label: 'agentx-vllm-same-family',
      runUrl,
    };
    const exclusion = buildExclusion([
      {
        suffix: null,
        stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
        scope: 'hardware',
      },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      scopesOf: (key: string) =>
        exclusion.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-agentx-same-family"
          modelLabel="DeepSeek V4 Pro"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={chartDefinition}
          overlayData={overlayData}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          activeHwTypes: new Set(['b200_vllm']),
          hwTypesWithData: new Set(['b200_vllm']),
          selectedModel: Model.DeepSeek_V4_Pro,
          selectedSequence: Sequence.AgenticTraces,
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
          resolveComparisonSelection: (proposed, prev = new Set()) =>
            resolveExclusionGroups(proposed, prev, namespacedExclusion, 'keep-sticky'),
        },
        unofficial: {
          activeOverlayHwTypes: new Set(['h100_vllm']),
          allOverlayHwTypes: new Set(['h100_vllm']),
        },
      },
    );

    // Same engine family: no exclusion applies, both series render.
    cy.get('#test-scatter-agentx-same-family svg .overlay-roofline-path').should('exist');
    cy.get('#test-scatter-agentx-same-family svg .roofline-path').should(
      'have.css',
      'opacity',
      '1',
    );
  });

  it('removes unofficial marks when the last preview run is dismissed', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      y_tpPerGpu_roofline: 'upper_left',
    });
    const officialData = [8, 16, 32].map((x, index) =>
      createMockInferenceData({
        hwKey: 'b200_sglang',
        x,
        y: 320 - index * 40,
        precision: Precision.FP4,
      }),
    );
    const runUrl = 'https://github.com/x/y/actions/runs/dismissed-preview';
    const overlayData = {
      data: [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey: 'h100_vllm',
          x,
          y: 260 - index * 40,
          precision: Precision.FP4,
          run_url: runUrl,
        }),
      ),
      hardwareConfig: hwConfig,
      label: 'dismissed-preview',
      runUrl,
    };

    function DismissOverlayHarness() {
      const [showOverlay, setShowOverlay] = useState(true);
      return (
        <div style={{ width: 800, height: 600 }}>
          <button data-testid="dismiss-preview" onClick={() => setShowOverlay(false)}>
            Dismiss preview
          </button>
          <ScatterGraph
            chartId="test-scatter-dismiss-preview"
            modelLabel="DeepSeek V4 Pro"
            data={officialData}
            xLabel="Concurrency"
            yLabel="Throughput / Chip (tok/s)"
            chartDefinition={chartDefinition}
            overlayData={showOverlay ? overlayData : undefined}
          />
        </div>
      );
    }

    mountWithProviders(<DismissOverlayHarness />, {
      inference: {
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang']),
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedPrecisions: [Precision.FP4],
      },
      unofficial: {
        isUnofficialRun: true,
        activeOverlayHwTypes: new Set(['h100_vllm']),
        allOverlayHwTypes: new Set(['h100_vllm']),
      },
    });

    cy.get('#test-scatter-dismiss-preview svg .unofficial-overlay-pt').should('have.length', 3);
    cy.get('#test-scatter-dismiss-preview svg .overlay-roofline-path').should('exist');

    cy.get('[data-testid="dismiss-preview"]').click();
    cy.get('#test-scatter-dismiss-preview svg .unofficial-overlay-pt').should('not.exist');
    cy.get('#test-scatter-dismiss-preview svg .overlay-roofline-path').should('not.exist');
  });

  it('clears perf rulers when the y-axis or x-axis metric changes', () => {
    const chartId = 'test-scatter-perf-ruler-axis-reset';
    // Distinct `conc` per point keeps the D3 join keys unique, as they are
    // for real runs; the metric-change update matches marks by that key.
    const officialData = ['b200_sglang', 'h100_vllm'].flatMap((hwKey, hwIndex) =>
      [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey,
          x,
          y: 320 - hwIndex * 120 - index * 40,
          conc: x,
          precision: Precision.FP4,
        }),
      ),
    );
    const baseInference = createMockInferenceContextValues();

    function AxisMetricHarness() {
      const [yMetric, setYMetric] = useState('y_tpPerGpu');
      const [xField, setXField] = useState('p90_e2el');
      const chartDefinition = createMockChartDefinition({
        chartType: 'interactivity',
        x_scale_field: xField,
        y_tpPerGpu_roofline: 'upper_left',
        y_totalTokensPerDollarTco_roofline: 'upper_left',
      });
      const inference = {
        ...baseInference,
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200_sglang', 'h100_vllm']),
        hwTypesWithData: new Set(['b200_sglang', 'h100_vllm']),
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedPrecisions: [Precision.FP4],
        selectedYAxisMetric: yMetric,
      };

      return (
        <InferenceContextsProvider
          data={inference}
          filters={inference}
          display={inference}
          actions={inference}
        >
          <button
            data-testid="change-y-metric"
            onClick={() => setYMetric('y_totalTokensPerDollarTco')}
          >
            Change y metric
          </button>
          <button data-testid="change-x-metric" onClick={() => setXField('p90_ttft')}>
            Change x metric
          </button>
          <div style={{ width: 800, height: 600 }}>
            <ScatterGraph
              chartId={chartId}
              modelLabel={Model.DeepSeek_V4_Pro}
              data={officialData}
              xLabel="P90 End-to-end Latency (s)"
              yLabel="Throughput / Chip (tok/s)"
              chartDefinition={chartDefinition}
            />
          </div>
        </InferenceContextsProvider>
      );
    }

    mountWithProviders(<AxisMetricHarness />, { unofficial: {} });

    // Ruler mode exposes one widened hit stroke per visible roofline; clicking
    // two of them completes a measurement.
    const placeRuler = () => {
      cy.get(`#${chartId} svg .perf-ruler-hit`).should('have.length', 2);
      cy.get(`#${chartId} svg .perf-ruler-hit`).eq(0).click({ force: true });
      cy.get(`#${chartId} svg .perf-ruler-hit`).eq(1).click({ force: true });
      cy.get(`#${chartId} svg .perf-ruler`).should('have.length', 1);
    };

    // Clearing the rulers also drops the "clear rulers" legend entry, which
    // narrows the sidebar and rebuilds the chart while the metric-change
    // tween is still running. Both three-point curves must still be drawn
    // as real curves afterwards (a stale tween used to collapse them onto a
    // single coordinate).
    const expectCurvesIntact = () => {
      cy.get(`#${chartId} svg .roofline-path`)
        .should('have.length', 2)
        .each(($path) => {
          expect($path.attr('d')).to.match(/C/);
        });
    };

    expectCurvesIntact();
    expandLegendAdvanced();
    cy.get('#scatter-perf-ruler').click({ force: true });
    placeRuler();

    // Switching the y-axis metric redraws the curves in new units: the ruler
    // must not survive. Ruler mode itself stays on so the user can measure
    // again without re-enabling it.
    cy.get('[data-testid="change-y-metric"]').click();
    cy.get(`#${chartId} svg .perf-ruler`).should('not.exist');
    cy.get('#scatter-perf-ruler').should('have.attr', 'aria-checked', 'true');
    expectCurvesIntact();
    placeRuler();

    // Same for the x-axis metric (the resolved `x_scale_field`).
    cy.get('[data-testid="change-x-metric"]').click();
    cy.get(`#${chartId} svg .perf-ruler`).should('not.exist');
    cy.get('#scatter-perf-ruler').should('have.attr', 'aria-checked', 'true');
    expectCurvesIntact();
    placeRuler();
  });
});

describe('ChartDisplay responsive status notes', () => {
  for (const locale of ['en', 'zh'] as const) {
    for (const width of [390, 1440]) {
      it(`uses available width and preserves complete notices (${locale}, ${width}px)`, () => {
        cy.viewport(width, 900);
        const point = createMockInferenceData({ framework: 'atom', offload_mode: 'on' });
        mountWithProviders(
          <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
            <div className="p-4">
              <ChartDisplay />
            </div>
          </PathnameContext.Provider>,
          {
            inference: {
              selectedSequence: Sequence.AgenticTraces,
              graphs: [
                {
                  model: Model.DeepSeek_R1,
                  sequence: Sequence.AgenticTraces,
                  chartDefinition: defaultChartDef,
                  data: [point],
                },
              ],
            },
            globalFilters: {
              selectedSequence: Sequence.AgenticTraces,
              effectiveSequence: Sequence.AgenticTraces,
            },
            unofficial: {},
          },
        );
        cy.get('[data-testid="chart-status-notes"]').should(($notes) => {
          const notes = $notes[0];
          const bounds = notes.getBoundingClientRect();
          const offload = notes
            .querySelector('[data-testid="offload-halo-key"]')!
            .getBoundingClientRect();
          const optimization = notes
            .querySelector('[data-testid="agentic-optimization-note"]')!
            .getBoundingClientRect();
          const footnote = notes
            .querySelector('[data-testid="atom-engine-footnote"]')!
            .getBoundingClientRect();
          for (const item of [offload, optimization, footnote]) {
            expect(item.left).to.be.at.least(bounds.left);
            expect(item.right).to.be.at.most(bounds.right + 1);
          }
          if (width === 1440) {
            expect(optimization.left).to.be.greaterThan(offload.right);
            expect(footnote.left).to.be.greaterThan(optimization.right);
            expect(optimization.top + optimization.height / 2).to.be.closeTo(
              offload.top + offload.height / 2,
              1,
            );
          } else {
            expect(footnote.top, 'long caveat wraps below short status notes').to.be.at.least(
              optimization.bottom,
            );
            expect(notes.scrollWidth, 'notes never overflow horizontally').to.be.at.most(
              notes.clientWidth,
            );
          }
        });
        cy.get('[data-testid="offload-halo-key"]').should(
          'contain.text',
          locale === 'zh' ? 'KV offload 已开启' : 'KV offload ON',
        );
        cy.get('[data-testid="atom-engine-footnote"]').should(
          'have.text',
          locale === 'zh'
            ? '1 ATOM 引擎前景可期，但尚未用于生产环境 token 服务，仍处于早期阶段。'
            : '1 The ATOM engine is promising, however it has yet to serve production tokens. It is still in its infant stage.',
        );
        cy.get('[data-testid="agentic-optimization-note"] button').click();
        cy.get('[data-testid="option-help-content-agentic-optimizations"]').should(
          'contain.text',
          locale === 'zh'
            ? '每项配置可能使用推测解码等推理优化。将鼠标悬停在数据点上可查看其具体设置。'
            : 'Each configuration may use inference optimizations such as speculative decoding. Hover over a point to see its exact settings.',
        );
      });
    }
  }

  it('includes offload and ATOM notices when only the unofficial overlay uses them', () => {
    const runUrl = 'https://github.com/x/y/actions/runs/707';
    const runInfo = {
      id: 707,
      name: 'footer-overlay',
      branch: 'footer-overlay',
      sha: 'abc707',
      createdAt: '2026-08-09T00:00:00Z',
      url: runUrl,
      conclusion: 'success',
      status: 'completed',
      isNonMainBranch: true,
    };
    mountWithProviders(<ChartDisplay />, {
      inference: {},
      globalFilters: {},
      unofficial: {
        isUnofficialRun: true,
        unofficialRunInfo: runInfo,
        unofficialRunInfos: [runInfo],
        runIndexByUrl: { [runUrl]: 0, '707': 0 },
        getOverlayData: () => ({
          data: [
            createMockInferenceData({ framework: 'atom', offload_mode: 'on', run_url: runUrl }),
          ],
          hardwareConfig: hwConfig,
        }),
        activeOverlayHwTypes: new Set(['b200_trt']),
        allOverlayHwTypes: new Set(['b200_trt']),
      },
    });
    cy.get('[data-testid="chart-status-notes"] [data-testid="offload-halo-key"]').should(
      'contain.text',
      'KV offload ON',
    );
    cy.get('[data-testid="chart-status-notes"] [data-testid="atom-engine-footnote"]').should(
      'contain.text',
      'has yet to serve production tokens',
    );
  });
});

describe('ChartDisplay engine comparison guard', () => {
  it('includes explicitly clipped official and unofficial points in table mode', () => {
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      x: 'median_intvty',
      x_label: 'Interactivity (tok/s/user)',
      y_costhOutput: 'costhOutput.y',
      y_costhOutput_label: 'Cost per Million Output Tokens ($)',
      y_costhOutput_roofline: 'lower_right',
      y_cost_limit: 5,
    });
    const officialVisible = createMockInferenceData({
      hwKey: 'b200_sglang',
      precision: Precision.FP4,
      tp: 4,
      median_intvty: 134.7,
      costhOutput: { y: 4, roof: true },
    });
    const officialClipped = createMockInferenceData({
      hwKey: 'b200_sglang',
      precision: Precision.FP4,
      tp: 8,
      median_intvty: 142.1,
      costhOutput: { y: 7.016, roof: true },
    });
    const runUrl = 'https://github.com/x/y/actions/runs/707';
    const overlayVisible = createMockInferenceData({
      hwKey: 'h100_vllm',
      precision: Precision.FP4,
      tp: 4,
      median_intvty: 130,
      costhOutput: { y: 4.5, roof: true },
      run_url: runUrl,
    });
    const overlayClipped = createMockInferenceData({
      hwKey: 'h100_vllm',
      precision: Precision.FP4,
      tp: 8,
      median_intvty: 145,
      costhOutput: { y: 7.5, roof: true },
      run_url: runUrl,
    });
    const runInfo = {
      id: 707,
      name: 'clipped-table-overlay',
      branch: 'clipped-table-overlay',
      sha: 'abc707',
      createdAt: '2026-08-09T00:00:00Z',
      url: runUrl,
      conclusion: 'success',
      status: 'completed',
      isNonMainBranch: true,
    };

    mountWithProviders(<ChartDisplay />, {
      inference: {
        graphs: [
          {
            model: Model.DeepSeek_R1,
            sequence: Sequence.EightK_OneK,
            chartDefinition,
            data: [officialVisible],
            clippedData: [{ point: officialClipped, reasons: ['cost'] }],
          },
        ],
        selectedYAxisMetric: 'y_costhOutput',
        selectedXAxisMode: 'interactivity',
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang']),
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_R1,
        selectedSequence: Sequence.EightK_OneK,
        effectiveSequence: Sequence.EightK_OneK,
      },
      unofficial: {
        isUnofficialRun: true,
        unofficialRunInfo: runInfo,
        unofficialRunInfos: [runInfo],
        runIndexByUrl: { [runUrl]: 0, '707': 0 },
        getOverlayData: () => ({
          data: [overlayVisible, overlayClipped],
          hardwareConfig: hwConfig,
        }),
        activeOverlayHwTypes: new Set(['h100_vllm']),
        allOverlayHwTypes: new Set(['h100_vllm']),
      },
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 4);
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="inference-results-table"] tbody')
      .contains('tr', '7.0')
      .should('contain.text', 'SGLang')
      .find('td')
      .eq(2)
      .should('have.text', '8');
    cy.get('[data-testid="inference-results-table"] tbody')
      .contains('tr', '7.5')
      .should('contain.text', 'vLLM')
      .find('td')
      .eq(2)
      .should('have.text', '8');
  });

  it('keeps official table rows synchronized with legend state after a scope change', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const baseInference = createMockInferenceContextValues();
    const baseGlobalFilters = createMockGlobalFilterContexts().selection;

    function OfficialRowsScopeHarness() {
      const [secondScope, setSecondScope] = useState(false);
      const [activeKeys, setActiveKeys] = useState(new Set(['b200_sglang']));
      const model = secondScope ? Model.DeepSeek_R1 : Model.DeepSeek_V4_Pro;
      const rows = (secondScope ? ['b200_sglang', 'h100_vllm'] : ['b200_sglang']).map((hwKey) =>
        createMockInferenceData({
          hwKey,
          model,
          precision: Precision.FP4,
        }),
      );
      const inference = {
        ...baseInference,
        graphs: [
          {
            model,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: rows,
          },
        ],
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity' as const,
        activeHwTypes: activeKeys,
        hwTypesWithData: new Set(rows.map((row) => String(row.hwKey))),
      };
      const globalFilters = {
        ...baseGlobalFilters,
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      };

      return (
        <GlobalFilterSelectionContext.Provider value={globalFilters}>
          <InferenceContextsProvider
            data={inference}
            filters={inference}
            display={inference}
            actions={inference}
          >
            <button data-testid="change-official-table-scope" onClick={() => setSecondScope(true)}>
              Change scope
            </button>
            <button
              data-testid="select-official-vllm"
              onClick={() => setActiveKeys(new Set(['h100_vllm']))}
            >
              Select vLLM
            </button>
            <ChartDisplay />
          </InferenceContextsProvider>
        </GlobalFilterSelectionContext.Provider>
      );
    }

    mountWithProviders(<OfficialRowsScopeHarness />, { unofficial: {} });
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);

    cy.get('[data-testid="change-official-table-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);
    cy.get('[data-testid="inference-results-table"] tbody').contains('SGLang').should('exist');

    cy.get('[data-testid="select-official-vllm"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);
    cy.get('[data-testid="inference-results-table"] tbody').contains('vLLM').should('exist');
    cy.get('[data-testid="inference-results-table"] tbody').contains('SGLang').should('not.exist');
    cy.get('@setUnifiedOverlaySelection').should('not.have.been.called');
  });

  it('renders the table columns without the median interactivity or TTFT columns', () => {
    // Mirror the real interactivity chart: x IS interactivity, which is what
    // made the separate median column a duplicate.
    const chartDefinition = createMockChartDefinition({
      chartType: 'interactivity',
      x: 'median_intvty',
      x_label: 'Interactivity (tok/s/user)',
    });
    const row = createMockInferenceData({
      hwKey: 'b200_sglang',
      hw: 'Official SGLang',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });

    mountWithProviders(<ChartDisplay />, {
      inference: {
        graphs: [
          {
            model: Model.DeepSeek_V4_Pro,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: [row],
          },
        ],
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity',
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang']),
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      },
      unofficial: {},
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] thead th').then(($headers) => {
      const headers = [...$headers].map((th) => (th.textContent ?? '').trim());
      // Interactivity is already the x-axis column on the interactivity chart,
      // so the median column duplicated it. Assert both that the column is gone
      // and that exactly one interactivity column remains, so a rename cannot
      // quietly reintroduce the duplicate.
      expect(headers).to.not.include('Median Interactivity (tok/s)');
      expect(headers.filter((h) => h.toLowerCase().includes('interactivity'))).to.have.length(1);
      // Median TTFT was dropped too; unlike interactivity it is not duplicated
      // by the x-axis column, so nothing else in the table should carry it.
      expect(headers).to.not.include('Median TTFT (ms)');
      expect(headers.filter((h) => h.toLowerCase().includes('ttft'))).to.have.length(0);
    });
  });

  it('keeps same-hardware cross-engine AgentX STP rows out of table mode', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const sglangRow = createMockInferenceData({
      hwKey: 'b200_sglang',
      hw: 'Official SGLang',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });
    const vllmRow = createMockInferenceData({
      hwKey: 'b200_vllm',
      hw: 'Official vLLM',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });
    const exclusion = buildExclusion([
      {
        suffix: null,
        stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
        scope: 'hardware',
      },
    ]);
    const resolveSelection = (proposed: Set<string>, prev = new Set<string>()) =>
      resolveExclusionGroups(proposed, prev, exclusion, 'keep-sticky');

    mountWithProviders(<ChartDisplay />, {
      inference: {
        graphs: [
          {
            model: Model.DeepSeek_V4_Pro,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: [sglangRow, vllmRow],
          },
        ],
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity',
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang', 'b200_vllm']),
        resolveComparisonSelection: resolveSelection,
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      },
      unofficial: {},
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);
  });

  it('keeps cross-engine official and unofficial rows together in preview table mode', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const sglangRow = createMockInferenceData({
      hwKey: 'b200_sglang',
      hw: 'Official SGLang',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });
    const runUrl = 'https://github.com/x/y/actions/runs/456';
    const overlayRow = createMockInferenceData({
      hwKey: 'h100_vllm',
      hw: 'Unofficial vLLM',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
      run_url: runUrl,
    });
    const exclusion = buildExclusion([
      {
        suffix: null,
        stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
        scope: 'hardware',
      },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      scopesOf: (key: string) =>
        exclusion.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };
    const resolveSelection = (proposed: Set<string>, prev = new Set<string>()) =>
      resolveExclusionGroups(proposed, prev, namespacedExclusion, 'keep-sticky');
    const runInfo = {
      id: 456,
      name: 'agentx-vllm-overlay',
      branch: 'agentx-vllm-overlay',
      sha: 'def456',
      createdAt: '2026-07-10T00:00:00Z',
      url: runUrl,
      conclusion: 'success',
      status: 'completed',
      isNonMainBranch: true,
    };

    mountWithProviders(<ChartDisplay />, {
      inference: {
        graphs: [
          {
            model: Model.DeepSeek_V4_Pro,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: [sglangRow],
          },
        ],
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity',
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang']),
        resolveComparisonSelection: resolveSelection,
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      },
      unofficial: {
        isUnofficialRun: true,
        unofficialRunInfo: runInfo,
        unofficialRunInfos: [runInfo],
        runIndexByUrl: { [runUrl]: 0, '456': 0 },
        getOverlayData: () => ({ data: [overlayRow], hardwareConfig: hwConfig }),
        activeOverlayHwTypes: new Set(['h100_vllm']),
        allOverlayHwTypes: new Set(['h100_vllm']),
      },
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="inference-results-table"] tbody').contains('vLLM').should('exist');
    cy.get('[data-testid="inference-results-table"] tbody').contains('SGLang').should('exist');
    cy.get('@reconcileOverlayScope').should((reconcile) => {
      const scope = reconcile.lastCall.args[0] as { overlayHwTypes: Set<string> };
      expect([...scope.overlayHwTypes]).to.have.members(['h100_vllm']);
    });
  });

  it('keeps an explicitly empty official legend out of table mode', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const row = createMockInferenceData({
      hwKey: 'b200_sglang',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });

    mountWithProviders(<ChartDisplay />, {
      inference: {
        graphs: [
          {
            model: Model.DeepSeek_V4_Pro,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: [row],
          },
        ],
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity',
        activeHwTypes: new Set(['b200_sglang']),
        hwTypesWithData: new Set(['b200_sglang']),
      },
      globalFilters: {
        selectedModel: Model.DeepSeek_V4_Pro,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      },
      unofficial: { isUnofficialRun: true, localOfficialOverride: new Set() },
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.contains('No data available for the current filters.').should('be.visible');
    cy.get('[data-testid="inference-results-table"]').should('not.exist');
  });

  it('commits a new table overlay scope and preserves an explicit empty selection', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const exclusion = buildExclusion([
      {
        suffix: null,
        stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'],
        scope: 'hardware',
      },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      scopesOf: (key: string) =>
        exclusion.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };
    const resolveSelection = (proposed: Set<string>, prev = new Set<string>()) =>
      resolveExclusionGroups(proposed, prev, namespacedExclusion, 'keep-sticky');
    const runInfo = {
      id: 123,
      name: 'agentx-scope-test',
      branch: 'agentx-scope-test',
      sha: 'abc123',
      createdAt: '2026-07-10T00:00:00Z',
      url: 'https://github.com/x/y/actions/runs/123',
      conclusion: 'success',
      status: 'completed',
      isNonMainBranch: true,
    };
    const baseInference = createMockInferenceContextValues();
    const baseGlobalFilters = createMockGlobalFilterContexts().selection;
    const baseUnofficial = createMockUnofficialRunContext();

    function OverlayScopeHarness() {
      const [secondScope, setSecondScope] = useState(false);
      const [secondScopeLoaded, setSecondScopeLoaded] = useState(false);
      const [selection, dispatchSelection] = useReducer(overlaySelectionReducer, {
        availabilityKey: String(runInfo.id),
        activeOverlayHwTypes: new Set(['h100_sglang']),
        availableOverlayHwTypes: new Set(['h100_sglang', 'h200_sglang', 'b200_vllm']),
        localOfficialOverride: null,
        scopeKey: `${Model.DeepSeek_V4_Pro}|${Sequence.AgenticTraces}|${Precision.FP4}|${runInfo.url}|official:b200_sglang|overlay:h100_sglang,h200_sglang`,
        scopeOverlayHwTypes: new Set(['h100_sglang', 'h200_sglang']),
        scopeReady: true,
        bestSelectionKey: '',
        bestPerSku: false,
      });
      const [, setRenderVersion] = useState(0);
      const model = secondScope ? Model.DeepSeek_R1 : Model.DeepSeek_V4_Pro;
      const officialKeys = secondScope ? ['h100_vllm', 'b200_sglang'] : ['b200_sglang'];
      const overlayKeys = secondScope
        ? ['b200_vllm', 'h200_sglang']
        : ['h100_sglang', 'h200_sglang'];
      const officialRows =
        secondScope && !secondScopeLoaded
          ? []
          : officialKeys.map((hwKey) =>
              createMockInferenceData({
                hwKey,
                model,
                precision: Precision.FP4,
              }),
            );
      const overlayRows = overlayKeys.map((hwKey, index) =>
        createMockInferenceData({
          hwKey,
          model,
          precision: Precision.FP4,
          x: 8 + index * 8,
          run_url: runInfo.url,
        }),
      );
      const inference = {
        ...baseInference,
        graphs: [
          {
            model,
            sequence: Sequence.AgenticTraces,
            chartDefinition,
            data: officialRows,
          },
        ],
        loading: secondScope && !secondScopeLoaded,
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity' as const,
        selectedXAxisMetric: 'p90_ttft',
        bestPerSku: false,
        activeHwTypes: new Set([officialKeys[0]]),
        hwTypesWithData: new Set(officialKeys),
        resolveComparisonSelection: resolveSelection,
      };
      const globalFilters = {
        ...baseGlobalFilters,
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        effectiveSequence: Sequence.AgenticTraces,
      };
      const unofficial = {
        ...baseUnofficial,
        isUnofficialRun: true,
        unofficialRunInfo: runInfo,
        unofficialRunInfos: [runInfo],
        runIndexByUrl: { [runInfo.url]: 0, [String(runInfo.id)]: 0 },
        getOverlayData: () => ({ data: overlayRows, hardwareConfig: hwConfig }),
        activeOverlayHwTypes: selection.activeOverlayHwTypes,
        reconcileOverlayScope: (
          input: Parameters<typeof baseUnofficial.reconcileOverlayScope>[0],
        ) => dispatchSelection({ type: 'scope', input }),
        setUnifiedOverlaySelection: (official: Set<string>, overlay: Set<string>) =>
          dispatchSelection({ type: 'selection', official, overlay }),
        allOverlayHwTypes: selection.availableOverlayHwTypes,
        localOfficialOverride: selection.localOfficialOverride,
      };

      return (
        <GlobalFilterSelectionContext.Provider value={globalFilters}>
          <UnofficialRunContext.Provider value={unofficial}>
            <InferenceContextsProvider
              data={inference}
              filters={inference}
              display={inference}
              actions={inference}
            >
              <button data-testid="change-overlay-scope" onClick={() => setSecondScope(true)}>
                Change scope
              </button>
              <button data-testid="load-official-scope" onClick={() => setSecondScopeLoaded(true)}>
                Load official scope
              </button>
              <button
                data-testid="clear-overlay-scope"
                onClick={() =>
                  dispatchSelection({
                    type: 'selection',
                    official: selection.localOfficialOverride ?? new Set(officialKeys),
                    overlay: new Set(),
                  })
                }
              >
                Clear overlays
              </button>
              <button
                data-testid="rerender-overlay-scope"
                onClick={() => setRenderVersion((version) => version + 1)}
              >
                Rerender
              </button>
              <ChartDisplay />
            </InferenceContextsProvider>
          </UnofficialRunContext.Provider>
        </GlobalFilterSelectionContext.Provider>
      );
    }

    mountWithProviders(<OverlayScopeHarness />);
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);

    cy.get('[data-testid="change-overlay-scope"]').click();
    // The new overlay scope can arrive before the official query. Its empty
    // graph must not be persisted as an intentional empty official selection.
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="load-official-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 4);
    cy.get('[data-testid="rerender-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 4);

    cy.get('[data-testid="clear-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="rerender-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="inference-chart-view-btn"]').click();
    cy.get('#chart-0 svg .unofficial-overlay-pt').should('not.exist');
  });
});

// Reproduces Qwen3.5 power sweeps: fastest is also lowest watts, so the true
// Pareto frontier is one point, but show-all still draws a smooth power envelope.
describe('Power envelopes', () => {
  for (const optimal of [false, true]) {
    it(`${optimal ? 'preserves Pareto' : 'suppresses power-envelope'} clipping continuations with Optimal Only ${optimal ? 'on' : 'off'}`, () => {
      const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/102';
      const visible = createMockInferenceData({
        hwKey: 'b200_trt',
        tp: 4,
        conc: 1,
        x: 100,
        y: 600,
        run_url: runUrl,
      });
      const clipped = { ...visible, tp: 8, conc: 8, x: 1500, y: 300 };
      mountWithProviders(
        <div style={{ width: 1000, height: 600 }}>
          <ScatterGraph
            chartId="power-clipped"
            modelLabel="Qwen3.5 397B"
            data={[visible]}
            clippedData={[{ point: clipped, reasons: ['latency'] }]}
            xLabel="TTFT"
            yLabel="Power"
            chartDefinition={createMockChartDefinition({
              y_measuredAvgPower_roofline: 'lower_left',
              y_latency_limit: 1000,
            })}
            overlayData={{
              data: [visible],
              clippedData: [{ point: clipped, reasons: ['latency'] }],
              hardwareConfig: hwConfig,
              label: 'Power replay',
              runUrl,
            }}
            transitionDuration={0}
          />
        </div>,
        {
          inference: {
            selectedYAxisMetric: 'y_measuredAvgPower',
            hideNonOptimal: optimal,
            selectedPrecisions: [Precision.FP4],
            hardwareConfig: hwConfig,
            activeHwTypes: new Set(['b200_trt']),
            hwTypesWithData: new Set(['b200_trt']),
          },
          unofficial: {
            activeOverlayHwTypes: new Set(['b200_trt']),
            allOverlayHwTypes: new Set(['b200_trt']),
            runIndexByUrl: { [runUrl]: 0, '102': 0 },
          },
        },
      );
      cy.get('#power-clipped .dot-group').should('have.length', 1);
      if (optimal) {
        cy.get('#power-clipped .official-overflow-continuation').should('have.length', 1);
        cy.get('#power-clipped .overlay-overflow-continuation').should('have.length', 1);
      } else {
        cy.get('#power-clipped .overflow-continuation').should('not.exist');
      }
    });
  }

  function PowerHarness() {
    const [optimal, setOptimal] = useState(true);
    const [showAllMeasurements, setShowAllMeasurements] = useState(false);
    const [metric, setMetric] = useState('y_measuredAvgPower');
    const power = metric !== 'y_measuredJPerOutputToken';
    const rows = [1, 8, 32].map((conc, i) =>
      createMockInferenceData({
        hwKey: 'b200_trt',
        conc,
        x: 100 - i * 30,
        y: power ? 400 + i * 200 : 4 - i,
        measuredAvgPower: { y: 400 + i * 200, roof: false },
        measuredPowerPercentTdp: { y: 40 + i * 20, roof: false },
        measuredJPerOutputToken: { y: 4 - i, roof: false },
        run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
        power_tier: i === 1 ? 'legacy' : 'certified',
      }),
    );
    rows.push(
      createMockInferenceData({
        hwKey: 'b200_trt',
        conc: 16,
        x: 60,
        y: power ? 500 : 3.5,
        measuredAvgPower: { y: 500, roof: false },
        measuredPowerPercentTdp: { y: 50, roof: false },
        measuredJPerOutputToken: { y: 3.5, roof: false },
        power_tier: 'legacy',
      }),
    );
    const value = createMockInferenceContextValues({
      selectedYAxisMetric: metric,
      hideNonOptimal: optimal,
      setHideNonOptimal: setOptimal,
      showAllMeasurements,
      setShowAllMeasurements,
      selectedPrecisions: [Precision.FP4],
      hardwareConfig: hwConfig,
      activeHwTypes: new Set(['b200_trt']),
      hwTypesWithData: new Set(['b200_trt']),
    });
    const definition = createMockChartDefinition({
      chartType: 'interactivity',
      y_measuredAvgPower_roofline: 'lower_right',
      y_measuredJPerOutputToken_roofline: 'lower_right',
      y_measuredPowerPercentTdp_roofline: chartDefinitions[0].y_measuredPowerPercentTdp_roofline,
    });
    return (
      <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
        <button onClick={() => setMetric('y_measuredPowerPercentTdp')}>Percent TDP</button>
        <button onClick={() => setMetric('y_measuredJPerOutputToken')}>Energy</button>
        <div style={{ width: 1000, height: 600 }}>
          <ScatterGraph
            chartId="power-sweep"
            modelLabel="Qwen3.5 397B"
            data={rows}
            xLabel="Interactivity"
            yLabel="Power"
            chartDefinition={definition}
            transitionDuration={0}
          />
        </div>
      </InferenceContextsProvider>
    );
  }

  it('draws a smooth power envelope when Optimal Only is off and preserves energy frontiers', () => {
    mountWithProviders(<PowerHarness />, { unofficial: {} });
    cy.get('#power-sweep .roofline-path').should('not.exist');
    cy.get('[data-testid="power-curve-description"]').should('contain', 'single point');
    cy.get('#scatter-hide-non-optimal').click({ force: true });
    cy.get('#power-sweep .roofline-path[data-curve-kind="power-envelope"]')
      .should('have.length', 1)
      .invoke('attr', 'd')
      .should('match', /^M[^C]+C/u);
    cy.get('#power-sweep .dot-group')
      .filter((_, element) => element.style.opacity !== '0')
      .should('have.length', 3)
      .each(($point) => cy.wrap($point).should('have.css', 'opacity', '1'));
    cy.get('#scatter-show-all-measurements').should('have.attr', 'data-state', 'unchecked');
    cy.get('[data-testid="measured-power-summary"]')
      .should('contain.text', 'Showing 3 of 4 measured points')
      .and('contain.text', '1/2 historical');
    cy.get('#power-sweep .dot-group')
      .filter((_, element) => element.style.opacity !== '0')
      .find('.legacy-power-ring')
      .should('have.length', 1);
    cy.get('#power-sweep .dot-group')
      .filter((_, element) => element.style.opacity === '0')
      .should('have.css', 'pointer-events', 'none');
    cy.get('#power-sweep .roofline-path')
      .invoke('attr', 'd')
      .then((boundary) => {
        cy.get('#scatter-show-all-measurements').click({ force: true });
        cy.get('#power-sweep .dot-group')
          .should('have.length', 4)
          .each(($point) => cy.wrap($point).should('have.css', 'opacity', '1'));
        cy.get('#power-sweep .roofline-path').should('have.attr', 'd', boundary);
        cy.get('[data-testid="measured-power-summary"]').should(
          'contain.text',
          'Showing 4 of 4 measured points',
        );
        cy.get('#power-sweep .legacy-power-ring').should('have.length', 2);
        cy.get('#scatter-show-all-measurements').click({ force: true });
        cy.get('#power-sweep .roofline-path').should('have.attr', 'd', boundary);
      });
    cy.get('#scatter-hide-non-optimal').click({ force: true });
    cy.get('#power-sweep .roofline-path').should('not.exist');
    cy.get('#scatter-show-all-measurements').should('not.exist');
    cy.contains('button', 'Percent TDP').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('#power-sweep .roofline-path').should('not.exist');
    cy.get('[data-testid="power-curve-description"]').should('contain', 'single point');
    cy.get('#scatter-hide-non-optimal').click({ force: true });
    cy.get('#power-sweep .roofline-path[data-curve-kind="power-envelope"]')
      .should('have.length', 1)
      .invoke('attr', 'd')
      .should('match', /^M[^C]+C/u);
    cy.get('#power-sweep .dot-group')
      .filter((_, element) => element.style.opacity !== '0')
      .should('have.length', 3);
    cy.get('#scatter-show-all-measurements').should('have.attr', 'data-state', 'unchecked');
    cy.get('#scatter-show-all-measurements').click({ force: true });
    cy.get('#power-sweep .dot-group')
      .should('have.length', 4)
      .each(($point) => cy.wrap($point).should('have.css', 'opacity', '1'));
    cy.get('#scatter-hide-non-optimal').click({ force: true });
    cy.contains('button', 'Energy').click();
    cy.get('#scatter-hide-non-optimal').should('have.attr', 'data-state', 'checked');
    cy.get('#power-sweep .roofline-path[data-curve-kind="pareto"]').should('have.length', 1);
    cy.get('[data-testid="power-curve-description"]').should('not.exist');
    cy.get('#scatter-show-all-measurements').should('not.exist');
  });

  for (const metric of ['measuredAvgPower', 'measuredP75Power'] as const) {
    it(`smooths ${metric} across configurations and preserves overlay runs through zoom`, () => {
      const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/101';
      const secondRunUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/102';
      // The H100 Qwen3.5 8k/1k measurements that produced loops when joined
      // in concurrency order. EP1 and EP8 contribute to the same upper boundary.
      const rows = [
        [16, 62.737, 399.728, 8],
        [32, 55.742, 448.775, 8],
        [64, 20.506, 344.948, 8],
        [128, 25.686, 502.536, 8],
        [256, 4.645, 372.904, 8],
        [1, 172.488, 252.217, 1],
        [2, 149.322, 291.378, 1],
        [4, 121.477, 318.845, 1],
        [8, 65.346, 283.477, 1],
      ].map(([conc, x, y, ep]) =>
        createMockInferenceData({
          hwKey: 'h100',
          model: Model.Qwen3_5,
          precision: Precision.FP8,
          date: '2026-07-05',
          ep,
          conc,
          x,
          y,
          [metric]: { y, roof: false },
          run_url: runUrl,
        }),
      );
      const secondRunRows = [1, 8, 32].map((conc, i) =>
        createMockInferenceData({
          hwKey: 'h100',
          model: Model.Qwen3_5,
          precision: Precision.FP8,
          date: '2026-07-05',
          conc,
          x: 100 - i * 30,
          y: 400 + i * 200,
          [metric]: { y: 400 + i * 200, roof: false },
          run_url: secondRunUrl,
        }),
      );
      mountWithProviders(
        <div style={{ width: 1000, height: 600 }}>
          <ScatterGraph
            chartId="power-overlay"
            modelLabel="Qwen3.5 397B"
            data={rows}
            xLabel="Interactivity"
            yLabel="Power"
            chartDefinition={createMockChartDefinition({
              chartType: 'interactivity',
              [`y_${metric}_roofline`]: 'lower_right',
            })}
            overlayData={{
              data: [...rows, ...secondRunRows],
              hardwareConfig: hwConfig,
              label: 'Power replay',
              runUrl,
            }}
            transitionDuration={0}
          />
        </div>,
        {
          inference: {
            selectedYAxisMetric: `y_${metric}`,
            hideNonOptimal: false,
            selectedModel: Model.Qwen3_5,
            selectedSequence: Sequence.EightK_OneK,
            selectedPrecisions: [Precision.FP8],
            hardwareConfig: hwConfig,
            activeHwTypes: new Set(['h100']),
            hwTypesWithData: new Set(['h100']),
          },
          unofficial: {
            activeOverlayHwTypes: new Set(['h100']),
            allOverlayHwTypes: new Set(['h100']),
            runIndexByUrl: { [runUrl]: 0, '101': 0, [secondRunUrl]: 1, '102': 1 },
          },
        },
      );
      const officialSelector = '#power-overlay .roofline-path[data-curve-kind="power-envelope"]';
      const overlaySelector =
        '#power-overlay .overlay-roofline-path[data-curve-kind="power-envelope"]';
      function assertEnvelopes() {
        cy.get<SVGPathElement>(`${officialSelector}, ${overlaySelector}`)
          .should('have.length', 3)
          .should(($paths) => {
            const segmentCounts = [...$paths].map((path) => {
              const segments = path.getAttribute('d')!.match(/C/gu) ?? [];
              const length = path.getTotalLength();
              let previous = path.getPointAtLength(0);
              for (let step = 1; step <= 20; step++) {
                const point = path.getPointAtLength((length * step) / 20);
                expect(point.x, 'interactivity never reverses').to.be.at.least(previous.x);
                expect(point.y, 'upper boundary never turns back').to.be.at.least(previous.y);
                previous = point;
              }
              return segments.length;
            });
            expect(segmentCounts).to.have.members([5, 5, 2]);
          });
      }
      cy.get(officialSelector).should('have.length', 1);
      cy.get(overlaySelector).should('have.length', 2);
      cy.get('#power-overlay .dot-group').should('have.length', 9);
      cy.get('#power-overlay .unofficial-overlay-pt').should('have.length', 12);
      cy.get('#power-overlay .dot-group')
        .filter((_, element) => element.style.opacity !== '0')
        .should('have.length', 6);
      cy.get('#power-overlay .unofficial-overlay-pt')
        .filter((_, element) => element.style.opacity !== '0')
        .should('have.length', 9);
      assertEnvelopes();
      cy.get(officialSelector)
        .invoke('attr', 'd')
        .then((beforeZoom) => {
          cy.get('#power-overlay svg').then(($svg) => {
            const svg = $svg[0];
            const bounds = svg.getBoundingClientRect();
            svg.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: -240,
                clientX: bounds.x + bounds.width / 2,
                clientY: bounds.y + bounds.height / 2,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          });
          cy.get(officialSelector).invoke('attr', 'd').should('not.equal', beforeZoom);
        });
      assertEnvelopes();
    });
  }
});
