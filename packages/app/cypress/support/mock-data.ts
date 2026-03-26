import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceChartContextType,
  InferenceData,
} from '@/components/inference/types';
import type {
  EvaluationChartContextType,
  EvaluationChartData,
} from '@/components/evaluation/types';
import type {
  ModelSuccessRateData,
  ReliabilityChartContextType,
} from '@/components/reliability/types';
import type { GlobalFilterContextType } from '@/components/GlobalFilterContext';
import type { UnofficialRunContextType } from '@/components/unofficial-run-provider';
import { Model, Sequence, Precision } from '@/lib/data-mappings';
import React from 'react';

/** cy.stub() with .as() alias — cast to any to work around Cypress type limitation. */
function namedStub(alias: string) {
  return (cy.stub() as any).as(alias);
}

// ---------------------------------------------------------------------------
// Hardware config
// ---------------------------------------------------------------------------

export function createMockHardwareConfig(): HardwareConfig {
  return {
    h100: {
      name: 'h100',
      label: 'H100',
      suffix: '',
      gpu: "NVIDIA 'Hopper' H100",
    },
    h200: {
      name: 'h200',
      label: 'H200',
      suffix: '',
      gpu: "NVIDIA 'Hopper' H200",
    },
    b200: {
      name: 'b200',
      label: 'B200',
      suffix: '',
      gpu: "NVIDIA 'Blackwell' B200",
    },
    b200_trt: {
      name: 'b200-trt',
      label: 'B200',
      suffix: '(TRT)',
      gpu: "NVIDIA 'Blackwell' B200 TRT",
    },
    mi300x: {
      name: 'mi300x',
      label: 'MI300X',
      suffix: '',
      gpu: 'AMD Instinct MI300X',
    },
    h100_vllm: {
      name: 'h100-vllm',
      label: 'H100',
      suffix: '(vLLM)',
      gpu: "NVIDIA 'Hopper' H100 vLLM",
      framework: 'vllm',
    },
    b200_sglang: {
      name: 'b200-sglang',
      label: 'B200',
      suffix: '(SGLang)',
      gpu: "NVIDIA 'Blackwell' B200 SGLang",
      framework: 'sglang',
    },
  };
}

// ---------------------------------------------------------------------------
// Chart definition
// ---------------------------------------------------------------------------

