export interface GpuMetricRow {
  timestamp: string;
  index: number;
  power: number;
  temperature: number;
  smClock: number;
  memClock: number;
  gpuUtil: number;
  memUtil: number;
  // AMD-specific optional fields
  edgeTemp?: number;
  memTemp?: number;
  gfxVoltage?: number;
  socVoltage?: number;
  memVoltage?: number;
  fclk?: number;
  socClk?: number;
  mmActivity?: number;
}

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
  unit: string;
  yAxisLabel: string;
}

/** Common metrics available on both NVIDIA and AMD GPUs. */
export const GPU_METRIC_OPTIONS: GpuMetricConfig[] = [
  { key: 'power', label: 'Power Draw', unit: 'W', yAxisLabel: 'Power Draw (W)' },
  { key: 'temperature', label: 'Temperature', unit: '°C', yAxisLabel: 'Temperature (°C)' },
  { key: 'smClock', label: 'GFX Clock', unit: 'MHz', yAxisLabel: 'GFX Clock (MHz)' },
  { key: 'memClock', label: 'Memory Clock', unit: 'MHz', yAxisLabel: 'Memory Clock (MHz)' },
  { key: 'gpuUtil', label: 'GPU Utilization', unit: '%', yAxisLabel: 'GPU Utilization (%)' },
  { key: 'memUtil', label: 'Memory Utilization', unit: '%', yAxisLabel: 'Memory Utilization (%)' },
];

/** AMD-specific metrics (only present when data comes from amd-smi). */
export const AMD_METRIC_OPTIONS: GpuMetricConfig[] = [
  { key: 'edgeTemp', label: 'Edge Temperature', unit: '°C', yAxisLabel: 'Edge Temperature (°C)' },
  {
    key: 'memTemp',
    label: 'Memory Temperature',
    unit: '°C',
    yAxisLabel: 'Memory Temperature (°C)',
  },
  { key: 'gfxVoltage', label: 'GFX Voltage', unit: 'mV', yAxisLabel: 'GFX Voltage (mV)' },
  { key: 'socVoltage', label: 'SoC Voltage', unit: 'mV', yAxisLabel: 'SoC Voltage (mV)' },
  { key: 'memVoltage', label: 'Memory Voltage', unit: 'mV', yAxisLabel: 'Memory Voltage (mV)' },
  { key: 'fclk', label: 'Fabric Clock', unit: 'MHz', yAxisLabel: 'Fabric Clock (MHz)' },
  { key: 'socClk', label: 'SoC Clock', unit: 'MHz', yAxisLabel: 'SoC Clock (MHz)' },
  { key: 'mmActivity', label: 'MM Activity', unit: '%', yAxisLabel: 'Multimedia Activity (%)' },
];

/** All metric options combined. */
export const ALL_METRIC_OPTIONS: GpuMetricConfig[] = [...GPU_METRIC_OPTIONS, ...AMD_METRIC_OPTIONS];

/**
 * Returns the metric options that have data in the given dataset.
 * AMD-specific metrics are only shown when at least one row has a non-undefined value.
 */
export function getAvailableMetrics(data: GpuMetricRow[]): GpuMetricConfig[] {
  if (data.length === 0) return GPU_METRIC_OPTIONS;
  return ALL_METRIC_OPTIONS.filter((m) => data.some((row) => row[m.key] !== undefined));
}

/** TDP (Thermal Design Power) per GPU SKU in watts. */
const GPU_TDP_MAP: Record<string, number> = {
  h100: 700,
  h200: 700,
  b200: 1000,
  b300: 1200,
  gb200: 1200,
  gb300: 1400,
  mi300x: 750,
  mi325x: 1000,
  mi355x: 1400,
};

/**
 * Detect GPU SKU from an artifact name and return its TDP in watts.
 * Artifact names look like: gpu_metrics_dsr1_1k8k_fp8_sglang_tp8_..._h200-nb_0
 */
export function detectTdpFromArtifactName(
  artifactName: string,
): { sku: string; tdp: number } | null {
  const lower = artifactName.toLowerCase();
  // Check longer names first to avoid partial matches (e.g., gb200 before b200)
  const orderedSkus = Object.keys(GPU_TDP_MAP).sort((a, b) => b.length - a.length);
  for (const sku of orderedSkus) {
    if (lower.includes(sku)) {
      return { sku: sku.toUpperCase(), tdp: GPU_TDP_MAP[sku] };
    }
  }
  return null;
}

