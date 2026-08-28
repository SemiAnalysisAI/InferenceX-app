import { describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';

import { getBenchmarkSiblings } from './benchmark-siblings.js';

function mockSql(queue: unknown[][]): {
  sql: DbClient;
  calls: string[];
} {
  const responses = [...queue];
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    calls.push(strings.join('?'));
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, calls };
}

describe('getBenchmarkSiblings', () => {
  it('returns physical offload tiers and P90 Pareto coordinates', async () => {
    const { sql, calls } = mockSql([
      [
        {
          hardware: 'h100',
          framework: 'vllm',
          model: 'minimaxm3',
          precision: 'fp8',
          spec_method: 'mtp',
          benchmark_type: 'agentic_traces',
          workflow_run_id: 12,
          date: '2026-08-28',
          github_run_id: 33169766010,
          dataset_slug: 'agentx-minimaxm3',
        },
      ],
      [
        {
          id: 440549,
          conc: 7,
          offload_mode: 'on',
          kv_offloading: 'dram+nvme',
          decode_tp: 8,
          decode_ep: 1,
          decode_pp: 1,
          decode_dcp_size: null,
          decode_pcp_size: null,
          decode_dp_attention: false,
          decode_num_workers: 1,
          prefill_tp: 8,
          prefill_ep: 1,
          prefill_pp: 1,
          prefill_dcp_size: null,
          prefill_pcp_size: null,
          prefill_dp_attention: false,
          prefill_num_workers: 1,
          num_prefill_gpu: 0,
          num_decode_gpu: 8,
          disagg: false,
          is_multinode: false,
          tput_per_gpu: '128.4',
          p90_intvty: '7.2',
          p90_ttft: '4.8',
          total_requests: '320',
          has_trace: true,
        },
      ],
    ]);

    const result = await getBenchmarkSiblings(sql, 440549);

    expect(result?.siblings[0]).toMatchObject({
      id: 440549,
      kv_offloading: 'dram+nvme',
      tput_per_gpu: 128.4,
      p90_intvty: 7.2,
      p90_ttft: 4.8,
      is_current: true,
    });
    expect(calls[1]).toContain("br.metrics->>'kv_offloading'");
    expect(calls[1]).toContain("br.metrics->>'p90_intvty'");
    expect(calls[1]).toContain("br.metrics->>'p90_ttft'");
  });
});
