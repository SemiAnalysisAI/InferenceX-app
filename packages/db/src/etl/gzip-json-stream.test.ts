import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  collectMetricPhases,
  gunzipJsonWithinLimit,
  streamCollectKeys,
} from './gzip-json-stream.js';

describe('gunzipJsonWithinLimit', () => {
  const json = JSON.stringify({ metrics: { value: 1 } });
  const blob = gzipSync(json);

  it('returns decompressed JSON within the configured limit', () => {
    expect(gunzipJsonWithinLimit(blob, Buffer.byteLength(json))).toBe(json);
  });

  it('returns null when decompressed JSON exceeds the configured limit', () => {
    expect(gunzipJsonWithinLimit(blob, Buffer.byteLength(json) - 1)).toBeNull();
  });

  it('throws for malformed gzip data', () => {
    expect(() => gunzipJsonWithinLimit(Buffer.from('not gzip'))).toThrow();
  });
});

describe('streamCollectKeys', () => {
  const blob = gzipSync(
    JSON.stringify({
      metrics: {
        'vllm:prompt_tokens': { series: [{ timeslices: [{ start_ns: 1, rate: 2 }] }] },
        'vllm:ignored_metric': { series: [] },
      },
      warmup_metrics: {
        'vllm:prompt_tokens': { series: [] },
      },
    }),
  );

  it('collects only wanted keys under the filtered top-level block', async () => {
    const out = await streamCollectKeys<{ series: unknown[] }>(
      blob,
      'metrics',
      new Set(['vllm:prompt_tokens']),
    );
    expect(Object.keys(out)).toEqual(['vllm:prompt_tokens']);
    expect(out['vllm:prompt_tokens']).toEqual({
      series: [{ timeslices: [{ start_ns: 1, rate: 2 }] }],
    });
  });

  it('reads a different top-level phase block via filter', async () => {
    const out = await streamCollectKeys<{ series: unknown[] }>(
      blob,
      'warmup_metrics',
      new Set(['vllm:prompt_tokens']),
    );
    expect(out).toEqual({ 'vllm:prompt_tokens': { series: [] } });
  });

  it('rejects on a non-gzip buffer', async () => {
    await expect(
      streamCollectKeys(Buffer.from('not gzip'), 'metrics', new Set(['x'])),
    ).rejects.toThrow();
  });
});

describe('collectMetricPhases', () => {
  const blob = gzipSync(
    JSON.stringify({
      metadata: { ignored: true },
      metrics: {
        wanted: { series: [{ timeslices: [{ start_ns: 1, rate: 2 }] }] },
        ignored: { series: [{ timeslices: [{ start_ns: 3, rate: 4 }] }] },
      },
      warmup_metrics: {
        wanted: { series: [{ timeslices: [{ start_ns: 0, rate: 1 }] }] },
        ignored: { series: [] },
      },
    }),
  );

  it('retains the complete phase maps on the bounded fast path', async () => {
    const phases = await collectMetricPhases(blob, new Set(['wanted']));

    expect(phases.complete).toBe(true);
    expect(Object.keys(phases.metrics)).toEqual(['wanted', 'ignored']);
    expect(Object.keys(phases.warmupMetrics)).toEqual(['wanted', 'ignored']);
  });

  it('collects both filtered phase maps from one streaming parse', async () => {
    const phases = await collectMetricPhases(blob, new Set(['wanted']), 1);

    expect(phases).toEqual({
      metrics: {
        wanted: { series: [{ timeslices: [{ start_ns: 1, rate: 2 }] }] },
      },
      warmupMetrics: {
        wanted: { series: [{ timeslices: [{ start_ns: 0, rate: 1 }] }] },
      },
      complete: false,
    });
  });

  it('rejects malformed gzip input on both paths', async () => {
    await expect(
      collectMetricPhases(Buffer.from('not gzip'), new Set(['wanted']), 1),
    ).rejects.toThrow();
  });
});