export interface Anomaly {
  type: 'statistical' | 'thermal' | 'near_tdp' | 'clock_drop' | 'util_drop';
  label: string;
  gpuIndex: number;
  seconds: number;
  value: number;
  message: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseTimestampToMs(raw: string): number | null {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.getTime();
  const n = parseFloat(raw);
  if (!isNaN(n)) return n < 1e12 ? n * 1000 : n;
  return null;
}

/**
 * Detect anomalies in GPU metrics data using MAD-based Modified Z-score
 * (per NIST/Iglewicz & Hoaglin, threshold 3.5) plus domain-specific GPU thresholds.
 */
export function detectAnomalies(
  data: GpuMetricRow[],
  metricKey: GpuMetricKey,
  artifactName?: string,
): Anomaly[] {
  if (data.length === 0) return [];

  const anomalies: Anomaly[] = [];
  const tdpInfo = artifactName ? detectTdpFromArtifactName(artifactName) : null;

  // Find earliest timestamp for seconds calculation
  let minTime = Infinity;
  for (const row of data) {
    const ms = parseTimestampToMs(row.timestamp);
    if (ms !== null && ms < minTime) minTime = ms;
  }

  // Group by GPU index
  const gpuGroups = new Map<number, GpuMetricRow[]>();
  for (const row of data) {
    if (!gpuGroups.has(row.index)) gpuGroups.set(row.index, []);
    gpuGroups.get(row.index)!.push(row);
  }

  for (const [gpuIndex, rows] of gpuGroups) {
    const rawValues = rows.map((r) => r[metricKey]);
    // Skip if any values are undefined (metric not available for this vendor)
    if (rawValues.some((v) => v === undefined)) continue;
    const values = rawValues as number[];
    if (values.length < 3) continue;

    // MAD-based Modified Z-score detection
    const med = median(values);
    const absDeviations = values.map((v) => Math.abs(v - med));
    const mad = median(absDeviations);

    // Pre-compute SM clock median for clock_drop detection (avoid O(n^2))
    const smMedian =
      metricKey === 'smClock' || metricKey === 'power' ? median(rows.map((r) => r.smClock)) : 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ms = parseTimestampToMs(row.timestamp);
      const seconds = ms !== null ? (ms - minTime) / 1000 : i;

      // Statistical outlier (MAD)
      if (mad > 0) {
        const modifiedZ = (0.6745 * (values[i] - med)) / mad;
        if (Math.abs(modifiedZ) > 3.5) {
          anomalies.push({
            type: 'statistical',
            label: 'Statistical Outlier',
            gpuIndex,
            seconds,
            value: values[i],
            message: `GPU ${gpuIndex} at ${seconds.toFixed(0)}s: ${metricKey} = ${values[i].toFixed(1)} (Modified Z = ${modifiedZ.toFixed(1)}, median = ${med.toFixed(1)})`,
          });
        }
      }

      // Domain-specific: thermal throttle (temperature > 83°C)
      if (row.temperature > 83) {
        anomalies.push({
          type: 'thermal',
          label: 'Thermal Throttle',
          gpuIndex,
          seconds,
          value: row.temperature,
          message: `GPU ${gpuIndex} at ${seconds.toFixed(0)}s: temperature ${row.temperature}°C exceeds throttle threshold (83°C)`,
        });
      }

      // Domain-specific: near TDP (power > 90% of TDP)
      if (tdpInfo && row.power > tdpInfo.tdp * 0.9) {
        anomalies.push({
          type: 'near_tdp',
          label: 'Near TDP',
          gpuIndex,
          seconds,
          value: row.power,
          message: `GPU ${gpuIndex} at ${seconds.toFixed(0)}s: power ${row.power.toFixed(1)}W is ${((row.power / tdpInfo.tdp) * 100).toFixed(0)}% of TDP (${tdpInfo.tdp}W)`,
        });
      }

      // Domain-specific: clock drop (SM clock > 30% below median)
      if (
        (metricKey === 'smClock' || metricKey === 'power') &&
        smMedian > 0 &&
        row.smClock < smMedian * 0.7
      ) {
        anomalies.push({
          type: 'clock_drop',
          label: 'Clock Drop',
          gpuIndex,
          seconds,
          value: row.smClock,
          message: `GPU ${gpuIndex} at ${seconds.toFixed(0)}s: SM clock ${row.smClock} MHz dropped ${((1 - row.smClock / smMedian) * 100).toFixed(0)}% below median (${smMedian.toFixed(0)} MHz)`,
        });
      }

      // Domain-specific: utilization drop (GPU util = 0 after being > 50%)
      if (row.gpuUtil === 0 && i > 0 && rows[i - 1].gpuUtil > 50) {
        anomalies.push({
          type: 'util_drop',
          label: 'Utilization Drop',
          gpuIndex,
          seconds,
          value: 0,
          message: `GPU ${gpuIndex} at ${seconds.toFixed(0)}s: utilization dropped to 0% (was ${rows[i - 1].gpuUtil}%)`,
        });
      }
    }
  }

