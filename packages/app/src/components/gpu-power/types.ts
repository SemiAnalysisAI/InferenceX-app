import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import {
  parseAmdTimestamp,
  parseNvidiaTimestamp,
  splitCsvLine,
} from '@semianalysisai/inferencex-db/etl/gpu-metrics-csv';
import type {
  GpuMetricSampleRow,
  GpuMetricSeries,
  GpuMetricStatRow,
} from '@semianalysisai/inferencex-db/queries/gpu-metrics';

export type GpuMetricRow = GpuMetricSampleRow;

export interface GpuPowerRunInfo {
  id: number;
  name: string;
  branch: string;
  sha: string;
  createdAt: string;
  url: string;
  conclusion: string;
  status: string;
}

export interface GpuMetricsArtifact {
  name: string;
  data: GpuMetricRow[];
  /** Only database-backed artifacts carry the full-record digest. */
  series?: Omit<GpuMetricSeries, 'data'>;
}

export interface GpuPowerApiResponse {
  runInfo: GpuPowerRunInfo;
  artifacts: GpuMetricsArtifact[];
}

export type GpuMetricKey =
  | 'power'
  | 'temperature'
  | 'smClock'
  | 'memClock'
  | 'gpuUtil'
  | 'memUtil'
  | 'edgeTemp'
  | 'memTemp'
  | 'gfxVoltage'
  | 'socVoltage'
  | 'memVoltage'
  | 'fclk'
  | 'socClk'
  | 'mmActivity';

export interface GpuMetricConfig {
  key: GpuMetricKey;
  label: string;
  labelZh: string;
  unit: string;
  yAxisLabel: string;
  yAxisLabelZh: string;
}

export function getGpuMetricLabel(metric: GpuMetricConfig, locale: 'en' | 'zh'): string {
  return locale === 'zh' ? metric.labelZh : metric.label;
}

export function getGpuMetricYAxisLabel(metric: GpuMetricConfig, locale: 'en' | 'zh'): string {
  return locale === 'zh' ? metric.yAxisLabelZh : metric.yAxisLabel;
}

/** Common metrics available on both NVIDIA and AMD GPUs. */
export const GPU_METRIC_OPTIONS: GpuMetricConfig[] = [
  {
    key: 'power',
    label: 'Power Draw',
    labelZh: '功耗',
    unit: 'W',
    yAxisLabel: 'Power Draw (W)',
    yAxisLabelZh: '功耗 (W)',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    labelZh: '温度',
    unit: '°C',
    yAxisLabel: 'Temperature (°C)',
    yAxisLabelZh: '温度 (°C)',
  },
  {
    key: 'smClock',
    label: 'GFX Clock',
    labelZh: 'GFX 时钟',
    unit: 'MHz',
    yAxisLabel: 'GFX Clock (MHz)',
    yAxisLabelZh: 'GFX 时钟 (MHz)',
  },
  {
    key: 'memClock',
    label: 'Memory Clock',
    labelZh: '显存时钟',
    unit: 'MHz',
    yAxisLabel: 'Memory Clock (MHz)',
    yAxisLabelZh: '显存时钟 (MHz)',
  },
  {
    key: 'gpuUtil',
    label: 'Chip Utilization',
    labelZh: '芯片利用率',
    unit: '%',
    yAxisLabel: 'Chip Utilization (%)',
    yAxisLabelZh: '芯片利用率 (%)',
  },
  {
    key: 'memUtil',
    label: 'Memory Utilization',
    labelZh: '显存利用率',
    unit: '%',
    yAxisLabel: 'Memory Utilization (%)',
    yAxisLabelZh: '显存利用率 (%)',
  },
];

/** AMD-specific metrics (only present when data comes from amd-smi). */
export const AMD_METRIC_OPTIONS: GpuMetricConfig[] = [
  {
    key: 'edgeTemp',
    label: 'Edge Temperature',
    labelZh: '边缘温度',
    unit: '°C',
    yAxisLabel: 'Edge Temperature (°C)',
    yAxisLabelZh: '边缘温度 (°C)',
  },
  {
    key: 'memTemp',
    label: 'Memory Temperature',
    labelZh: '显存温度',
    unit: '°C',
    yAxisLabel: 'Memory Temperature (°C)',
    yAxisLabelZh: '显存温度 (°C)',
  },
  {
    key: 'gfxVoltage',
    label: 'GFX Voltage',
    labelZh: 'GFX 电压',
    unit: 'mV',
    yAxisLabel: 'GFX Voltage (mV)',
    yAxisLabelZh: 'GFX 电压 (mV)',
  },
  {
    key: 'socVoltage',
    label: 'SoC Voltage',
    labelZh: 'SoC 电压',
    unit: 'mV',
    yAxisLabel: 'SoC Voltage (mV)',
    yAxisLabelZh: 'SoC 电压 (mV)',
  },
  {
    key: 'memVoltage',
    label: 'Memory Voltage',
    labelZh: '显存电压',
    unit: 'mV',
    yAxisLabel: 'Memory Voltage (mV)',
    yAxisLabelZh: '显存电压 (mV)',
  },
  {
    key: 'fclk',
    label: 'Fabric Clock',
    labelZh: 'Fabric 时钟',
    unit: 'MHz',
    yAxisLabel: 'Fabric Clock (MHz)',
    yAxisLabelZh: 'Fabric 时钟 (MHz)',
  },
  {
    key: 'socClk',
    label: 'SoC Clock',
    labelZh: 'SoC 时钟',
    unit: 'MHz',
    yAxisLabel: 'SoC Clock (MHz)',
    yAxisLabelZh: 'SoC 时钟 (MHz)',
  },
  {
    key: 'mmActivity',
    label: 'MM Activity',
    labelZh: '多媒体活动率',
    unit: '%',
    yAxisLabel: 'Multimedia Activity (%)',
    yAxisLabelZh: '多媒体活动率 (%)',
  },
];

