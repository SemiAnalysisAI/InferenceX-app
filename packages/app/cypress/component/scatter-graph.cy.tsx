import { useState } from 'react';
import { GlobalFilterContext } from '@/components/GlobalFilterContext';
import { InferenceContext } from '@/components/inference/InferenceContext';
import { UnofficialRunContext } from '@/components/unofficial-run-provider';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import ChartDisplay from '@/components/inference/ui/ChartDisplay';
import { mountWithProviders } from '../support/test-utils';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockGlobalFilterContext,
  createMockInferenceContext,
  createMockUnofficialRunContext,
} from '../support/mock-data';
import { Model, Precision, Sequence } from '@/lib/data-mappings';
import { buildExclusion, resolveExclusionGroups } from '@/lib/exclusion';

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
          yLabel="Throughput / GPU (tok/s)"
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
      { suffix: null, stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'] },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };
    const blockedToggle = cy.stub().as('blockedComparisonToggle').returns(null);

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-agentx-engine-guard"
          modelLabel="DeepSeek V4 Pro"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / GPU (tok/s)"
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
    cy.get('@setActiveOverlayHwTypes').should('not.have.been.called');

    // An additional official engine can also be selected while the preview is
    // loaded; the production-only conflict toggle must not be consulted.
    cy.get('label[for="checkbox-h100_vllm"]').click();
    cy.get('@blockedComparisonToggle').should('not.have.been.called');
    cy.get('@setLocalOfficialOverride').should((setOverride) => {
      const selection = setOverride.lastCall.args[0] as Set<string>;
      expect([...selection]).to.have.members(['b200_sglang', 'h100_vllm']);
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
      { suffix: null, stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'] },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
    };

    mountWithProviders(
      <div style={{ width: 800, height: 600 }}>
        <ScatterGraph
          chartId="test-scatter-agentx-same-family"
          modelLabel="DeepSeek V4 Pro"
          data={officialData}
          xLabel="Concurrency"
          yLabel="Throughput / GPU (tok/s)"
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
});

describe('ChartDisplay engine comparison guard', () => {
  it('keeps cross-engine AgentX STP rows out of table mode', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const sglangRow = createMockInferenceData({
      hwKey: 'b200_sglang',
      hw: 'Official SGLang',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });
    const vllmRow = createMockInferenceData({
      hwKey: 'h100_vllm',
      hw: 'Official vLLM',
      model: Model.DeepSeek_V4_Pro,
      precision: Precision.FP4,
    });
    const exclusion = buildExclusion([
      { suffix: null, stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'] },
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
        hwTypesWithData: new Set(['b200_sglang', 'h100_vllm']),
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
      { suffix: null, stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'] },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
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
    // The reconciliation effect must not strip the run's hw types from the provider.
    cy.get('@setActiveOverlayHwTypes').should('not.have.been.called');
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
      unofficial: { localOfficialOverride: new Set() },
    });

    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.contains('No data available for the current filters.').should('be.visible');
    cy.get('[data-testid="inference-results-table"]').should('not.exist');
  });

  it('commits a new table overlay scope and preserves an explicit empty selection', () => {
    const chartDefinition = createMockChartDefinition({ chartType: 'interactivity' });
    const exclusion = buildExclusion([
      { suffix: null, stripPrefixes: ['dynamo-', 'mori-', 'llmd-', 'mooncake-'] },
    ]);
    const namespacedExclusion = {
      familyOf: (key: string) =>
        exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
      groupOf: (key: string) =>
        exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
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
    const baseInference = createMockInferenceContext();
    const baseGlobalFilters = createMockGlobalFilterContext();
    const baseUnofficial = createMockUnofficialRunContext();

    function OverlayScopeHarness() {
      const [secondScope, setSecondScope] = useState(false);
      const [activeOverlayKeys, setActiveOverlayKeys] = useState(new Set(['h100_sglang']));
      const [, setRenderVersion] = useState(0);
      const model = secondScope ? Model.DeepSeek_R1 : Model.DeepSeek_V4_Pro;
      const officialKey = secondScope ? 'h100_vllm' : 'b200_sglang';
      const overlayKeys = secondScope
        ? ['b200_vllm', 'h200_sglang']
        : ['h100_sglang', 'h200_sglang'];
      const officialRows = [
        createMockInferenceData({
          hwKey: officialKey,
          model,
          precision: Precision.FP4,
        }),
      ];
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
        selectedModel: model,
        selectedSequence: Sequence.AgenticTraces,
        selectedXAxisMode: 'interactivity' as const,
        selectedXAxisMetric: 'p90_ttft',
        activeHwTypes: new Set([officialKey]),
        hwTypesWithData: new Set([officialKey]),
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
        activeOverlayHwTypes: activeOverlayKeys,
        setActiveOverlayHwTypes: setActiveOverlayKeys,
        allOverlayHwTypes: new Set(['h100_sglang', 'h200_sglang', 'b200_vllm']),
      };

      return (
        <GlobalFilterContext.Provider value={globalFilters}>
          <UnofficialRunContext.Provider value={unofficial}>
            <InferenceContext.Provider value={inference}>
              <button data-testid="change-overlay-scope" onClick={() => setSecondScope(true)}>
                Change scope
              </button>
              <button
                data-testid="clear-overlay-scope"
                onClick={() => setActiveOverlayKeys(new Set())}
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
            </InferenceContext.Provider>
          </UnofficialRunContext.Provider>
        </GlobalFilterContext.Provider>
      );
    }

    mountWithProviders(<OverlayScopeHarness />);
    cy.get('[data-testid="inference-table-view-btn"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 2);

    cy.get('[data-testid="change-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 3);
    cy.get('[data-testid="rerender-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 3);

    cy.get('[data-testid="clear-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);
    cy.get('[data-testid="rerender-overlay-scope"]').click();
    cy.get('[data-testid="inference-results-table"] tbody tr').should('have.length', 1);
    cy.get('[data-testid="inference-chart-view-btn"]').click();
    cy.get('#chart-0 svg .unofficial-overlay-pt').should('not.exist');
  });
});