  // Deduplicate: keep only one anomaly per (type, gpuIndex, second)
  const seen = new Set<string>();
  const deduped = anomalies.filter((a) => {
    const key = `${a.type}_${a.gpuIndex}_${Math.round(a.seconds)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Split a CSV line respecting double-quoted fields (which may contain commas).
 * Required for AMD amd-smi CSV where array fields like "['N/A', 'N/A']" are quoted.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Build a column-index lookup from a CSV header line.
 * Returns a map of header name → column index.
 */
function buildColumnMap(headerLine: string): Map<string, number> {
  const headers = splitCsvLine(headerLine);
  const map = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    map.set(headers[i].toLowerCase(), i);
  }
  return map;
}

/**
 * Parse NVIDIA nvidia-smi CSV format.
 * Columns: timestamp, index, power.draw [W], temperature.gpu,
 * clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]
 */
function parseNvidiaCsv(lines: string[]): GpuMetricRow[] {
  const results: GpuMetricRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 8) continue;

    const index = parseInt(cols[1], 10);
    const power = parseFloat(cols[2]);
    const temperature = parseFloat(cols[3]);
    const smClock = parseFloat(cols[4]);
    const memClock = parseFloat(cols[5]);
    const gpuUtil = parseFloat(cols[6]);
    const memUtil = parseFloat(cols[7]);

    if ([index, power, temperature, smClock, memClock, gpuUtil, memUtil].some(isNaN)) continue;

    results.push({
      timestamp: cols[0],
      index,
      power,
      temperature,
      smClock,
      memClock,
      gpuUtil,
      memUtil,
    });
  }
  return results;
}

/** Safely parse a float, returning undefined for N/A or unparseable values. */
function safeFloat(val: string | undefined): number | undefined {
  if (val === undefined || val === 'N/A' || val === '') return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
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
    if (cols.length < 3) continue;

    const index = parseInt(cols[iGpu], 10);
    const power = parseFloat(cols[iPower]);
    // Prefer hotspot temp, fall back to edge
    let temperature = iHotspot >= 0 ? parseFloat(cols[iHotspot]) : NaN;
    if (isNaN(temperature) && iEdge >= 0) temperature = parseFloat(cols[iEdge]);
    const smClock = iGfxClk >= 0 ? parseFloat(cols[iGfxClk]) : 0;
    const memClock = iMemClk >= 0 ? parseFloat(cols[iMemClk]) : 0;
    const gpuUtil = iGfxActivity >= 0 ? parseFloat(cols[iGfxActivity]) : 0;
    const memUtil = iUmcActivity >= 0 ? parseFloat(cols[iUmcActivity]) : 0;

    if (isNaN(index) || isNaN(power)) continue;
    if (isNaN(temperature)) temperature = 0;

    // AMD timestamps are Unix epoch seconds — convert to ms-based string for consistency
    const rawTimestamp = cols[iTimestamp];
    const epochSec = parseFloat(rawTimestamp);
    const timestamp =
      !isNaN(epochSec) && epochSec > 1e9 && epochSec < 1e11
        ? new Date(epochSec * 1000).toISOString()
        : rawTimestamp;

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
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const headerLower = lines[0].toLowerCase();

  // Detect AMD format by checking for amd-smi specific columns
  if (headerLower.includes('socket_power') || headerLower.includes('gfx_activity')) {
    const colMap = buildColumnMap(lines[0]);
    return parseAmdCsv(lines, colMap);
  }

  return parseNvidiaCsv(lines);
}

// --- Statistics ---

export interface GpuStats {
  gpuIndex: number;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
}

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
    if (val === undefined) continue;
    if (!groups.has(row.index)) groups.set(row.index, []);
    groups.get(row.index)!.push(val);
  }

  const result: GpuStats[] = [];
  for (const [gpuIndex, values] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    result.push({
      gpuIndex,
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      stddev: Math.sqrt(variance),
    });
  }
  return result;
}
