import { describe, expect, it } from 'vitest';

import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  RenderableGraph,
} from '@/components/inference/types';
import { generateVendorColors, getVendor } from '@/lib/dynamic-colors';

import {
  isSynthHwKey,
  makeSynthHwKey,
  mergeUnofficialIntoOfficial,
  parseSynthHwKey,
  type UnofficialChartDataMap,
} from './unofficial-merge';

const E2E_DEF: ChartDefinition = {
  chartType: 'e2e',
  x: 'median_e2el',
  y: 'tput_per_gpu',
  x_label: 'End-to-end Latency (s)',
  y_label: 'Throughput per GPU (tok/s/GPU)',
  heading: 'Throughput vs Latency',
  y_tpPerGpu_label: 'Throughput per GPU (tok/s/GPU)',
} as unknown as ChartDefinition;

const INTERACTIVITY_DEF: ChartDefinition = {
  chartType: 'interactivity',
  x: 'median_intvty',
  y: 'tput_per_gpu',
  x_label: 'Interactivity (tok/s/user)',
  y_label: 'Throughput per GPU (tok/s/GPU)',
  heading: 'Throughput vs Interactivity',
  y_tpPerGpu_label: 'Throughput per GPU (tok/s/GPU)',
} as unknown as ChartDefinition;

const CHART_DEFS: ChartDefinition[] = [E2E_DEF, INTERACTIVITY_DEF];

function makeOverlayPoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey: 'h100_vllm',
    precision: 'fp8',
    tp: 8,
    conc: 64,
    x: 0,
    y: 0,
    median_e2el: 2.3,
    median_intvty: 12.5,
    p99_ttft: 0.35,
    median_ttft: 0.15,
    tpPerGpu: { y: 450.5, roof: false },
    date: '2026-04-01',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
    ...overrides,
  } as InferenceData;
}

function makeOverlayChartData(): UnofficialChartDataMap {
  const e2eData = [
    makeOverlayPoint({ conc: 32 }),
    makeOverlayPoint({
      hwKey: 'a100_sglang',
      conc: 64,
      tpPerGpu: { y: 200.1, roof: false },
    }),
  ];
  const interactivityData = [
    makeOverlayPoint({ conc: 32 }),
    makeOverlayPoint({
      hwKey: 'a100_sglang',
      conc: 64,
      tpPerGpu: { y: 200.1, roof: false },
    }),
  ];
  const gpus: HardwareConfig = {
    h100_vllm: { name: 'h100_vllm', label: 'H100', suffix: '(VLLM)', gpu: 'NVIDIA H100' },
    a100_sglang: { name: 'a100_sglang', label: 'A100', suffix: '(SGLANG)', gpu: 'NVIDIA A100' },
  };
  return {
    'DeepSeek-R1-0528_1k/1k': {
      e2e: { data: e2eData, gpus },
      interactivity: { data: interactivityData, gpus },
    },
  };
}

function emptyOfficial(): { graphs: RenderableGraph[]; hardwareConfig: HardwareConfig } {
  return {
    graphs: [
      { model: 'DeepSeek-R1-0528', sequence: '1k/1k', chartDefinition: E2E_DEF, data: [] },
      {
        model: 'DeepSeek-R1-0528',
        sequence: '1k/1k',
        chartDefinition: INTERACTIVITY_DEF,
        data: [],
      },
    ],
    hardwareConfig: {},
  };
}

const RUN_INDEX = {
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100': 0,
  '100': 0,
  'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/200': 1,
  '200': 1,
};

const RUN_INFOS = [
  {
    id: 100,
    branch: 'feature-branch-a',
    url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100',
  },
  {
    id: 200,
    branch: 'feature-branch-b',
    url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/200',
  },
];

