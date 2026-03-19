import { describe, expect, it } from 'vitest';

import {
  computeGpuStats,
  detectAnomalies,
  detectTdpFromArtifactName,
  getAvailableMetrics,
  type GpuMetricRow,
  GPU_METRIC_OPTIONS,
  parseCsvData,
} from './types';

const CSV_HEADER =
  'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]';

// ---------------------------------------------------------------------------
// parseCsvData
// ---------------------------------------------------------------------------

describe('parseCsvData', () => {
  it('parses real nvidia-smi CSV format with unit suffixes', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, 0, 76.78 W, 30, 345 MHz, 3201 MHz, 0 %, 0 %
2026/03/07 00:20:37.071, 1, 76.08 W, 29, 345 MHz, 3201 MHz, 0 %, 0 %`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[0].power).toBe(76.78);
    expect(result[0].temperature).toBe(30);
    expect(result[0].smClock).toBe(345);
    expect(result[0].memClock).toBe(3201);
    expect(result[0].gpuUtil).toBe(0);
    expect(result[0].memUtil).toBe(0);
    expect(result[0].timestamp).toBe('2026/03/07 00:20:37.071');
    expect(result[1].index).toBe(1);
    expect(result[1].power).toBe(76.08);
  });

  it('parses CSV with bare numeric values (no unit suffixes)', () => {
    const csv = `${CSV_HEADER}
2024-01-15T10:00:00Z, 0, 250.5, 72, 1980, 1593, 95, 80
2024-01-15T10:00:00Z, 1, 300.2, 68, 1950, 1593, 88, 75`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(2);
    expect(result[0].power).toBe(250.5);
    expect(result[0].smClock).toBe(1980);
    expect(result[1].power).toBe(300.2);
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvData(CSV_HEADER)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCsvData('')).toEqual([]);
  });

  it('skips rows with insufficient columns', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, 0, 76.78 W
2026/03/07 00:20:37.071, 1, 76.08 W, 29, 345 MHz, 3201 MHz, 0 %, 0 %`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
  });

  it('skips rows with NaN values', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, abc, 76.78 W, 30, 345 MHz, 3201 MHz, 0 %, 0 %`;
    expect(parseCsvData(csv)).toEqual([]);
  });

  it('trims whitespace from values', () => {
    const csv = `${CSV_HEADER}
 2026/03/07 00:20:37.071 , 0 , 76.78 W , 30 , 345 MHz , 3201 MHz , 0 % , 0 % `;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('2026/03/07 00:20:37.071');
    expect(result[0].power).toBe(76.78);
  });

  it('handles Windows-style line endings', () => {
    const csv = `${CSV_HEADER}\r\n2026/03/07 00:20:37.071, 0, 76.78 W, 30, 345 MHz, 3201 MHz, 0 %, 0 %\r\n`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].power).toBe(76.78);
  });

  it('parses multiple timestamps for same GPU correctly', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, 0, 76.78 W, 30, 345 MHz, 3201 MHz, 0 %, 0 %
2026/03/07 00:20:38.076, 0, 76.70 W, 30, 345 MHz, 3201 MHz, 0 %, 0 %
2026/03/07 00:20:39.076, 0, 80.49 W, 31, 345 MHz, 3201 MHz, 0 %, 0 %`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(3);
    expect(result[0].power).toBe(76.78);
    expect(result[1].power).toBe(76.7);
    expect(result[2].power).toBe(80.49);
    expect(result[2].temperature).toBe(31);
  });

  it('ignores extra columns beyond the expected 8', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, 0, 76.78, 30, 345, 3201, 0, 0, extra1, extra2`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].power).toBe(76.78);
    expect(result[0].memUtil).toBe(0);
  });

  it('handles 8-GPU real-world scenario', () => {
    const lines = [];
    for (let gpu = 0; gpu < 8; gpu++) {
      lines.push(
        `2026/03/07 00:20:37.071, ${gpu}, ${300 + gpu * 10}, ${65 + gpu}, 1980, 1593, 95, 80`,
      );
    }
    const csv = `${CSV_HEADER}\n${lines.join('\n')}`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(8);
    expect(result[7].index).toBe(7);
    expect(result[7].power).toBe(370);
    expect(result[7].temperature).toBe(72);
  });

  // --- AMD amd-smi format ---

  it('auto-detects and parses AMD amd-smi CSV format', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_0_clk,gfx_0_min_clk,gfx_0_max_clk,mem_0_clk,mem_0_min_clk,mem_0_max_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,95,80,N/A,350,1980,500,2100,901,900,1500,38,72,65
1772939616,1,88,75,N/A,300,1950,500,2100,901,900,1500,36,68,62`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[0].power).toBe(350);
    expect(result[0].temperature).toBe(72); // hotspot
    expect(result[0].smClock).toBe(1980);
    expect(result[0].memClock).toBe(901);
    expect(result[0].gpuUtil).toBe(95);
    expect(result[0].memUtil).toBe(80);
    expect(result[1].index).toBe(1);
    expect(result[1].power).toBe(300);
    expect(result[1].temperature).toBe(68);
  });

  it('AMD: converts Unix epoch timestamps to ISO strings', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,0,0,135,133,901,N/A,40,41`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    // Unix epoch 1772939616 → ISO string
    expect(result[0].timestamp).toContain('2026');
    expect(new Date(result[0].timestamp).getTime()).toBe(1772939616 * 1000);
  });

  it('AMD: falls back to edge temperature when hotspot is N/A', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,0,0,135,133,901,38,N/A,41`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].temperature).toBe(38); // falls back to edge
  });

  it('AMD: handles quoted array fields with embedded commas', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,vcn_activity,jpeg_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,95,80,N/A,"['N/A', 'N/A', 'N/A', 'N/A']","['N/A', 'N/A']",350,1980,901,38,72,65`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].power).toBe(350);
    expect(result[0].smClock).toBe(1980);
    expect(result[0].temperature).toBe(72);
  });

  it('AMD: parses real-world amd-smi row with all columns', () => {
    // Full amd-smi header with ~100+ columns
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,vcn_activity,jpeg_activity,gfx_busy_inst_xcp_0,jpeg_busy_xcp_0,vcn_busy_xcp_0,socket_power,gfx_voltage,soc_voltage,mem_voltage,throttle_status,power_management,gfx_0_clk,gfx_0_min_clk,gfx_0_max_clk,gfx_0_clk_locked,gfx_0_deep_sleep,gfx_1_clk,gfx_1_min_clk,gfx_1_max_clk,gfx_1_clk_locked,gfx_1_deep_sleep,gfx_2_clk,gfx_2_min_clk,gfx_2_max_clk,gfx_2_clk_locked,gfx_2_deep_sleep,gfx_3_clk,gfx_3_min_clk,gfx_3_max_clk,gfx_3_clk_locked,gfx_3_deep_sleep,gfx_4_clk,gfx_4_min_clk,gfx_4_max_clk,gfx_4_clk_locked,gfx_4_deep_sleep,gfx_5_clk,gfx_5_min_clk,gfx_5_max_clk,gfx_5_clk_locked,gfx_5_deep_sleep,gfx_6_clk,gfx_6_min_clk,gfx_6_max_clk,gfx_6_clk_locked,gfx_6_deep_sleep,gfx_7_clk,gfx_7_min_clk,gfx_7_max_clk,gfx_7_clk_locked,gfx_7_deep_sleep,mem_0_clk,mem_0_min_clk,mem_0_max_clk,mem_0_clk_locked,mem_0_deep_sleep,vclk_0_clk,vclk_0_min_clk,vclk_0_max_clk,vclk_0_clk_locked,vclk_0_deep_sleep,vclk_1_clk,vclk_1_min_clk,vclk_1_max_clk,vclk_1_clk_locked,vclk_1_deep_sleep,vclk_2_clk,vclk_2_min_clk,vclk_2_max_clk,vclk_2_clk_locked,vclk_2_deep_sleep,vclk_3_clk,vclk_3_min_clk,vclk_3_max_clk,vclk_3_clk_locked,vclk_3_deep_sleep,dclk_0_clk,dclk_0_min_clk,dclk_0_max_clk,dclk_0_clk_locked,dclk_0_deep_sleep,dclk_1_clk,dclk_1_min_clk,dclk_1_max_clk,dclk_1_clk_locked,dclk_1_deep_sleep,dclk_2_clk,dclk_2_min_clk,dclk_2_max_clk,dclk_2_clk_locked,dclk_2_deep_sleep,dclk_3_clk,dclk_3_min_clk,dclk_3_max_clk,dclk_3_clk_locked,dclk_3_deep_sleep,fclk_0_clk,fclk_0_min_clk,fclk_0_max_clk,fclk_0_clk_locked,fclk_0_deep_sleep,socclk_0_clk,socclk_0_min_clk,socclk_0_max_clk,socclk_0_clk_locked,socclk_0_deep_sleep,edge,hotspot,mem';
    const row = `1772939616,0,0,0,N/A,"['N/A', 'N/A', 'N/A', 'N/A']","['N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']","[0, 0, 0, 0, 0, 0, 0, 0]","[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A']","[0, 0, 0, 0]",135,N/A,N/A,N/A,N/A,ENABLED,133,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,133,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,132,500,2100,DISABLED,ENABLED,901,900,1500,N/A,DISABLED,29,914,1680,N/A,ENABLED,29,914,1680,N/A,ENABLED,29,914,1680,N/A,ENABLED,29,914,1680,N/A,ENABLED,22,711,1400,N/A,ENABLED,22,711,1400,N/A,ENABLED,22,711,1400,N/A,ENABLED,22,711,1400,N/A,ENABLED,1300,1300,1800,N/A,DISABLED,28,889,1143,N/A,ENABLED,N/A,40,41`;
    const csv = `${amdHeader}\n${row}`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(0);
    expect(result[0].power).toBe(135);
    expect(result[0].smClock).toBe(133);
    expect(result[0].memClock).toBe(901);
    expect(result[0].gpuUtil).toBe(0);
    expect(result[0].memUtil).toBe(0);
    expect(result[0].temperature).toBe(40); // hotspot
  });

  it('AMD: parses 8 GPUs from same timestamp', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const lines = [];
    for (let gpu = 0; gpu < 8; gpu++) {
      lines.push(
        `1772939616,${gpu},${90 + gpu},${70 + gpu},${300 + gpu * 5},${1900 + gpu * 10},901,${35 + gpu},${60 + gpu},${50 + gpu}`,
      );
    }
    const csv = `${amdHeader}\n${lines.join('\n')}`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(8);
    expect(result[0].index).toBe(0);
    expect(result[7].index).toBe(7);
    expect(result[7].power).toBe(335);
    expect(result[7].gpuUtil).toBe(97);
    expect(result[7].temperature).toBe(67); // hotspot
    expect(result[7].smClock).toBe(1970);
  });

  it('AMD: skips rows with N/A power', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,0,0,N/A,133,901,N/A,40,41
1772939616,1,0,0,135,133,901,N/A,44,43`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
  });

  it('AMD: handles temperature when both hotspot and edge are N/A', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,socket_power,gfx_0_clk,mem_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,0,0,135,133,901,N/A,N/A,41`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].temperature).toBe(0); // defaults to 0 when both are N/A
  });

  it('AMD: populates all AMD-specific metric fields', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_voltage,soc_voltage,mem_voltage,gfx_0_clk,mem_0_clk,fclk_0_clk,socclk_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,95,80,12,350,850,920,1200,1980,901,1300,1143,38,72,65`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].edgeTemp).toBe(38);
    expect(result[0].memTemp).toBe(65);
    expect(result[0].gfxVoltage).toBe(850);
    expect(result[0].socVoltage).toBe(920);
    expect(result[0].memVoltage).toBe(1200);
    expect(result[0].fclk).toBe(1300);
    expect(result[0].socClk).toBe(1143);
    expect(result[0].mmActivity).toBe(12);
  });

  it('AMD: sets AMD-specific fields to undefined when N/A', () => {
    const amdHeader =
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_voltage,soc_voltage,mem_voltage,gfx_0_clk,mem_0_clk,fclk_0_clk,socclk_0_clk,edge,hotspot,mem';
    const csv = `${amdHeader}
1772939616,0,0,0,N/A,135,N/A,N/A,N/A,133,901,1300,28,N/A,40,41`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].gfxVoltage).toBeUndefined();
    expect(result[0].socVoltage).toBeUndefined();
    expect(result[0].memVoltage).toBeUndefined();
    expect(result[0].mmActivity).toBeUndefined();
    expect(result[0].fclk).toBe(1300);
    expect(result[0].socClk).toBe(28);
  });

  it('NVIDIA: does not have AMD-specific fields', () => {
    const csv = `${CSV_HEADER}
2026/03/07 00:20:37.071, 0, 300, 65, 1980, 1593, 95, 80`;
    const result = parseCsvData(csv);
    expect(result).toHaveLength(1);
    expect(result[0].edgeTemp).toBeUndefined();
    expect(result[0].memTemp).toBeUndefined();
    expect(result[0].gfxVoltage).toBeUndefined();
    expect(result[0].fclk).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAvailableMetrics
// ---------------------------------------------------------------------------

describe('getAvailableMetrics', () => {
  it('returns only common metrics for NVIDIA data', () => {
    const nvidiaRow: GpuMetricRow = {
      timestamp: '2026/03/07 00:20:37.071',
      index: 0,
      power: 300,
      temperature: 65,
      smClock: 1980,
      memClock: 1593,
      gpuUtil: 95,
      memUtil: 80,
    };
    const metrics = getAvailableMetrics([nvidiaRow]);
    const keys = metrics.map((m) => m.key);
    expect(keys).toEqual(['power', 'temperature', 'smClock', 'memClock', 'gpuUtil', 'memUtil']);
  });

  it('returns common + AMD metrics for AMD data', () => {
    const amdRow: GpuMetricRow = {
      timestamp: '2026-03-07T00:00:00Z',
      index: 0,
      power: 350,
      temperature: 72,
      smClock: 1980,
      memClock: 901,
      gpuUtil: 95,
      memUtil: 80,
      edgeTemp: 38,
      memTemp: 65,
      gfxVoltage: 850,
      socVoltage: 920,
      memVoltage: 1200,
      fclk: 1300,
      socClk: 1143,
      mmActivity: 12,
    };
    const metrics = getAvailableMetrics([amdRow]);
    const keys = metrics.map((m) => m.key);
    expect(keys).toContain('edgeTemp');
    expect(keys).toContain('memTemp');
    expect(keys).toContain('gfxVoltage');
    expect(keys).toContain('fclk');
    expect(keys).toContain('socClk');
    expect(keys).toContain('mmActivity');
    expect(keys.length).toBe(14); // 6 common + 8 AMD
  });

  it('excludes AMD metrics that are undefined even on AMD data', () => {
    const amdRow: GpuMetricRow = {
      timestamp: '2026-03-07T00:00:00Z',
      index: 0,
      power: 350,
      temperature: 72,
      smClock: 1980,
      memClock: 901,
      gpuUtil: 95,
      memUtil: 80,
      edgeTemp: 38,
      memTemp: 65,
      // voltages are N/A → undefined
    };
    const metrics = getAvailableMetrics([amdRow]);
    const keys = metrics.map((m) => m.key);
    expect(keys).toContain('edgeTemp');
    expect(keys).toContain('memTemp');
    expect(keys).not.toContain('gfxVoltage');
    expect(keys).not.toContain('fclk');
  });

  it('returns common metrics for empty data', () => {
    const metrics = getAvailableMetrics([]);
    expect(metrics.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// detectTdpFromArtifactName
// ---------------------------------------------------------------------------

describe('detectTdpFromArtifactName', () => {
  it('detects H200 from real artifact name', () => {
    const result = detectTdpFromArtifactName(
      'gpu_metrics_dsr1_1k8k_fp8_sglang_tp8-ep1-dpafalse_disagg_none_conc64_h200-nb_0',
    );
    expect(result).toEqual({ sku: 'H200', tdp: 700 });
  });

  it('detects H100 from artifact name', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp8_h100-sxm_0');
    expect(result).toEqual({ sku: 'H100', tdp: 700 });
  });

  it('detects GB200 without matching B200', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp4_gb200-nvl72_0');
    expect(result).toEqual({ sku: 'GB200', tdp: 1200 });
  });

  it('detects GB300 without matching B300', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp4_gb300-nvl72_0');
    expect(result).toEqual({ sku: 'GB300', tdp: 1400 });
  });

  it('detects B200 when no GB prefix', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp4_b200-sxm_0');
    expect(result).toEqual({ sku: 'B200', tdp: 1000 });
  });

  it('detects B300 when no GB prefix', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp4_b300-sxm_0');
    expect(result).toEqual({ sku: 'B300', tdp: 1200 });
  });

  it('detects MI300X from artifact name', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp8_mi300x_0');
    expect(result).toEqual({ sku: 'MI300X', tdp: 750 });
  });

  it('detects MI325X from artifact name', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp8_mi325x_0');
    expect(result).toEqual({ sku: 'MI325X', tdp: 1000 });
  });

  it('detects MI355X from artifact name', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp4_mi355x_0');
    expect(result).toEqual({ sku: 'MI355X', tdp: 1400 });
  });

  it('returns null for unrecognized GPU', () => {
    expect(detectTdpFromArtifactName('gpu_metrics_model_fp8_unknown_0')).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = detectTdpFromArtifactName('gpu_metrics_model_fp8_H200-SXM_0');
    expect(result).toEqual({ sku: 'H200', tdp: 700 });
  });
});

