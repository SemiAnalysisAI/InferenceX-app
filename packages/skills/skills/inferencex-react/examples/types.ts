/**
 * TypeScript types for the InferenceX views API (https://inferencex.semianalysis.com).
 * Shapes follow the /api/v1/views/* response envelopes. Stability: beta.
 */

/** Every /api/v1/views/* JSON response shares this envelope. */
export interface ViewEnvelope {
  view: string;
  apiVersion: 'v1';
  /** ISO date — derived from the latest data date where possible. */
  generatedAt: string;
  /** Resolved effective parameters, including applied defaults. */
  params: Record<string, unknown>;
}

/** 400 error body for invalid enum values: { error, allowed }. */
export interface ViewApiError {
  error: string;
  allowed?: string[];
}

export type Percentile = 'p75' | 'p90';
export type XAxisMode = 'interactivity' | 'ttft' | 'e2e' | 'e2e-normalized-interactivity';
export type MetricPolarity = 'higher-better' | 'lower-better';

export interface MetricInfo {
  key: string;
  label: string;
  unit: string;
  polarity: MetricPolarity;
  direction: string;
}

/* ---------- /api/v1/views/options ---------- */

export interface ViewOptionsResponse extends ViewEnvelope {
  models: {
    name: string;
    dbKeys: string[];
    category: string;
    releaseDate?: string;
    compareSlug?: string;
  }[];
  sequences: {
    key: string;
    urlSegment: string;
    isl: number | null;
    osl: number | null;
    kind: string;
    deprecated: boolean;
  }[];
  precisions: string[];
  hardware: {
    key: string;
    label: string;
    vendor: string;
    arch: string;
    tdpW: number;
    costPerHour: { h: number; n: number; r: number };
  }[];
  frameworks: { key: string; label: string; family: string }[];
  specMethods: string[];
  percentiles: Percentile[];
  xAxisModes: XAxisMode[];
  scaleModes: string[];
  metrics: {
    key: string;
    configKey: string;
    label: string;
    labelZh: string;
    unit: string;
    polarity: MetricPolarity;
    group: string;
    source: string;
  }[];
  quickFilters: {
    vendors: string[];
    frameworkFamilies: string[];
    deployments: string[];
    specModes: string[];
  };
  reliabilityRanges: string[];
  overview: {
    tiers: number[];
    hardware: string[];
    engines: string[];
    windows: string[];
    scenarios: string[];
  };
  calculator: {
    modes: string[];
    costProviders: string[];
    costTypes: string[];
    defaults: Record<string, unknown>;
  };
  fleet: { metrics: string[]; defaults: Record<string, unknown> };
  defaults: Record<string, unknown>;
}

/* ---------- /api/v1/views/inference ---------- */

export interface InferencePoint {
  x: number;
  y: number;
  concurrency: number;
  tp: number;
  date: string;
  runId: string;
  frontier: boolean;
  bestPerSku: boolean;
  /** Raw metric integers for the underlying benchmark row. */
  metrics: Record<string, number>;
}

export interface InferenceSeries {
  hwKey: string;
  gpu: string;
  framework: string;
  specMethod: string;
  label: string;
  vendor: string;
  deployment: string;
  kvOffload: boolean;
  points: InferencePoint[];
}

export interface InferenceViewResponse extends ViewEnvelope {
  view: 'inference';
  metric: MetricInfo;
  xAxis: { mode: XAxisMode; label: string };
  series: InferenceSeries[];
  count: number;
}

/* ---------- /api/v1/views/historical ---------- */

export interface HistoricalPoint {
  date: string;
  value: number;
  clamped: boolean;
}

export interface HistoricalViewResponse extends ViewEnvelope {
  view: 'historical';
  metric: MetricInfo;
  /** Target interactivity (tok/s/user), default 35. */
  target: number;
  series: { hwKey: string; label: string; points: HistoricalPoint[] }[];
}

/* ---------- /api/v1/views/calculator ---------- */

export interface CalculatorHardwareResult {
  hwKey: string;
  label: string;
  value: number;
  inputThroughput: number;
  outputThroughput: number;
  cost: { total: number; input: number; output: number };
  tpPerMw: number;
  concurrency: number;
  clamped: boolean;
  clampedAbove: boolean;
  clampedBelow: boolean;
  nearest: { below: unknown; above: unknown };
  /** Present only when the mw param is set. */
  fleet?: { chips: number; racks?: number; totalTokPerSec: number };
}

/* ---------- /api/v1/views/fleet ---------- */

export interface FleetViewResponse extends ViewEnvelope {
  view: 'fleet';
  assumptions: Record<string, unknown>;
  series: {
    hwKey: string;
    label: string;
    availability: number;
    breakEvenPricePerMTok: number;
    points: ({ month: number; value: number; revenue: number; margin: number } & Record<
      string,
      number
    >)[];
  }[];
}

/* ---------- /api/v1/views/reliability ---------- */

export interface ReliabilityViewResponse extends ViewEnvelope {
  view: 'reliability';
  range: string;
  hardware: {
    key: string;
    label: string;
    successRate: number;
    successes: number;
    total: number;
  }[];
  generatedFrom: { firstDate: string; lastDate: string };
}

/* ---------- /api/v1/views/evaluation ---------- */

export interface EvaluationViewResponse extends ViewEnvelope {
  view: 'evaluation';
  benchmarks: string[];
  rows: {
    hwKey: string;
    label: string;
    score: number;
    stderr?: number;
    n: number;
    precision: string;
    framework: string;
  }[];
}

/* ---------- /api/v1/views/gpu-specs ---------- */

export interface GpuSpecsViewResponse extends ViewEnvelope {
  view: 'gpu-specs';
  chips: ({
    key: string;
    label: string;
    vendor: string;
    memoryGB: number;
    memoryBandwidthTBs: number;
    fp4Tflops: number;
    fp8Tflops: number;
    bf16Tflops: number;
    tdpW: number;
    scaleUpBandwidth: number;
    scaleUpWorldSize: number;
    domainMemory: number;
    domainMemoryBandwidth: number;
  } & Record<string, unknown>)[];
  metrics: Record<string, unknown>[];
}

/* ---------- /api/v1/views/rankings ---------- */

export interface RankingRow {
  rank: number;
  hardware: string;
  chip: string;
  value: number;
  unit: string;
  framework: string;
  precision: string;
}

export interface RankingsViewResponse extends ViewEnvelope {
  view: 'rankings';
  kind: 'fastest-gpu' | 'cheapest-gpu';
  entries: { model: string; scenario: string; rows: RankingRow[] }[];
}

/* ---------- /api/v1/views/overview ---------- */

export interface OverviewViewResponse extends ViewEnvelope {
  view: 'overview';
  tiers: number[];
  scenarios: string[];
  rows: {
    model: string;
    scenario: string;
    cells: {
      hardware: string;
      costPerMTok: number;
      config: { framework: string; precision: string } & Record<string, unknown>;
      deltaVsRef: number | null;
      history?: unknown;
    }[];
  }[];
}

/* ---------- /api/v1/views/compare ---------- */

export interface CompareViewResponse extends ViewEnvelope {
  view: 'compare';
  model: string;
  gpus: [string, string];
  scenario: string;
  variant: 'default' | 'per-dollar' | 'precision' | 'spec-decode';
  tiers: number[];
  table: {
    tier: number;
    a: Record<string, unknown>;
    b: Record<string, unknown>;
    delta: number;
    winner: string;
  }[];
  summary: Record<string, unknown>;
}