describe('synth hwKey helpers', () => {
  it('encodes runId into hwKey while preserving the GPU base prefix', () => {
    const synth = makeSynthHwKey('h100_vllm', 100);
    expect(synth).toBe('h100_vllm__uorun100');
    // Critical: the base GPU is still recoverable via split('_')[0] so
    // getModelSortIndex / isKnownGpu keep working.
    expect(synth.split('_')[0]).toBe('h100');
  });

  it('round-trips through parseSynthHwKey', () => {
    const synth = makeSynthHwKey('a100_sglang', 200);
    expect(parseSynthHwKey(synth)).toEqual({ origHwKey: 'a100_sglang', runId: 200 });
  });

  it('parseSynthHwKey returns null for non-synth keys', () => {
    expect(parseSynthHwKey('h100_vllm')).toBeNull();
    expect(parseSynthHwKey('mi300x')).toBeNull();
  });

  it('isSynthHwKey detects synthesized keys', () => {
    expect(isSynthHwKey(makeSynthHwKey('h100', 100))).toBe(true);
    expect(isSynthHwKey('h100_vllm')).toBe(false);
  });
});

describe('mergeUnofficialIntoOfficial', () => {
  it('is a no-op when unofficialChartData is null', () => {
    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: null,
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: {},
      unofficialRunInfos: [],
    });
    expect(result.graphs).toBe(graphs);
    expect(result.hardwareConfig).toBe(hardwareConfig);
    expect(result.colorOverrides).toEqual({});
  });

  it('is a no-op when no overlay group matches the selected (model, sequence)', () => {
    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: makeOverlayChartData(),
      selectedModel: 'gpt-oss-120b', // not present in overlay map
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });
    expect(result.graphs).toBe(graphs);
    expect(result.colorOverrides).toEqual({});
  });

  it('rewrites overlay rows with synth hwKeys and adds matching hardwareConfig (no color override)', () => {
    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: makeOverlayChartData(),
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });

    // Each chart graph received both overlay rows (different GPUs, both run 100).
    const e2eGraph = result.graphs.find((g) => g.chartDefinition.chartType === 'e2e')!;
    expect(e2eGraph.data).toHaveLength(2);
    const synthKeys = e2eGraph.data.map((d) => d.hwKey);
    expect(synthKeys).toContain('h100_vllm__uorun100');
    expect(synthKeys).toContain('a100_sglang__uorun100');

    // The synth keys are present in hardwareConfig with bare GPU labels — the
    // branch is intentionally NOT in the legend label (the run is still
    // recoverable from `gpu` for the row tooltip).
    const h100Synth = result.hardwareConfig['h100_vllm__uorun100'];
    expect(h100Synth.label).toBe('H100');
    expect(h100Synth.label).not.toContain('feature-branch-a');
    expect(h100Synth.gpu).toContain('UNOFFICIAL: feature-branch-a');

    // No color overrides are populated — colors fall through to the
    // vendor-aware system in dynamic-colors.ts so two NVIDIA GPUs from a
    // single unofficial run get distinct shades of green instead of one
    // shared overlay-palette color.
    expect(result.colorOverrides).toEqual({});
  });

  it('keeps multiple runs separate so each (run, GPU) becomes its own legend entry', () => {
    const data = makeOverlayChartData();
    // Inject a second run's row alongside the first.
    const secondRunPoint = makeOverlayPoint({
      hwKey: 'h100_vllm',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/200',
      tpPerGpu: { y: 460, roof: false },
    });
    data['DeepSeek-R1-0528_1k/1k'].e2e.data.push(secondRunPoint);
    data['DeepSeek-R1-0528_1k/1k'].interactivity.data.push(secondRunPoint);

    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: data,
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });

    // Same physical GPU (h100_vllm) appears twice — once per run — with distinct
    // synth keys so they form separate roofline groups in the scatter chart.
    const e2eGraph = result.graphs.find((g) => g.chartDefinition.chartType === 'e2e')!;
    const h100Keys = e2eGraph.data
      .map((d) => d.hwKey)
      .filter((k) => String(k).startsWith('h100_vllm__uorun'));
    expect(h100Keys).toContain('h100_vllm__uorun100');
    expect(h100Keys).toContain('h100_vllm__uorun200');

    // Both runs of the same GPU get the bare GPU label — visual disambiguation
    // is done by the vendor-zone color system, which assigns distinct hues
    // within the same vendor band. Provenance still surfaces via `gpu`.
    expect(result.hardwareConfig['h100_vllm__uorun100'].label).toBe('H100');
    expect(result.hardwareConfig['h100_vllm__uorun200'].label).toBe('H100');
    expect(result.hardwareConfig['h100_vllm__uorun100'].gpu).toContain(
      'UNOFFICIAL: feature-branch-a',
    );
    expect(result.hardwareConfig['h100_vllm__uorun200'].gpu).toContain(
      'UNOFFICIAL: feature-branch-b',
    );
    expect(result.colorOverrides).toEqual({});
  });

  it('preserves official rows alongside merged overlay rows', () => {
    const { hardwareConfig } = emptyOfficial();
    const officialPoint = {
      hwKey: 'b200_trt',
      precision: 'fp4',
      tp: 4,
      conc: 8,
      x: 1.5,
      y: 800,
      date: '2026-03-01',
    } as InferenceData;
    const graphs: RenderableGraph[] = [
      {
        model: 'DeepSeek-R1-0528',
        sequence: '1k/1k',
        chartDefinition: E2E_DEF,
        data: [officialPoint],
      },
      {
        model: 'DeepSeek-R1-0528',
        sequence: '1k/1k',
        chartDefinition: INTERACTIVITY_DEF,
        data: [officialPoint],
      },
    ];

    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: makeOverlayChartData(),
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });

    const e2eGraph = result.graphs.find((g) => g.chartDefinition.chartType === 'e2e')!;
    expect(e2eGraph.data.some((d) => d.hwKey === 'b200_trt')).toBe(true);
    expect(e2eGraph.data.some((d) => String(d.hwKey).startsWith('h100_vllm__uorun'))).toBe(true);
  });

  it('synthesizes stub graphs from chartDefinitions when official graphs is empty', () => {
    const result = mergeUnofficialIntoOfficial({
      graphs: [],
      hardwareConfig: {},
      unofficialChartData: makeOverlayChartData(),
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
      chartDefinitions: CHART_DEFS,
    });

    // Two stub graphs synthesized (e2e + interactivity), each carrying merged overlay rows.
    expect(result.graphs).toHaveLength(2);
    expect(result.graphs.every((g) => g.data.length > 0)).toBe(true);
  });

  it('merges overlay rows from multiple sequences and tags each synth hwKey with __seq', () => {
    // Build an overlay map that has data for BOTH 1K/1K and 8K/1K so the
    // multi-sequence path has something to fan out.
    const data = makeOverlayChartData();
    const e2eData8k = [makeOverlayPoint({ conc: 64, tpPerGpu: { y: 600, roof: false } })];
    const interactivity8k = [makeOverlayPoint({ conc: 64, tpPerGpu: { y: 600, roof: false } })];
    data['DeepSeek-R1-0528_8k/1k'] = {
      e2e: {
        data: e2eData8k,
        gpus: {
          h100_vllm: { name: 'h100_vllm', label: 'H100', suffix: '(VLLM)', gpu: 'NVIDIA H100' },
        },
      },
      interactivity: {
        data: interactivity8k,
        gpus: {
          h100_vllm: { name: 'h100_vllm', label: 'H100', suffix: '(VLLM)', gpu: 'NVIDIA H100' },
        },
      },
    };

    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: data,
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      extraSequences: ['8k/1k'],
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });

    // Each chart graph receives rows from both sequences with a __seq tag
    // landing BEFORE the __uorun tag so the resulting key is
    // base__seq<compact>__uorun<id>.
    const e2eGraph = result.graphs.find((g) => g.chartDefinition.chartType === 'e2e')!;
    const synthKeys = e2eGraph.data.map((d) => String(d.hwKey));
    expect(synthKeys).toContain('h100_vllm__seq1k1k__uorun100');
    expect(synthKeys).toContain('h100_vllm__seq8k1k__uorun100');

    // Hardware config carries the sequence in the label so the legend can
    // tell the two H100 lines apart at a glance.
    expect(result.hardwareConfig['h100_vllm__seq1k1k__uorun100'].label).toContain('1K / 1K');
    expect(result.hardwareConfig['h100_vllm__seq8k1k__uorun100'].label).toContain('8K / 1K');

    // Base GPU prefix survives both suffixes — getModelSortIndex /
    // isKnownGpu / getVendor all use split('_')[0].
    expect('h100_vllm__seq1k1k__uorun100'.split('_')[0]).toBe('h100');
  });

  it('falls back to single-sequence behavior when extraSequences only contains the primary', () => {
    const { graphs, hardwareConfig } = emptyOfficial();
    const result = mergeUnofficialIntoOfficial({
      graphs,
      hardwareConfig,
      unofficialChartData: makeOverlayChartData(),
      selectedModel: 'DeepSeek-R1-0528',
      selectedSequence: '1k/1k',
      extraSequences: ['1k/1k'], // duplicate — should dedup down to single-sequence
      selectedYAxisMetric: 'y_tpPerGpu',
      selectedXAxisMetric: null,
      selectedE2eXAxisMetric: null,
      runIndexByUrl: RUN_INDEX,
      unofficialRunInfos: RUN_INFOS,
    });
    const e2eGraph = result.graphs.find((g) => g.chartDefinition.chartType === 'e2e')!;
    // No __seq suffix when only one sequence is effectively active.
    expect(e2eGraph.data.every((d) => !String(d.hwKey).includes('__seq'))).toBe(true);
  });
});

