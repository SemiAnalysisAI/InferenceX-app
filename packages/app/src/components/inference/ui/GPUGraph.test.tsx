// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'bun:test';

import { InferenceContextsProvider } from '@/components/inference/InferenceContext';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { POWER_TIMELINE_METRIC_KEY } from '@/components/inference/utils/powerTimeline';
import { Precision, Scenario } from '@/lib/catalog/data-mappings';
import { overlayRooflineDasharray, overlayRunColor } from '@/lib/charts/overlay-run-style';
import { computeToggle } from '@/lib/shared/toggle-set';
import {
  UnofficialRunContext,
  type UnofficialRunContextType,
} from '@/providers/unofficial-run-provider';
import {
  $,
  $$,
  click,
  contains,
  dispatch,
  eventually,
  fakeLayout,
  get,
  isVisible,
  render,
} from '@/test/dom';
import {
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceContextValues,
  createMockInferenceData,
  createMockUnofficialRunContext,
  stubs,
  withProviders,
  type ProviderOverrides,
} from '@/test/mock-providers';

import GPUGraph from './GPUGraph';

const defaultChartDef = createMockChartDefinition();
const hwConfig = createMockHardwareConfig();

const mountGpuGraph = (tree: ReactElement, overrides: ProviderOverrides = {}) =>
  render(withProviders(tree, { unofficial: {}, ...overrides }));

// The Cypress viewport was 1280 px wide; charts size themselves from their container.
beforeEach(() => fakeLayout(1000, 600));

const datum = <T,>(node: Element) => (node as unknown as { __data__: T }).__data__;
const text = (selector: string) =>
  $$(selector)
    .map((node) => node.textContent ?? '')
    .join('');
/** The tooltip Cypress showed after `.trigger('mouseenter').trigger('mousemove', ...)`. */
function hoverPoint(point: Element) {
  dispatch(point, new MouseEvent('mouseenter', { clientX: 400, clientY: 300 }));
  dispatch(point, new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 300 }));
}
const visibleLabels = () =>
  $$('[data-testid="gpu-graph"] .dot-group .point-label').filter(isVisible);
const interactivityChart = () =>
  createMockChartDefinition({ chartType: 'interactivity', y_tpPerGpu_roofline: 'upper_left' });
const halos = () => $$('#gpu-overlay .offload-halo');
const overlayHalo = () => get('#gpu-overlay .unofficial-overlay-pt .offload-halo');
const tooltipShown = (selector: string) =>
  expect(getComputedStyle(get(selector)).display).toBe('block');
const switchState = (selector: string) => get(selector).dataset.state;

