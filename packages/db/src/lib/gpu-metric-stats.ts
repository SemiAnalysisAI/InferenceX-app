import {
  computeGpuMetricStats,
  type GpuMetricSample,
  type GpuMetricStats,
} from '../etl/gpu-metrics-csv.js';

/** Bump whenever full-record digest definitions change. Independent of serving-window metrics. */
export const GPU_STATS_VERSION = 1;

export const STAT_METRIC_COLUMN = {
  powerW: 'power_w',
  temperatureC: 'temperature_c',
  smClockMhz: 'sm_clock_mhz',
  memClockMhz: 'mem_clock_mhz',
  gpuUtilPct: 'gpu_util_pct',
  memUtilPct: 'mem_util_pct',
  edgeTempC: 'edge_temp_c',
  memTempC: 'mem_temp_c',
  gfxVoltageMv: 'gfx_voltage_mv',
  socVoltageMv: 'soc_voltage_mv',
  memVoltageMv: 'mem_voltage_mv',
  fclkMhz: 'fclk_mhz',
  socclkMhz: 'socclk_mhz',
  mmActivityPct: 'mm_activity_pct',
} as const satisfies Record<GpuMetricStats['metric'], string>;

/** Stored metric names use the column spelling so SQL readers need no mapping. */
export function statMetricColumn(metric: GpuMetricStats['metric']): string {
  return STAT_METRIC_COLUMN[metric];
}

export type StoredGpuMetricSample = {
  gpu_index: number;
  sampled_at: string | Date;
} & Record<(typeof STAT_METRIC_COLUMN)[keyof typeof STAT_METRIC_COLUMN], number | null>;

/** Preserve nulls: chart adapters intentionally zero-fill power, digest inputs must not. */
export function computeStoredGpuMetricStats(
  rows: readonly StoredGpuMetricSample[],
): GpuMetricStats[] {
  return computeGpuMetricStats(
    rows.map((row): GpuMetricSample => ({
      timestampMs: new Date(row.sampled_at).getTime(),
      gpuIndex: Number(row.gpu_index),
      powerW: row.power_w,
      temperatureC: row.temperature_c,
      smClockMhz: row.sm_clock_mhz,
      memClockMhz: row.mem_clock_mhz,
      gpuUtilPct: row.gpu_util_pct,
      memUtilPct: row.mem_util_pct,
      edgeTempC: row.edge_temp_c,
      memTempC: row.mem_temp_c,
      gfxVoltageMv: row.gfx_voltage_mv,
      socVoltageMv: row.soc_voltage_mv,
      memVoltageMv: row.mem_voltage_mv,
      fclkMhz: row.fclk_mhz,
      socclkMhz: row.socclk_mhz,
      mmActivityPct: row.mm_activity_pct,
    })),
  );
}
