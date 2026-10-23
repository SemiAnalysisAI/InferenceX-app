import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BenchmarkRow } from '@/lib/api/api';

export function gb300DisaggRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 990_032,
    model: 'qwen3.5',
    hardware: 'gb300',
    framework: 'dynamo-sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 4,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 4,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:nightly-dev-cu13-20260918-20518d85',
    date: '2026-10-08',
    run_url: null,
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 594.191,
      avg_total_gpu_power_w: 4753.53,
      total_gpu_energy_j: 501_039.111,
      prefill_avg_power_w: 496.476,
      decode_avg_power_w: 691.906,
      joules_per_output_token: 1.691882,
      cpu_power_valid: 1,
      avg_cpu_socket_power_w: 98.066,
      avg_total_cpu_power_w: 392.264,
      total_cpu_energy_j: 41_346.013,
      avg_total_cpu_rail_power_w: 197.557,
      total_cpu_rail_energy_j: 20_823.242,
      avg_total_cpu_sysio_power_w: 25.314,
      total_cpu_sysio_energy_j: 2668.185,
      prefill_pp: 1,
      decode_pp: 1,
      median_intvty: 94.72,
    },
    workers: [
      {
        role: 'decode',
        worker_idx: 0,
        hosts: ['im-gb300-r01-c003'],
        num_gpus: 4,
        avg_power_w: 691.906,
      },
      {
        role: 'prefill',
        worker_idx: 0,
        hosts: ['im-gb300-r01-c001'],
        num_gpus: 4,
        avg_power_w: 496.476,
      },
    ],
    power_audit: {
      expected_gpu_count: 8,
      observed_gpu_count: 8,
      cpu: {
        sensor_kind: 'grace_socket',
        source: 'acpi',
        expected_sockets: 4,
        observed_sockets: 4,
        sample_row_count: 6268,
        reason_codes: [],
      },
    },
    ...overrides,
  };
}

export function gb300AggregateRow(trays = 4): BenchmarkRow {
  const gpus = trays * 4;
  const sockets = trays * 2;
  return gb300DisaggRow({
    disagg: false,
    prefill_tp: gpus,
    decode_tp: gpus,
    prefill_num_workers: 0,
    num_prefill_gpu: gpus,
    num_decode_gpu: gpus,
    workers: undefined,
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 594.191,
      avg_total_gpu_power_w: Math.round(594.191 * gpus * 1000) / 1000,
      cpu_power_valid: 1,
      avg_cpu_socket_power_w: 98.066,
      avg_total_cpu_power_w: Math.round(98.066 * sockets * 1000) / 1000,
      pp: 1,
      median_intvty: 60,
    },
    power_audit: {
      cpu: {
        sensor_kind: 'grace_socket',
        source: 'acpi',
        expected_sockets: sockets,
        observed_sockets: sockets,
      },
    },
  });
}

interface ParityCase {
  model: string;
  system: string;
  workload_state: string;
  using_scale_out: boolean;
  systems: number;
  gpu_level_power_per_gpu: number;
  cpu_and_dram_measured_power_per_socket: number | null;
  estimate?: { AllInPower_per_gpu: number };
  summary?: { AllInPower_per_gpu: number };
}

export function upstreamRackWattsPerGpu(
  hardware: 'gb200' | 'gb300',
  gpuWattsPerGpu: number,
  graceSocketWatts: number | null,
  scaleOut: boolean,
): number {
  const { cases } = JSON.parse(
    readFileSync(join(__dirname, 'power-model.parity.json'), 'utf8'),
  ) as { cases: ParityCase[] };
  const match = cases.find(
    (c) =>
      c.model === 'oss' &&
      c.system === `${hardware}-nvl72` &&
      c.workload_state === 'fixed-seq-len' &&
      c.using_scale_out === scaleOut &&
      c.systems === 1 &&
      c.gpu_level_power_per_gpu === gpuWattsPerGpu &&
      c.cpu_and_dram_measured_power_per_socket === graceSocketWatts,
  );
  const result = match?.estimate ?? match?.summary;
  if (!result) throw new Error('No in-domain upstream case for these inputs');
  return result.AllInPower_per_gpu;
}
