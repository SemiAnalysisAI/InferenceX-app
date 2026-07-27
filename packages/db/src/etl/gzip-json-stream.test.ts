import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { gunzipJsonWithinLimit, streamCollectKeys } from './gzip-json-stream.js';

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