export function createMockChartDefinition(overrides?: Partial<ChartDefinition>): ChartDefinition {
  return {
    chartType: 'scatter',
    heading: 'End-to-End Latency vs Throughput',
    x: 'conc' as keyof AggDataEntry,
    x_label: 'Concurrency',
    y: 'mean_e2el' as keyof AggDataEntry,
    y_label: 'Mean E2E Latency (ms)',
    y_tpPerGpu: 'tput_per_gpu',
    y_tpPerGpu_label: 'Throughput / GPU (tok/s)',
    y_tpPerGpu_title: 'Throughput per GPU',
    y_tpPerGpu_roofline: 'upper_right',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inference data
// ---------------------------------------------------------------------------

export function createMockInferenceData(overrides?: Partial<InferenceData>): InferenceData {
  return {
    x: 100,
    y: 45.2,
    hwKey: 'b200_trt',
    hw: "NVIDIA 'Blackwell' B200 TRT",
    model: Model.DeepSeek_R1,
    framework: 'trt',
    precision: Precision.FP4,
    tp: 8,
    conc: 64,
    date: '2025-03-01',
    tput_per_gpu: 320,
    output_tput_per_gpu: 280,
    input_tput_per_gpu: 40,
    mean_ttft: 120,
    median_ttft: 110,
    std_ttft: 25,
    p99_ttft: 250,
    mean_tpot: 12,
    mean_intvty: 14,
    median_tpot: 11,
    median_intvty: 13,
    std_tpot: 3,
    std_intvty: 4,
    p99_tpot: 22,
    p99_intvty: 28,
    mean_itl: 11,
    median_itl: 10,
    std_itl: 2,
    p99_itl: 20,
    mean_e2el: 450,
    median_e2el: 430,
    std_e2el: 80,
    p99_e2el: 680,
    disagg: false,
    spec_decoding: 'none',
    tpPerGpu: { y: 320, roof: true },
    outputTputPerGpu: { y: 280, roof: false },
    inputTputPerGpu: { y: 40, roof: false },
    tpPerMw: { y: 185, roof: false },
    costh: { y: 0.52, roof: false },
    costn: { y: 0.68, roof: false },
    costr: { y: 0.45, roof: false },
    costhi: { y: 0.4, roof: false },
    costni: { y: 0.55, roof: false },
    costri: { y: 0.35, roof: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inference context
// ---------------------------------------------------------------------------

export function createMockInferenceContext(
  overrides?: Partial<InferenceChartContextType>,
): InferenceChartContextType {
  const hwConfig = createMockHardwareConfig();
  return {
    activeHwTypes: new Set(['h100', 'b200', 'b200_trt', 'mi300x', 'h200']),
    hwTypesWithData: new Set(['h100', 'b200', 'b200_trt', 'mi300x', 'h200']),
    toggleHwType: namedStub('toggleHwType'),
    removeHwType: namedStub('removeHwType'),
    selectAllHwTypes: namedStub('selectAllHwTypes'),
    toggleActiveDate: namedStub('toggleActiveDate'),
    removeActiveDate: namedStub('removeActiveDate'),
    selectAllActiveDates: namedStub('selectAllActiveDates'),
    activeDates: new Set(['2025-03-01']),
    hardwareConfig: hwConfig,
    graphs: [
      {
        model: Model.DeepSeek_R1,
        sequence: Sequence.EightK_OneK,
        chartDefinition: createMockChartDefinition(),
        data: [createMockInferenceData()],
      },
    ],
    selectedModel: Model.DeepSeek_R1,
    setSelectedModel: namedStub('setSelectedModel'),
    selectedSequence: Sequence.EightK_OneK,
    setSelectedSequence: namedStub('setSelectedSequence'),
    selectedPrecisions: [Precision.FP4],
    setSelectedPrecisions: namedStub('setSelectedPrecisions'),
    loading: false,
    error: null,
    workflowInfo: null,
    selectedYAxisMetric: 'y_tpPerGpu',
    setSelectedYAxisMetric: namedStub('setSelectedYAxisMetric'),
    selectedXAxisMetric: null,
    setSelectedXAxisMetric: namedStub('setSelectedXAxisMetric'),
    selectedE2eXAxisMetric: null,
    setSelectedE2eXAxisMetric: namedStub('setSelectedE2eXAxisMetric'),
    scaleType: 'auto',
    setScaleType: namedStub('setScaleType'),
    isLegendExpanded: true,
    setIsLegendExpanded: namedStub('setIsLegendExpanded'),
    hideNonOptimal: false,
    setHideNonOptimal: namedStub('setHideNonOptimal'),
    hidePointLabels: false,
    setHidePointLabels: namedStub('setHidePointLabels'),
    highContrast: false,
    setHighContrast: namedStub('setHighContrast'),
    colorShuffleSeed: 0,
    shuffleColors: namedStub('shuffleColors'),
    logScale: false,
    setLogScale: namedStub('setLogScale'),
    useAdvancedLabels: false,
    setUseAdvancedLabels: namedStub('setUseAdvancedLabels'),
    showGradientLabels: false,
    setShowGradientLabels: namedStub('setShowGradientLabels'),
    selectedGPUs: [],
    setSelectedGPUs: namedStub('setSelectedGPUs'),
    availableGPUs: [
      { value: 'h100', label: 'H100' },
      { value: 'b200', label: 'B200' },
      { value: 'mi300x', label: 'MI300X' },
      { value: 'h200', label: 'H200' },
    ],
    selectedDates: ['2025-03-01'],
    setSelectedDates: namedStub('setSelectedDates'),
    selectedDateRange: { startDate: '2025-02-01', endDate: '2025-03-01' },
    setSelectedDateRange: namedStub('setSelectedDateRange'),
    userCosts: null,
    setUserCosts: namedStub('setUserCosts'),
    selectedRunDate: '2025-03-01',
    setSelectedRunDate: namedStub('setSelectedRunDate'),
    availableDates: ['2025-02-28', '2025-03-01'],
    dateRangeAvailableDates: ['2025-02-28', '2025-03-01'],
    isCheckingAvailableDates: false,
    availableRuns: null,
    selectedRunId: '12345678',
    setSelectedRunId: namedStub('setSelectedRunId'),
    availablePrecisions: [Precision.FP4, Precision.FP8],
    availableSequences: [Sequence.EightK_OneK, Sequence.OneK_OneK],
    availableModels: [Model.DeepSeek_R1],
    userPowers: null,
    setUserPowers: namedStub('setUserPowers'),
    trackedConfigs: [],
    addTrackedConfig: namedStub('addTrackedConfig'),
    removeTrackedConfig: namedStub('removeTrackedConfig'),
    clearTrackedConfigs: namedStub('clearTrackedConfigs'),
    setHwFilter: namedStub('setHwFilter'),
    activePresetId: null,
    setActivePresetId: namedStub('setActivePresetId'),
    presetGuardRef: { current: false } as React.RefObject<boolean>,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Evaluation chart data
// ---------------------------------------------------------------------------

export function createMockEvaluationChartData(
  overrides?: Partial<EvaluationChartData>,
): EvaluationChartData {
  return {
    configId: 1,
    hwKey: 'b200_trt' as any,
    configLabel: 'B200 (TRT)',
    score: 87.5,
    scoreError: 1.2,
    minScore: 85.0,
    maxScore: 90.0,
    errorMin: 86.3,
    errorMax: 88.7,
    model: Model.DeepSeek_R1,
    benchmark: 'mmlu',
    specDecode: 'none',
    date: '2025-03-01',
    datetime: '2025-03-01T00:00:00Z',
    precision: Precision.FP4,
    framework: 'trt',
    tp: 8,
    ep: 0,
    dp_attention: false,
    conc: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export function createMockEvaluationContext(
  overrides?: Partial<EvaluationChartContextType>,
): EvaluationChartContextType {
  return {
    loading: false,
    error: null,
    selectedBenchmark: 'mmlu',
    setSelectedBenchmark: namedStub('setSelectedBenchmark'),
    selectedModel: Model.DeepSeek_R1,
    setSelectedModel: namedStub('setSelectedModel_eval'),
    selectedRunDate: '2025-03-01',
    setSelectedRunDate: namedStub('setSelectedRunDate_eval'),
    availableBenchmarks: ['mmlu', 'humaneval', 'gsm8k'],
    availableModels: [Model.DeepSeek_R1],
    availableDates: ['2025-02-28', '2025-03-01'],
    chartData: [createMockEvaluationChartData()],
    unfilteredChartData: [createMockEvaluationChartData()],
    enabledHardware: new Set(['b200_trt', 'h100', 'mi300x']),
    toggleHardware: namedStub('toggleHardware'),
    removeHardware: namedStub('removeHardware'),
    highContrast: false,
    setHighContrast: namedStub('setHighContrast_eval'),
    showLabels: true,
    setShowLabels: namedStub('setShowLabels'),
    isLegendExpanded: true,
    setIsLegendExpanded: namedStub('setIsLegendExpanded_eval'),
    hwTypesWithData: new Set(['b200_trt', 'h100', 'mi300x']),
    selectAllHwTypes: namedStub('selectAllHwTypes_eval'),
    highlightedConfigs: new Set<string>(),
    changelogEntries: [],
    modelHasEvalData: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reliability data
// ---------------------------------------------------------------------------

export function createMockReliabilityData(
  overrides?: Partial<ModelSuccessRateData & { modelLabel: string }>,
): ModelSuccessRateData & { modelLabel: string } {
  return {
    model: Model.DeepSeek_R1,
    modelLabel: 'DeepSeek R1 0528',
    successRate: 96.5,
    total: 200,
    n_success: 193,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reliability context
// ---------------------------------------------------------------------------

export function createMockReliabilityContext(
  overrides?: Partial<ReliabilityChartContextType>,
): ReliabilityChartContextType {
  const mockData = createMockReliabilityData();
  return {
    loading: false,
    error: null,
    dateRangeSuccessRateData: {
      'last-7-days': {
        [Model.DeepSeek_R1]: {
          rate: 96.5,
          total: 200,
          n_success: 193,
        },
      },
    },
    filteredReliabilityData: [mockData],
    chartData: [mockData],
    availableModels: [Model.DeepSeek_R1],
    dateRange: 'last-7-days',
    setDateRange: namedStub('setDateRange'),
    showPercentagesOnBars: true,
    setShowPercentagesOnBars: namedStub('setShowPercentagesOnBars'),
    highContrast: false,
    setHighContrast: namedStub('setHighContrast_reliability'),
    enabledModels: new Set([Model.DeepSeek_R1]),
    toggleModel: namedStub('toggleModel'),
    removeModel: namedStub('removeModel'),
    isLegendExpanded: true,
    setIsLegendExpanded: namedStub('setIsLegendExpanded_reliability'),
    modelsWithData: new Set([Model.DeepSeek_R1]),
    selectAllModels: namedStub('selectAllModels'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Global filter context
// ---------------------------------------------------------------------------

export function createMockGlobalFilterContext(
  overrides?: Partial<GlobalFilterContextType>,
): GlobalFilterContextType {
  return {
    selectedModel: Model.DeepSeek_R1,
    setSelectedModel: namedStub('setSelectedModel_global'),
    selectedSequence: Sequence.EightK_OneK,
    setSelectedSequence: namedStub('setSelectedSequence_global'),
    selectedPrecisions: [Precision.FP4],
    setSelectedPrecisions: namedStub('setSelectedPrecisions_global'),
    effectiveSequence: Sequence.EightK_OneK,
    effectivePrecisions: [Precision.FP4],
    selectedRunDate: '2025-03-01',
    setSelectedRunDate: namedStub('setSelectedRunDate_global'),
    selectedRunDateRev: 0,
    selectedRunId: '12345678',
    setSelectedRunId: namedStub('setSelectedRunId_global'),
    availableModels: [Model.DeepSeek_R1],
    availableSequences: [Sequence.EightK_OneK, Sequence.OneK_OneK],
    availablePrecisions: [Precision.FP4, Precision.FP8],
    availableDates: ['2025-02-28', '2025-03-01'],
    effectiveRunDate: '2025-03-01',
    availabilityRows: undefined,
    workflowInfo: null,
    availableRuns: {},
    workflowLoading: false,
    workflowError: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unofficial run context
// ---------------------------------------------------------------------------

export function createMockUnofficialRunContext(
  overrides?: Partial<UnofficialRunContextType>,
): UnofficialRunContextType {
  return {
    isUnofficialRun: false,
    unofficialRunInfo: null,
    unofficialChartData: null,
    loading: false,
    error: null,
    clearUnofficialRun: namedStub('clearUnofficialRun'),
    availableModelsAndSequences: [],
    getOverlayData: cy
      .stub()
      .returns(null) as unknown as UnofficialRunContextType['getOverlayData'],
    activeOverlayHwTypes: new Set<string>(),
    setActiveOverlayHwTypes: namedStub('setActiveOverlayHwTypes'),
    allOverlayHwTypes: new Set<string>(),
    toggleOverlayHwType: namedStub('toggleOverlayHwType'),
    resetOverlayHwTypes: namedStub('resetOverlayHwTypes'),
    localOfficialOverride: null,
    setLocalOfficialOverride: namedStub('setLocalOfficialOverride'),
    ...overrides,
  };
}