/** All metric options combined. */
export const ALL_METRIC_OPTIONS: GpuMetricConfig[] = [...GPU_METRIC_OPTIONS, ...AMD_METRIC_OPTIONS];

/**
 * Returns the metric options that have data in the given dataset.
 * A metric is shown only when at least one row has a finite reading.
 */
export function getAvailableMetrics(data: GpuMetricRow[]): GpuMetricConfig[] {
  if (data.length === 0) return GPU_METRIC_OPTIONS;
  return ALL_METRIC_OPTIONS.filter((m) => data.some((row) => Number.isFinite(row[m.key])));
}

/** TDP for a known hardware key, e.g. the benchmark point's own `hardware`. */
export function tdpForHardware(hardware: string | undefined): { sku: string; tdp: number } | null {
  const key = hardware?.toLowerCase();
  if (!key) return null;
  const entry = HW_REGISTRY[key];
  return entry ? { sku: key.toUpperCase(), tdp: entry.tdp } : null;
}

/**
 * Detect GPU SKU from an artifact name and return its TDP in watts.
 * Artifact names look like: gpu_metrics_dsr1_1k8k_fp8_sglang_tp8_..._h200-nb_0
 */
export function detectTdpFromArtifactName(
  artifactName: string,
): { sku: string; tdp: number } | null {
  const lower = artifactName.toLowerCase();
  // Sorted longest-first to avoid partial matches (e.g., gb200 before b200)
  const keys = Object.keys(HW_REGISTRY).toSorted((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) {
      return { sku: key.toUpperCase(), tdp: HW_REGISTRY[key].tdp };
    }
  }
  return null;
}

function parseTimestampToMs(raw: string): number | null {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.getTime();
  const n = parseFloat(raw);
  if (!isNaN(n)) return n < 1e12 ? n * 1000 : n;
  return null;
}

/**
 * Build a column-index lookup from a CSV header line.
 * Returns a map of header name → column index.
 */
function buildColumnMap(headerLine: string): Map<string, number> {
  const headers = splitCsvLine(headerLine);
  const map = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    map.set(headers[i].toLowerCase().replace(/\s*\[.*\]$/u, ''), i);
  }
  return map;
}

/**
 * Parse NVIDIA nvidia-smi CSV format.
 * Columns: timestamp, index, power.draw [W], temperature.gpu,
 * clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]
 */
function parseNvidiaCsv(lines: string[]): GpuMetricRow[] {
  const columns = buildColumnMap(lines[0]);
  const col = (name: string) => columns.get(name) ?? -1;
  const iTimestamp = col('timestamp');
  const iIndex = col('index');
  const iPower = col('power.draw');
  if (iTimestamp < 0 || iIndex < 0 || iPower < 0) return [];
  const results: GpuMetricRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length <= Math.max(iTimestamp, iIndex, iPower)) continue;
    const index = parseInt(cols[iIndex], 10);
    const power = safeFloat(cols[iPower]);
    if (!Number.isInteger(index) || index < 0 || power === undefined) continue;

    results.push({
      timestamp: cols[iTimestamp],
      index,
      power,
      temperature: safeFloat(cols[col('temperature.gpu')]),
      smClock: safeFloat(cols[col('clocks.current.sm')]),
      memClock: safeFloat(cols[col('clocks.current.memory')]),
      gpuUtil: safeFloat(cols[col('utilization.gpu')]),
      memUtil: safeFloat(cols[col('utilization.memory')]),
    });
  }
  return results;
}