describe('GPUGraph', () => {
  it('uses compact date-colored hover and full details for each history curve', async () => {
    const dates = ['2025-03-01', '2025-03-02'];
    const data = dates.map((date, i) =>
      createMockInferenceData({
        id: 123 + i,
        date,
        hwKey: 'b200_sglang',
        framework: 'sglang',
        x: 32 + i * 32,
        y: 180 + i * 30,
        conc: 64,
        tp: 4,
        ep: 4,
        dp_attention: true,
        physicalChips: 4,
        precision: Precision.FP4,
        benchmark_type: 'agentic_traces',
        image: 'test/image:full-details',
        kv_offloading: 'dram',
        kv_offload_backend: 'hicache',
        server_gpu_cache_hit_rate: 0.7,
        server_cpu_cache_hit_rate: 0.2,
        theoretical_cache_hit_rate: 0.95,
        total_prompt_tokens: 75000,
        total_generation_tokens: 25000,
      }),
    );
    mountGpuGraph(
      <div style={{ width: 1000, height: 700 }}>
        <GPUGraph
          chartId="history-hover"
          modelLabel="DeepSeek R1"
          data={data}
          xLabel="Interactivity"
          yLabel="Throughput / Chip (tok/s)"
          chartDefinition={defaultChartDef}
        />
      </div>,
      {
        inference: {
          hardwareConfig: hwConfig,
          selectedGPUs: ['b200_sglang'],
          selectedDates: dates,
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(dates.map((date) => `${date}_b200_sglang`)),
          selectedPrecisions: [Precision.FP4],
          selectedScenario: Scenario.AgenticTraces,
        },
      },
    );
    for (const date of dates) {
      const point = await eventually(() =>
        $$('#history-hover .dot-group').find((el) => datum<InferenceData>(el).date === date)!,
      );
      const color = get('.visible-shape', point).getAttribute('fill');
      hoverPoint(point);
      tooltipShown('[data-chart-tooltip="history-hover"]');
      const hover = get('[data-chart-tooltip="history-hover"] [data-hover-tooltip]').textContent;
      expect(hover).toContain(date);
      expect(hover).toContain('DEP4');
      expect(hover).toContain('Click for full details');
      expect(hover).not.toContain('test/image');
      expect(
        get('[data-chart-tooltip="history-hover"] [data-hover-cache-bar] > div').getAttribute(
          'style',
        ),
      ).toContain(`background: ${color}`);
      click(get('.visible-shape', point));
      const panel = await eventually(() => get('[data-testid="point-details-panel"]'));
      expect(panel.textContent).toContain(date);
      expect(panel.textContent).toContain('DEP4');
      expect(panel.textContent).toContain('test/image:full-details');
      const tokens = get('[data-testid="point-details-panel"] [data-pinned-tokens]').textContent;
      expect(tokens).toContain('75,000');
      expect(tokens).toContain('25,000');
      click(get('#history-hover [data-testid="d3-chart-svg"]'));
    }
  });

  it('toggles framework suffixes while keeping comparison dates and hardware labels', async () => {
    const data = [8, 16, 32].map((x) =>
      createMockInferenceData({
        hwKey: 'b200_trt',
        x,
        y: 300 - x,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    );
    function FrameworkLabels() {
      const [showFrameworkLabel, setShowFrameworkLabel] = useState(true);
      const value = createMockInferenceContextValues({
        hardwareConfig: hwConfig,
        selectedGPUs: ['b200_trt'],
        selectedDates: ['2025-03-01'],
        activeDates: new Set(['2025-03-01_b200_trt']),
        selectedPrecisions: [Precision.FP4],
        showLineLabels: true,
        showFrameworkLabel,
        setShowFrameworkLabel,
      });
      return (
        <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
          <div style={{ width: 1000, height: 700 }}>
            <GPUGraph
              chartId="gpu-framework-labels"
              modelLabel="DeepSeek R1"
              data={data}
              xLabel="Interactivity"
              yLabel="Throughput / Chip (tok/s)"
              chartDefinition={createMockChartDefinition({
                chartType: 'interactivity',
                y_tpPerGpu_roofline: 'upper_left',
              })}
            />
          </div>
        </InferenceContextsProvider>
      );
    }
    mountGpuGraph(<FrameworkLabels />);
    const labels = '[data-testid="gpu-graph"] .line-label .ll-text';
    await eventually(() => {
      expect(text(labels)).toContain('TRTLLM');
      expect(text(labels)).toContain('2025-03-01');
    });
    click(get('[data-testid="legend-advanced-toggle"]'));
    expect(switchState('#gpu-framework-label')).toBe('checked');
    click(get('#gpu-framework-label'));
    await eventually(() => {
      expect(text(labels)).not.toContain('TRTLLM');
      expect(text(labels)).toContain('B200');
      expect(text(labels)).toContain('2025-03-01');
    });
    click(get('#gpu-framework-label'));
    await eventually(() => {
      expect(text(labels)).toContain('TRTLLM');
      expect(text(labels)).toContain('2025-03-01');
    });
  });

  it('keeps GPU-count and parallelism labels independent', async () => {
    const data = [
      createMockInferenceData({
        hwKey: 'h100',
        x: 64,
        y: 210,
        tp: 8,
        ep: 1,
        physicalChips: 4,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    ];
    function IndependentLabels() {
      const [showPointLabels, setShowPointLabels] = useState(false);
      const [useAdvancedLabels, setUseAdvancedLabels] = useState(false);
      const value = createMockInferenceContextValues({
        hardwareConfig: hwConfig,
        selectedGPUs: ['h100'],
        selectedDates: ['2025-03-01'],
        activeDates: new Set(['2025-03-01_h100']),
        selectedPrecisions: [Precision.FP4],
        showPointLabels,
        setShowPointLabels,
        useAdvancedLabels,
        setUseAdvancedLabels,
        showConcurrencyLabels: false,
      });
      return (
        <InferenceContextsProvider data={value} filters={value} display={value} actions={value}>
          <div style={{ width: 1000, height: 600 }}>
            <GPUGraph
              chartId="gpu-independent-labels"
              modelLabel="DeepSeek R1"
              data={data}
              xLabel="Interactivity"
              yLabel="Throughput"
              chartDefinition={defaultChartDef}
            />
          </div>
        </InferenceContextsProvider>
      );
    }
    mountGpuGraph(<IndependentLabels />);
    click(await eventually(() => get('#gpu-parallelism-labels')));
    click(get('[data-testid="legend-advanced-toggle"]'));
    expect(switchState('#gpu-point-labels')).toBe('unchecked');
    await eventually(() => expect(visibleLabels()[0]?.textContent).toBe('TP8'));
    click(get('#gpu-point-labels'));
    await eventually(() => expect(visibleLabels()[0]?.textContent).toBe('4TP8'));
    click(get('#gpu-parallelism-labels'));
    expect(switchState('#gpu-point-labels')).toBe('checked');
    await eventually(() => expect(visibleLabels()[0]?.textContent).toBe('4'));
    click(get('#gpu-point-labels'));
    await eventually(() => expect(visibleLabels()).toHaveLength(0));
    expect(get('label[for="gpu-offloading-label"]').textContent).toBe('Offloading Label');
    expect(switchState('#gpu-offloading-label')).toBe('checked');
    click(get('#gpu-offloading-label'));
    expect(stubs.setShowOffloadingLabel).toHaveBeenCalledWith(false);
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
    expect(isVisible(contains('No data available'))).toBe(true);
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
    expect(
      isVisible(contains('This dataset does not report role-level prefill/decode energy.')),
    ).toBe(true);
  });

  it('localizes the Chinese comparison empty state', () => {
    mountGpuGraph(
      <PathnameContext.Provider value="/zh/infx/inference">
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
    expect(isVisible(contains('暂无数据'))).toBe(true);
    expect(isVisible(contains('请调整模型、序列长度、精度、日期范围或芯片选项。'))).toBe(true);
  });

  it('shows spec decoding only on hover while retaining the offload halo', async () => {
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
          selectedScenario: Scenario.AgenticTraces,
        },
      },
    );
    const chart = '#test-gpu-agentic-decorations';
    await eventually(() => expect($$(`${chart} svg .offload-halo`)).toHaveLength(1));
    expect($(`${chart} svg .spec-decode-marker`)).toBeNull();
    expect($(`${chart} [data-testid="spec-decode-marker-key"]`)).toBeNull();
    expect($(`${chart} [data-testid="offload-halo-key"]`)).toBeNull();
    expect($(`${chart} [data-testid="agentic-optimization-note"]`)).toBeNull();
    hoverPoint(get(`${chart} svg .dot-group`));
    tooltipShown('[data-chart-tooltip]');
    expect($('[data-chart-tooltip] [data-hover-tooltip]')).not.toBeNull();
    expect(get('[data-chart-tooltip]').textContent).toContain('MTP');
    click(get(`${chart} svg .dot-group .visible-shape`));
    const panel = await eventually(() => get('[data-testid="point-details-panel"]'));
    expect(panel.textContent).toContain('Speculative Decoding');
    expect(panel.textContent).toContain('MTP');
  });

  it('renders date line labels along each roofline when showLineLabels is on', async () => {
    const data = [
      ...[
        [8, 240],
        [16, 200],
        [32, 150],
      ].map(([x, y]) =>
        createMockInferenceData({
          hwKey: 'h100',
          x,
          y,
          date: '2025-03-01',
          precision: Precision.FP4,
        }),
      ),
      ...[
        [8, 320],
        [16, 280],
        [32, 220],
      ].map(([x, y]) =>
        createMockInferenceData({
          hwKey: 'b200',
          x,
          y,
          date: '2025-03-15',
          precision: Precision.FP4,
        }),
      ),
    ];
    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-line-labels"
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
          selectedGPUs: ['h100', 'b200'],
          selectedDates: ['2025-03-01', '2025-03-15'],
          selectedDateRange: { startDate: '', endDate: '' },
          activeDates: new Set(['2025-03-01_h100', '2025-03-15_b200']),
          selectedPrecisions: [Precision.FP4],
          showLineLabels: true,
        },
      },
    );
    const labels = '#test-gpu-line-labels svg .line-label';
    await eventually(() => expect($$(labels)).toHaveLength(2));
    expect(text(labels)).toContain('2025-03-01');
    expect(text(labels)).toContain('2025-03-15');
    expect(text(labels).toLowerCase()).toMatch(/h100|h 100/iu);
    expect(text(labels).toLowerCase()).toMatch(/b200|b 200/iu);
    expect($$(`${labels} .ll-bg`)).toHaveLength(2);
  });

  it('hides line labels when showLineLabels is off', async () => {
    const data = [
      [8, 240],
      [16, 200],
    ].map(([x, y]) =>
      createMockInferenceData({
        hwKey: 'h100',
        x,
        y,
        date: '2025-03-01',
        precision: Precision.FP4,
      }),
    );
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
    // The chart has drawn once its points exist; only then is a missing label meaningful.
    await eventually(() => expect($$('#test-gpu-no-line-labels svg .dot-group')).toHaveLength(2));
    expect($('#test-gpu-no-line-labels svg .line-label')).toBeNull();
  });

  it('renders legend with GPU and date entries', async () => {
    mountGpuGraph(
      <div style={{ width: 800, height: 600 }}>
        <GPUGraph
          chartId="test-gpu-legend"
          modelLabel="DeepSeek R1"
          data={[
            createMockInferenceData({
              hwKey: 'h100',
              x: 64,
              y: 210,
              date: '2025-03-01',
              precision: Precision.FP4,
            }),
          ]}
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
    await eventually(() => expect($('.sidebar-legend')).not.toBeNull());
    expect($$('.sidebar-legend label').length).toBeGreaterThan(0);
    expect(get('[data-testid="legend-advanced-toggle"]').getAttribute('aria-expanded')).toBe(
      'false',
    );
    const parallelism = get('#gpu-parallelism-labels');
    expect(isVisible(parallelism)).toBe(true);
    expect(parallelism.dataset.state).toBe('unchecked');
    expect(parallelism.closest('[data-testid="legend-advanced-controls"]')).toBeNull();
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

const powerChart = '#gpu-power-curves';
const dots = () => $$(`${powerChart} .dot-group`);
const rooflines = () => $$(`${powerChart} .roofline-path`);
const expectCurvedRooflines = () => {
  expect(rooflines()).toHaveLength(2);
  for (const path of rooflines()) expect(path.getAttribute('d')).toContain('C');
};

describe('GPU comparison power envelopes', () => {
  it('reveals off-boundary measurements without changing power envelopes or axes', async () => {
    mountGpuGraph(<PowerComparison />);
    await eventually(() => expect(dots()).toHaveLength(6));
    expectCurvedRooflines();
    for (const path of rooflines()) expect(path.getAttribute('stroke')).not.toBe('#6b7280');
    const paths = rooflines().map((path) => path.getAttribute('d'));
    const axes = $$(`${powerChart} svg .x-axis, ${powerChart} svg .y-axis`).map(
      (axis) => axis.innerHTML,
    );
    click(get('#gpu-hide-non-optimal'));
    await eventually(() => expect(dots()).toHaveLength(12));
    expect(switchState('#gpu-hide-non-optimal')).toBe('unchecked');
    await eventually(() => {
      expect(rooflines().map((path) => path.getAttribute('d'))).toEqual(paths);
      expect(
        $$(`${powerChart} svg .x-axis, ${powerChart} svg .y-axis`).map((axis) => axis.innerHTML),
      ).toEqual(axes);
    });
    click(get('#gpu-hide-non-optimal'));
    await eventually(() => expect(dots()).toHaveLength(6));
    expect($$(`${powerChart} .line-label`)).toHaveLength(2);
    click(get('[data-testid="legend-advanced-toggle"]'));
    expect($('#gpu-perf-ruler')).not.toBeNull();
    click(contains('button', 'Hide older date'));
    await eventually(() => expect(rooflines()).toHaveLength(1));
    expect(dots()).toHaveLength(3);
    expect($$(`${powerChart} .line-label`)).toHaveLength(1);
  });

  it('keeps boundary measurements toward higher E2E Normalized Interactivity', async () => {
    mountGpuGraph(<PowerComparison normalized />);
    await eventually(() => expect(dots()).toHaveLength(6));
  });

  it('keeps boundary measurements by default toward lower latency', async () => {
    mountGpuGraph(<PowerComparison latency />);
    await eventually(() => expect(dots()).toHaveLength(6));
    expectCurvedRooflines();
  });

  it('uses the same boundary toggle for percent TDP and fleet percentiles while preserving energy Pareto', async () => {
    mountGpuGraph(
      <PathnameContext.Provider value="/zh/infx/inference">
        <PowerComparison />
      </PathnameContext.Provider>,
    );
    for (const label of ['Percent TDP', 'P75', 'P90']) {
      click(await eventually(() => contains('button', label)));
      await eventually(() => {
        expect(switchState('#gpu-hide-non-optimal')).toBe('checked');
        expect(dots()).toHaveLength(6);
        expect(rooflines()).toHaveLength(2);
      });
      click(get('#gpu-hide-non-optimal'));
      await eventually(() => {
        expect(dots()).toHaveLength(12);
        expect(rooflines()).toHaveLength(2);
      });
      click(get('#gpu-hide-non-optimal'));
      await eventually(() => expect(dots()).toHaveLength(6));
    }
    click(contains('button', 'Energy'));
    await eventually(() => {
      expect(switchState('#gpu-hide-non-optimal')).toBe('checked');
      expectCurvedRooflines();
    });
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
    render(
      withProviders(
        <Comparison
          chartDefinition={chartDefinition}
          data={data}
          overlayPoints={overlayPoints}
          unofficial={unofficial}
          context={context}
        />,
      ),
    );
  };

  it('toggles official and unofficial offload halos without removing history points', async () => {
    mountComparison(
      interactivityChart(),
      [8, 16, 32].map((x) => ({ ...official(DATES[0], x, 300 - x), offload_mode: 'on' })),
      [8, 16, 32].map((x) => ({ ...overlay(x, 400 - x), offload_mode: 'on' })),
    );
    await eventually(() => expect(halos()).toHaveLength(6));
    expect(overlayHalo().getAttribute('stroke')).toBe(overlayRunColor(0));
    click(get('[data-testid="legend-advanced-toggle"]'));
    expect(switchState('#gpu-offloading-label')).toBe('checked');
    click(get('#gpu-offloading-label'));
    await eventually(() => expect(halos()).toHaveLength(0));
    expect($$('#gpu-overlay .dot-group')).toHaveLength(3);
    expect($$('#gpu-overlay .unofficial-overlay-pt')).toHaveLength(3);
    expect($$('#gpu-overlay .roofline-path').length).toBeGreaterThanOrEqual(2);
    click(get('#gpu-parallelism-labels'));
    await eventually(() => expect(halos()).toHaveLength(0));
    click(get('#gpu-offloading-label'));
    await eventually(() => expect(halos()).toHaveLength(6));
    expect(overlayHalo().getAttribute('stroke')).toBe(overlayRunColor(0));
  });

  it('keeps unofficial runs on the date comparison in the run color and dash', async () => {
    mountComparison(
      interactivityChart(),
      DATES.flatMap((date, d) => [8, 16, 32].map((x, i) => official(date, x, 300 - i * 60 + d))),
      [8, 16, 32].map((x, i) => overlay(x, 400 - i * 60)),
    );
    await eventually(() => expect($$('#gpu-overlay .unofficial-overlay-pt')).toHaveLength(3));
    for (const marker of $$('#gpu-overlay .unofficial-overlay-pt .overlay-x'))
      expect(marker.getAttribute('stroke')).toBe(overlayRunColor(0));
    const overlayRoofline = get('#gpu-overlay .roofline-overlay-run0_b200_fp4');
    expect(overlayRoofline.getAttribute('stroke')).toBe(overlayRunColor(0));
    expect(overlayRoofline.getAttribute('stroke-dasharray')).toBe(overlayRooflineDasharray(0));
    const legend = get('.sidebar-legend').textContent;
    expect(legend).toContain('Unofficial: feat/power-sweep');
    expect(legend).toContain('✕ B200');
    expect($$('#gpu-overlay .line-label')).toHaveLength(3);
    expect(text('#gpu-overlay .line-label')).toContain('B200');
    expect(text('#gpu-overlay .line-label')).not.toContain('✕');

    click(contains('label', '2025-03-15', get('.sidebar-legend')));
    await eventually(() => expect($$('#gpu-overlay .dot-group')).toHaveLength(3));
    expect($$('#gpu-overlay .unofficial-overlay-pt')).toHaveLength(3);

    click(contains('button', 'Hide overlay hardware'));
    await eventually(() => expect($('#gpu-overlay .unofficial-overlay-pt')).toBeNull());
    expect($('#gpu-overlay .roofline-overlay-run0_b200_fp4')).toBeNull();
    expect(get('.sidebar-legend').textContent).not.toContain('Unofficial');
  });

  const audited = (date: string, conc: number, y: number): InferenceData => ({
    ...official(date, conc, y),
    power_audit: {
      source: `power_validation_h100_conc${conc}.json`,
    } as InferenceData['power_audit'],
  });

  it('opens the power trace from an official point on the date comparison', async () => {
    const setSelectedYAxisMetric = vi.fn();
    mountComparison(
      createMockChartDefinition({ chartType: 'interactivity' }),
      DATES.flatMap((date, d) => [audited(date, 8, 300 + d), audited(date, 16, 320 + d)]),
      [],
      { selectedYAxisMetric: 'y_measuredAvgPower', setSelectedYAxisMetric },
    );
    click(await eventually(() => get('#gpu-overlay .dot-group .visible-shape')));
    click(
      await eventually(() =>
        get('[data-testid="point-details-panel"] [data-action="view-power-trace"]'),
      ),
    );
    expect(setSelectedYAxisMetric).toHaveBeenCalledWith(POWER_TIMELINE_METRIC_KEY);
  });
});