// ---------------------------------------------------------------------------
// helper
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<GpuMetricRow> & { timestamp: string; index: number },
): GpuMetricRow {
  return {
    power: 300,
    temperature: 65,
    smClock: 1980,
    memClock: 1593,
    gpuUtil: 95,
    memUtil: 80,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectAnomalies
// ---------------------------------------------------------------------------

describe('detectAnomalies', () => {
  it('returns empty array for empty data', () => {
    expect(detectAnomalies([], 'power')).toEqual([]);
  });

  it('detects statistical outliers via MAD', () => {
    const rows: GpuMetricRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(
        makeRow({
          timestamp: `2026/03/07 00:20:${37 + i}.000`,
          index: 0,
          power: i === 9 ? 600 : 300 + (i % 3),
        }),
      );
    }
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'statistical')).toBe(true);
    const stat = anomalies.find((a) => a.type === 'statistical')!;
    expect(stat.gpuIndex).toBe(0);
    expect(stat.value).toBe(600);
  });

  it('detects thermal throttle above 83°C', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, temperature: 65 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, temperature: 85 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, temperature: 70 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'thermal')).toBe(true);
    const thermal = anomalies.find((a) => a.type === 'thermal')!;
    expect(thermal.value).toBe(85);
  });

  it('detects near-TDP power draw', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 300 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, power: 650 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, power: 300 }),
    ];
    const anomalies = detectAnomalies(rows, 'power', 'gpu_metrics_h200_test');
    expect(anomalies.some((a) => a.type === 'near_tdp')).toBe(true);
  });

  it('does not flag near-TDP without artifact name', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 650 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, power: 650 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, power: 650 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'near_tdp')).toBe(false);
  });

  it('detects utilization drop to 0% after high usage', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, gpuUtil: 95 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, gpuUtil: 0 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, gpuUtil: 90 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'util_drop')).toBe(true);
  });

  it('does not flag all-identical values as anomalies', () => {
    const rows: GpuMetricRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(makeRow({ timestamp: `2026/03/07 00:20:${37 + i}.000`, index: 0, power: 300 }));
    }
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.filter((a) => a.type === 'statistical')).toHaveLength(0);
  });

  it('deduplicates anomalies at same second', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, temperature: 85 }),
      makeRow({ timestamp: '2026/03/07 00:20:37.500', index: 0, temperature: 86 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, temperature: 65 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    const thermals = anomalies.filter(
      (a) => a.type === 'thermal' && a.gpuIndex === 0 && Math.round(a.seconds) === 0,
    );
    expect(thermals).toHaveLength(1);
  });

  it('detects clock drop when SM clock drops >30% below median', () => {
    const rows: GpuMetricRow[] = [];
    // 9 rows at 1980 MHz, 1 row at 1000 MHz (49% drop)
    for (let i = 0; i < 10; i++) {
      rows.push(
        makeRow({
          timestamp: `2026/03/07 00:20:${37 + i}.000`,
          index: 0,
          smClock: i === 5 ? 1000 : 1980,
        }),
      );
    }
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'clock_drop')).toBe(true);
    const drop = anomalies.find((a) => a.type === 'clock_drop')!;
    expect(drop.value).toBe(1000);
  });

  it('detects anomalies independently per GPU', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, temperature: 85 }),
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 1, temperature: 85 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, temperature: 65 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 1, temperature: 65 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, temperature: 65 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 1, temperature: 65 }),
    ];
    const anomalies = detectAnomalies(rows, 'temperature');
    const thermals = anomalies.filter((a) => a.type === 'thermal');
    expect(thermals).toHaveLength(2);
    expect(thermals.map((a) => a.gpuIndex).sort()).toEqual([0, 1]);
  });

  it('skips GPU groups with fewer than 3 samples for MAD detection', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 100 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, power: 900 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    // Only 2 samples — MAD-based statistical detection should be skipped
    expect(anomalies.filter((a) => a.type === 'statistical')).toHaveLength(0);
  });

  it('anomaly message includes GPU index and metric value', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 2, temperature: 65 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 2, temperature: 90 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 2, temperature: 65 }),
    ];
    const anomalies = detectAnomalies(rows, 'temperature');
    const thermal = anomalies.find((a) => a.type === 'thermal')!;
    expect(thermal.message).toContain('GPU 2');
    expect(thermal.message).toContain('90');
    expect(thermal.message).toContain('83');
  });

  it('does not flag util_drop when previous utilization is <= 50%', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, gpuUtil: 40 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, gpuUtil: 0 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, gpuUtil: 50 }),
    ];
    const anomalies = detectAnomalies(rows, 'power');
    expect(anomalies.some((a) => a.type === 'util_drop')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeGpuStats
// ---------------------------------------------------------------------------

describe('computeGpuStats', () => {
  it('computes correct statistics for a single GPU', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 100 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, power: 200 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, power: 300 }),
      makeRow({ timestamp: '2026/03/07 00:20:40.000', index: 0, power: 400 }),
      makeRow({ timestamp: '2026/03/07 00:20:41.000', index: 0, power: 500 }),
    ];
    const stats = computeGpuStats(rows, 'power');
    expect(stats).toHaveLength(1);
    expect(stats[0].gpuIndex).toBe(0);
    expect(stats[0].count).toBe(5);
    expect(stats[0].min).toBe(100);
    expect(stats[0].max).toBe(500);
    expect(stats[0].mean).toBe(300);
    expect(stats[0].median).toBe(300);
  });

  it('returns stats per GPU sorted by index', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 1, power: 200 }),
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 100 }),
    ];
    const stats = computeGpuStats(rows, 'power');
    expect(stats).toHaveLength(2);
    expect(stats[0].gpuIndex).toBe(0);
    expect(stats[1].gpuIndex).toBe(1);
  });

  it('returns empty array for empty data', () => {
    expect(computeGpuStats([], 'power')).toEqual([]);
  });

  it('computes correct p95 and p99 for a uniform distribution', () => {
    // 100 values from 1 to 100
    const rows: GpuMetricRow[] = [];
    for (let i = 1; i <= 100; i++) {
      rows.push(makeRow({ timestamp: `2026/03/07 00:20:${i}.000`, index: 0, power: i }));
    }
    const stats = computeGpuStats(rows, 'power');
    expect(stats[0].p95).toBeCloseTo(95.05, 1);
    expect(stats[0].p99).toBeCloseTo(99.01, 1);
    expect(stats[0].min).toBe(1);
    expect(stats[0].max).toBe(100);
    expect(stats[0].mean).toBeCloseTo(50.5, 5);
  });

  it('computes stddev correctly for known values', () => {
    // stddev of [2, 4, 4, 4, 5, 5, 7, 9] = 2.0 (population)
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const rows = values.map((v, i) =>
      makeRow({ timestamp: `2026/03/07 00:20:${37 + i}.000`, index: 0, power: v }),
    );
    const stats = computeGpuStats(rows, 'power');
    expect(stats[0].stddev).toBeCloseTo(2.0, 1);
  });

  it('works with temperature metric', () => {
    const rows = [
      makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, temperature: 60 }),
      makeRow({ timestamp: '2026/03/07 00:20:38.000', index: 0, temperature: 70 }),
      makeRow({ timestamp: '2026/03/07 00:20:39.000', index: 0, temperature: 80 }),
    ];
    const stats = computeGpuStats(rows, 'temperature');
    expect(stats[0].min).toBe(60);
    expect(stats[0].max).toBe(80);
    expect(stats[0].mean).toBeCloseTo(70, 5);
  });

  it('handles a single data point per GPU', () => {
    const rows = [makeRow({ timestamp: '2026/03/07 00:20:37.000', index: 0, power: 250 })];
    const stats = computeGpuStats(rows, 'power');
    expect(stats).toHaveLength(1);
    expect(stats[0].count).toBe(1);
    expect(stats[0].min).toBe(250);
    expect(stats[0].max).toBe(250);
    expect(stats[0].mean).toBe(250);
    expect(stats[0].median).toBe(250);
    expect(stats[0].stddev).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GPU_METRIC_OPTIONS
// ---------------------------------------------------------------------------

describe('GPU_METRIC_OPTIONS', () => {
  it('covers all 6 GpuMetricKey values', () => {
    const keys = GPU_METRIC_OPTIONS.map((m) => m.key);
    expect(keys).toEqual(['power', 'temperature', 'smClock', 'memClock', 'gpuUtil', 'memUtil']);
  });

  it('each option has non-empty label, unit, and yAxisLabel', () => {
    for (const opt of GPU_METRIC_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.unit.length).toBeGreaterThan(0);
      expect(opt.yAxisLabel.length).toBeGreaterThan(0);
      expect(opt.yAxisLabel).toContain(opt.unit);
    }
  });
});
