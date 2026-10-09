import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

import { pointScrapeCsv, withOverlayServerMetrics } from './agentx-overlay-server-metrics';

const CSV = (tokens: number) =>
  [
    'Endpoint,Type,Metric,Unit,total,Description',
    `localhost:8000,counter,sglang:prompt_tokens,tokens,${tokens},d`,
    'localhost:8000,counter,sglang:generation_tokens,tokens,20,d',
    'localhost:8000,counter,sglang:cached_tokens,tokens,250,d',
  ].join('\n');

describe('pointScrapeCsv', () => {
  it('selects the conc directory copy and falls back to the single summary', () => {
    const entries = new Map([
      ['agentic/conc_8/aiperf_artifacts/server_metrics_export.csv', Buffer.from('eight')],
      ['agentic/conc_16/aiperf_artifacts/server_metrics_export.csv', Buffer.from('sixteen')],
    ]);
    expect(pointScrapeCsv(entries, 16)).toBe('sixteen');
    expect(pointScrapeCsv(entries, 4)).toBeNull();
    expect(
      pointScrapeCsv(
        new Map([['aiperf_artifacts/server_metrics_export.csv', Buffer.from('one')]]),
        4,
      ),
    ).toBe('one');
  });
});

describe('withOverlayServerMetrics', () => {
  const row = {
    framework: 'sglang',
    disagg: false,
    prefill_tp: 4,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 4,
    decode_dp_attention: false,
    decode_num_workers: 0,
    conc: 8,
    metrics: { tput_per_gpu: 100, total_requests_completed: 10, mean_input_tokens: 50 },
  } as unknown as BenchmarkRow;

  it('derives scrape metrics as ingest does and leaves log-only KV pools absent', () => {
    expect(withOverlayServerMetrics(row, CSV(1000)).metrics).toEqual({
      tput_per_gpu: 100,
      total_requests_completed: 10,
      mean_input_tokens: 50,
      total_prompt_tokens: 1000,
      total_generation_tokens: 20,
    });
  });

  it('falls back to client token totals without a scrape', () => {
    expect(withOverlayServerMetrics(row, null).metrics.total_prompt_tokens).toBe(500);
  });
});
