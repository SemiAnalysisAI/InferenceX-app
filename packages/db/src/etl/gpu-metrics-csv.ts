/**
 * Parser and digest for the producer's `gpu_metrics.csv` telemetry.
 *
 * The InferenceX runner samples `nvidia-smi --query-gpu=…` or `amd-smi metric
 * --csv` once per second for the lifetime of a benchmark job. This module is
 * pure (no I/O) so the CI ingest, the historical backfill, and the app's
 * GitHub fallback path all normalize the two vendor formats identically.
 */

export type GpuMetricsVendor = 'nvidia' | 'amd';

export interface GpuMetricSample {
  /** Sample instant in epoch milliseconds (UTC). */
  timestampMs: number;
  gpuIndex: number;
  powerW: number | null;
  temperatureC: number | null;
  smClockMhz: number | null;
  memClockMhz: number | null;
  gpuUtilPct: number | null;
  memUtilPct: number | null;
  edgeTempC: number | null;
  memTempC: number | null;
  gfxVoltageMv: number | null;
  socVoltageMv: number | null;
  memVoltageMv: number | null;
  fclkMhz: number | null;
  socclkMhz: number | null;
  mmActivityPct: number | null;
}

export interface ParsedGpuMetricsCsv {
  vendor: GpuMetricsVendor;
  samples: GpuMetricSample[];
}

/** Sample columns that participate in the per-GPU statistics digest. */
export const GPU_METRIC_STAT_KEYS = [
  'powerW',
  'temperatureC',
  'smClockMhz',
  'memClockMhz',
  'gpuUtilPct',
  'memUtilPct',
  'edgeTempC',
  'memTempC',
  'gfxVoltageMv',
  'socVoltageMv',
  'memVoltageMv',
  'fclkMhz',
  'socclkMhz',
  'mmActivityPct',
] as const;

export type GpuMetricStatKey = (typeof GPU_METRIC_STAT_KEYS)[number];

export interface GpuMetricStats {
  gpuIndex: number;
  metric: GpuMetricStatKey;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
}

export function splitCsvLine(line: string): string[] {
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

function buildColumnMap(headerLine: string): Map<string, number> {
  const headers = splitCsvLine(headerLine);
  const map = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) map.set(headers[i]!.toLowerCase(), i);
  return map;
}

/** `N/A`, empty, and unparseable cells become null; unit suffixes are ignored. */
export function parseMetricCell(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'N/A' || trimmed === '[N/A]') return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const NVIDIA_TIMESTAMP_RE =
  /^(?<y>\d{4})\/(?<mo>\d{2})\/(?<d>\d{2}) (?<h>\d{2}):(?<mi>\d{2}):(?<s>\d{2})(?:\.(?<ms>\d{1,3}))?$/u;

/**
 * nvidia-smi prints `YYYY/MM/DD HH:MM:SS.mmm` in the collector's local zone.
 * The producer runs its collectors with TZ=UTC; callers can pass a different
 * fixed offset (minutes east of UTC) when a context sidecar says otherwise.
 */
export function parseNvidiaTimestamp(raw: string, offsetMinutes = 0): number | null {
  const match = NVIDIA_TIMESTAMP_RE.exec(raw.trim());
  if (!match?.groups) return null;
  const { y, mo, d, h, mi, s, ms } = match.groups;
  const millis = ms ? Number(ms.padEnd(3, '0')) : 0;
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    millis,
  );
  return utc - offsetMinutes * 60_000;
}

/** amd-smi prints Unix epoch seconds; accept fractional and millisecond forms. */
export function parseAmdTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    const numeric = Number.parseFloat(trimmed);
    if (numeric > 1e12) return Math.round(numeric); // already milliseconds
    if (numeric > 1e9) return Math.round(numeric * 1000);
    return null;
  }
  const iso = Date.parse(trimmed);
  return Number.isFinite(iso) ? iso : null;
}

export function emptySample(timestampMs: number, gpuIndex: number): GpuMetricSample {
  return {
    timestampMs,
    gpuIndex,
    powerW: null,
    temperatureC: null,
    smClockMhz: null,
    memClockMhz: null,
    gpuUtilPct: null,
    memUtilPct: null,
    edgeTempC: null,
    memTempC: null,
    gfxVoltageMv: null,
    socVoltageMv: null,
    memVoltageMv: null,
    fclkMhz: null,
    socclkMhz: null,
    mmActivityPct: null,
  };
}

