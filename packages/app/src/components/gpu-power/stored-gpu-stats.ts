import type { GpuMetricStatRow } from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import type { GpuMetricKey, GpuStats } from './types';

const STORED_METRIC: Record<GpuMetricKey, string> = {
  power: 'power_w',
  temperature: 'temperature_c',
  smClock: 'sm_clock_mhz',
  memClock: 'mem_clock_mhz',
  gpuUtil: 'gpu_util_pct',
  memUtil: 'mem_util_pct',
  edgeTemp: 'edge_temp_c',
  memTemp: 'mem_temp_c',
  gfxVoltage: 'gfx_voltage_mv',
  socVoltage: 'soc_voltage_mv',
  memVoltage: 'mem_voltage_mv',
  fclk: 'fclk_mhz',
  socClk: 'socclk_mhz',
  mmActivity: 'mm_activity_pct',
};

/** Full-record statistics, including startup/warmup; never a measured-window summary. */
export function storedGpuStatsForMetric(
  stats: readonly GpuMetricStatRow[],
  metricKey: GpuMetricKey,
): GpuStats[] {
  return stats.filter((row) => row.metric === STORED_METRIC[metricKey]);
}