// Pull a hue out of an `oklch(L C H)` string for assertions below.
function hueOf(s: string): number {
  const m = s.match(/oklch\([^)]*\s+(?<hue>[\d.]+)\)/u);
  return m?.groups?.hue ? Number(m.groups.hue) : NaN;
}

describe('synth hwKey color integration with generateVendorColors', () => {
  // Regression: previously, two NVIDIA GPUs from one unofficial run shared a
  // single overlay-palette color (e.g. both rendered red), making B200 and
  // B300 visually identical. Now the merge omits color overrides and the
  // vendor-zone palette assigns each synth key its own hue within the
  // vendor's band.
  it('assigns distinct shades within the vendor zone to two NVIDIA GPUs from one unofficial run', () => {
    const synthKeys = [makeSynthHwKey('b200_vllm', 100), makeSynthHwKey('b300_vllm', 100)];
    expect(getVendor(synthKeys[0])).toBe('nvidia');
    expect(getVendor(synthKeys[1])).toBe('nvidia');
    const colors = generateVendorColors(synthKeys, 'light');
    expect(colors[synthKeys[0]]).toBeDefined();
    expect(colors[synthKeys[1]]).toBeDefined();
    expect(colors[synthKeys[0]]).not.toBe(colors[synthKeys[1]]);
  });

  it('keeps NVIDIA synth keys inside the NVIDIA hue zone and AMD synth keys inside AMD', () => {
    const nvidiaSynth = makeSynthHwKey('b200_vllm', 100);
    const amdSynth = makeSynthHwKey('mi300x_sglang', 100);
    const colors = generateVendorColors([nvidiaSynth, amdSynth], 'light');
    // VENDOR_OKLCH_ZONES.nvidia is 120–170 (greens/teals).
    const nvidiaHue = hueOf(colors[nvidiaSynth]);
    expect(nvidiaHue).toBeGreaterThanOrEqual(120);
    expect(nvidiaHue).toBeLessThanOrEqual(170);
    // VENDOR_OKLCH_ZONES.amd is 12–42 (reds/oranges).
    const amdHue = hueOf(colors[amdSynth]);
    expect(amdHue).toBeGreaterThanOrEqual(12);
    expect(amdHue).toBeLessThanOrEqual(42);
  });

  it('does not pin two unofficial runs of the same GPU to one color', () => {
    // Both synth keys share the `b200_vllm` base, so they fall in the same
    // sort bucket — but generateVendorColors still spreads them across
    // distinct hues within the NVIDIA zone.
    const a = makeSynthHwKey('b200_vllm', 100);
    const b = makeSynthHwKey('b200_vllm', 200);
    const colors = generateVendorColors([a, b], 'light');
    expect(colors[a]).not.toBe(colors[b]);
  });
});