/**
 * Columns: timestamp, index, power.draw [W], temperature.gpu,
 * clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%],
 * utilization.memory [%]. Header order is fixed by NVIDIA_GPU_MONITOR_QUERY in
 * the producer, but we still resolve by name so a reordered query keeps working.
 */
function parseNvidiaCsv(lines: readonly string[], offsetMinutes: number): GpuMetricSample[] {
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s*\[.*\]$/u, ''));
  const col = (name: string) => header.indexOf(name);
  const iTimestamp = col('timestamp');
  const iIndex = col('index');
  const iPower = col('power.draw');
  const iTemp = col('temperature.gpu');
  const iSm = col('clocks.current.sm');
  const iMem = col('clocks.current.memory');
  const iUtil = col('utilization.gpu');
  const iMemUtil = col('utilization.memory');
  if (iTimestamp < 0 || iIndex < 0 || iPower < 0) return [];

  const samples: GpuMetricSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    if (cols.length <= Math.max(iTimestamp, iIndex, iPower)) continue;
    const timestampMs = parseNvidiaTimestamp(cols[iTimestamp]!, offsetMinutes);
    const gpuIndex = Number.parseInt(cols[iIndex]!, 10);
    if (timestampMs === null || !Number.isInteger(gpuIndex) || gpuIndex < 0) continue;
    const sample = emptySample(timestampMs, gpuIndex);
    sample.powerW = parseMetricCell(cols[iPower]);
    if (sample.powerW === null) continue;
    sample.temperatureC = iTemp >= 0 ? parseMetricCell(cols[iTemp]) : null;
    sample.smClockMhz = iSm >= 0 ? parseMetricCell(cols[iSm]) : null;
    sample.memClockMhz = iMem >= 0 ? parseMetricCell(cols[iMem]) : null;
    sample.gpuUtilPct = iUtil >= 0 ? parseMetricCell(cols[iUtil]) : null;
    sample.memUtilPct = iMemUtil >= 0 ? parseMetricCell(cols[iMemUtil]) : null;
    samples.push(sample);
  }
  return samples;
}

/**
 * amd-smi `metric --csv` is a wide table. The consumed subset mirrors the
 * dashboard: socket_power, gfx_activity, umc_activity, mm_activity, the first
 * gfx/mem/fclk/socclk clock domains, hotspot/edge/mem temperatures and the
 * three voltage rails.
 */
function parseAmdCsv(lines: readonly string[]): GpuMetricSample[] {
  const colMap = buildColumnMap(lines[0]!);
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

  const samples: GpuMetricSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    if (cols.length <= Math.max(iTimestamp, iGpu, iPower)) continue;
    const timestampMs = parseAmdTimestamp(cols[iTimestamp]!);
    const gpuIndex = Number.parseInt(cols[iGpu]!, 10);
    if (timestampMs === null || !Number.isInteger(gpuIndex) || gpuIndex < 0) continue;
    const sample = emptySample(timestampMs, gpuIndex);
    sample.powerW = parseMetricCell(cols[iPower]);
    if (sample.powerW === null) continue;
    const hotspot = iHotspot >= 0 ? parseMetricCell(cols[iHotspot]) : null;
    const edge = iEdge >= 0 ? parseMetricCell(cols[iEdge]) : null;
    sample.temperatureC = hotspot ?? edge;
    sample.edgeTempC = edge;
    sample.memTempC = iMemTemp >= 0 ? parseMetricCell(cols[iMemTemp]) : null;
    sample.smClockMhz = iGfxClk >= 0 ? parseMetricCell(cols[iGfxClk]) : null;
    sample.memClockMhz = iMemClk >= 0 ? parseMetricCell(cols[iMemClk]) : null;
    sample.gpuUtilPct = iGfxActivity >= 0 ? parseMetricCell(cols[iGfxActivity]) : null;
    sample.memUtilPct = iUmcActivity >= 0 ? parseMetricCell(cols[iUmcActivity]) : null;
    sample.gfxVoltageMv = iGfxVoltage >= 0 ? parseMetricCell(cols[iGfxVoltage]) : null;
    sample.socVoltageMv = iSocVoltage >= 0 ? parseMetricCell(cols[iSocVoltage]) : null;
    sample.memVoltageMv = iMemVoltage >= 0 ? parseMetricCell(cols[iMemVoltage]) : null;
    sample.fclkMhz = iFclk >= 0 ? parseMetricCell(cols[iFclk]) : null;
    sample.socclkMhz = iSocClk >= 0 ? parseMetricCell(cols[iSocClk]) : null;
    sample.mmActivityPct = iMmActivity >= 0 ? parseMetricCell(cols[iMmActivity]) : null;
    samples.push(sample);
  }
  return samples;
}