/** Missing, unparseable and nonfinite readings stay absent; measured zero is valid. */
function safeFloat(val: string | undefined): number | undefined {
  if (val === undefined || val === 'N/A' || val === '') return undefined;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse AMD amd-smi CSV format.
 * Key columns: timestamp, gpu, socket_power, gfx_activity, umc_activity,
 * gfx_0_clk, mem_0_clk, hotspot, edge, mem, gfx_voltage, soc_voltage,
 * mem_voltage, fclk_0_clk, socclk_0_clk, mm_activity
 */
function parseAmdCsv(lines: string[], colMap: Map<string, number>): GpuMetricRow[] {
  const col = (name: string) => colMap.get(name) ?? -1;
  const iTimestamp = col('timestamp');
  const iGpu = col('gpu');
  const iPower = col('socket_power');
  const iGfxActivity = col('gfx_activity');
  const iUmcActivity = col('umc_activity');
  const iGfxClk = col('gfx_0_clk');
  const iMemClk = col('mem_0_clk');
  const iHotspot = col('hotspot');
  const iEdge = col('edge');
  const iMemTemp = col('mem');
  const iGfxVoltage = col('gfx_voltage');
  const iSocVoltage = col('soc_voltage');
  const iMemVoltage = col('mem_voltage');
  const iFclk = col('fclk_0_clk');
  const iSocClk = col('socclk_0_clk');
  const iMmActivity = col('mm_activity');

  if (iTimestamp < 0 || iGpu < 0 || iPower < 0) return [];

  const results: GpuMetricRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= Math.max(iTimestamp, iGpu, iPower)) continue;

    const index = parseInt(cols[iGpu], 10);
    const power = safeFloat(cols[iPower]);
    // Prefer hotspot temp, fall back to edge
    const temperature = safeFloat(cols[iHotspot]) ?? safeFloat(cols[iEdge]);
    const smClock = safeFloat(cols[iGfxClk]);
    const memClock = safeFloat(cols[iMemClk]);
    const gpuUtil = safeFloat(cols[iGfxActivity]);
    const memUtil = safeFloat(cols[iUmcActivity]);

    if (!Number.isInteger(index) || index < 0 || power === undefined) continue;

    // Round epoch fractions exactly as ingest does before constructing the dedup key.
    const timestampMs = parseAmdTimestamp(cols[iTimestamp]);
    if (timestampMs === null) continue;
    const date = new Date(timestampMs);
    if (!Number.isFinite(date.getTime())) continue;
    const timestamp = date.toISOString();

    // AMD-specific metrics
    const edgeTemp = iEdge >= 0 ? safeFloat(cols[iEdge]) : undefined;
    const memTemp = iMemTemp >= 0 ? safeFloat(cols[iMemTemp]) : undefined;
    const gfxVoltage = iGfxVoltage >= 0 ? safeFloat(cols[iGfxVoltage]) : undefined;
    const socVoltage = iSocVoltage >= 0 ? safeFloat(cols[iSocVoltage]) : undefined;
    const memVoltage = iMemVoltage >= 0 ? safeFloat(cols[iMemVoltage]) : undefined;
    const fclk = iFclk >= 0 ? safeFloat(cols[iFclk]) : undefined;
    const socClk = iSocClk >= 0 ? safeFloat(cols[iSocClk]) : undefined;
    const mmActivity = iMmActivity >= 0 ? safeFloat(cols[iMmActivity]) : undefined;

    results.push({
      timestamp,
      index,
      power,
      temperature,
      smClock,
      memClock,
      gpuUtil,
      memUtil,
      edgeTemp,
      memTemp,
      gfxVoltage,
      socVoltage,
      memVoltage,
      fclk,
      socClk,
      mmActivity,
    });
  }
  return results;
}

/**
 * Parse CSV text from gpu_metrics artifacts into structured rows.
 * Auto-detects NVIDIA (nvidia-smi) vs AMD (amd-smi) format from the header.
 */
export function parseCsvData(csvText: string): GpuMetricRow[] {
  const lines = csvText
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const headerLower = lines[0].toLowerCase();

  const rows =
    headerLower.includes('socket_power') || headerLower.includes('gfx_activity')
      ? parseAmdCsv(lines, buildColumnMap(lines[0]))
      : parseNvidiaCsv(lines);
  // Normalize one CSV at a time: host-local indices may repeat in other files.
  // Keep the first device/timestamp sample, matching the persisted digest.
  const seen = new Set<string>();
  return rows.filter((row) => {
    // NVIDIA's naive collector clock must not use the reader's local DST rules.
    const ms = parseNvidiaTimestamp(row.timestamp) ?? parseTimestampToMs(row.timestamp);
    if (ms === null || !Number.isFinite(ms)) return false;
    const key = `${row.index}:${ms}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Statistics ---

export type GpuStats = Omit<GpuMetricStatRow, 'metric'>;

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeGpuStats(data: GpuMetricRow[], metricKey: GpuMetricKey): GpuStats[] {
  const groups = new Map<number, number[]>();
  for (const row of data) {
    const val = row[metricKey];
    if (val === undefined || !Number.isFinite(val)) continue;
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push(val);
  }

  const result: GpuStats[] = [];
  for (const [gpuIndex, values] of [...groups.entries()].toSorted((a, b) => a[0] - b[0])) {
    if (values.length === 0) continue;
    const sorted = [...values].toSorted((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    result.push({
      gpuIndex,
      count: values.length,
      min: sorted[0],
      max: sorted.at(-1)!,
      mean,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      stddev: Math.sqrt(variance),
    });
  }
  return result;
}