export interface ParseGpuMetricsOptions {
  /** Fixed offset of the NVIDIA collector clock, minutes east of UTC. */
  nvidiaUtcOffsetMinutes?: number;
}

/**
 * Parse one gpu_metrics CSV, auto-detecting the vendor from the header.
 * Samples are returned in file order; callers sort per GPU as needed.
 */
export function parseGpuMetricsCsv(
  csvText: string,
  options: ParseGpuMetricsOptions = {},
): ParsedGpuMetricsCsv | null {
  const lines = csvText
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return null;
  const headerLower = lines[0]!.toLowerCase();
  if (headerLower.includes('socket_power') || headerLower.includes('gfx_activity')) {
    return { vendor: 'amd', samples: parseAmdCsv(lines) };
  }
  if (headerLower.includes('power.draw')) {
    return {
      vendor: 'nvidia',
      samples: parseNvidiaCsv(lines, options.nvidiaUtcOffsetMinutes ?? 0),
    };
  }
  return null;
}

function percentile(sorted: readonly number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** Per-GPU, per-metric summary over every non-null sample. */
export function computeGpuMetricStats(samples: readonly GpuMetricSample[]): GpuMetricStats[] {
  const groups = new Map<
    string,
    { gpuIndex: number; metric: GpuMetricStatKey; values: number[] }
  >();
  for (const sample of samples) {
    for (const metric of GPU_METRIC_STAT_KEYS) {
      const value = sample[metric];
      if (value === null) continue;
      const key = `${sample.gpuIndex}|${metric}`;
      let group = groups.get(key);
      if (!group) {
        group = { gpuIndex: sample.gpuIndex, metric, values: [] };
        groups.set(key, group);
      }
      group.values.push(value);
    }
  }

  const stats: GpuMetricStats[] = [];
  for (const group of groups.values()) {
    const sorted = group.values.toSorted((a, b) => a - b);
    const mean = sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
    const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
    stats.push({
      gpuIndex: group.gpuIndex,
      metric: group.metric,
      count: sorted.length,
      min: sorted[0]!,
      max: sorted.at(-1)!,
      mean,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      stddev: Math.sqrt(variance),
    });
  }
  return stats.toSorted((a, b) => a.gpuIndex - b.gpuIndex || a.metric.localeCompare(b.metric));
}

export interface GpuMetricSeriesSummary {
  sampleCount: number;
  gpuCount: number;
  startedAtMs: number;
  endedAtMs: number;
  /** Median gap between consecutive samples of one GPU, in seconds. */
  sampleIntervalS: number | null;
}

/** Window and cadence facts stored on the series row. */
export function summarizeGpuMetricSamples(
  samples: readonly GpuMetricSample[],
): GpuMetricSeriesSummary | null {
  if (samples.length === 0) return null;
  let startedAtMs = Number.POSITIVE_INFINITY;
  let endedAtMs = Number.NEGATIVE_INFINITY;
  const byGpu = new Map<number, number[]>();
  for (const sample of samples) {
    if (sample.timestampMs < startedAtMs) startedAtMs = sample.timestampMs;
    if (sample.timestampMs > endedAtMs) endedAtMs = sample.timestampMs;
    const bucket = byGpu.get(sample.gpuIndex);
    if (bucket) bucket.push(sample.timestampMs);
    else byGpu.set(sample.gpuIndex, [sample.timestampMs]);
  }
  const gaps: number[] = [];
  for (const timestamps of byGpu.values()) {
    const sorted = timestamps.toSorted((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! - sorted[i - 1]!;
      if (gap > 0) gaps.push(gap);
    }
  }
  const sampleIntervalS =
    gaps.length > 0
      ? percentile(
          gaps.toSorted((a, b) => a - b),
          50,
        ) / 1000
      : null;
  return {
    sampleCount: samples.length,
    gpuCount: byGpu.size,
    startedAtMs,
    endedAtMs,
    sampleIntervalS,
  };
}
