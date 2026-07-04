import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { isStringTooLongError, streamCollectKeys } from './gzip-json-stream.js';

describe('isStringTooLongError', () => {
  it('matches the ERR_STRING_TOO_LONG code', () => {
    const err = new Error('Cannot create a string longer than ...') as NodeJS.ErrnoException;
    err.code = 'ERR_STRING_TOO_LONG';
    expect(isStringTooLongError(err)).toBe(true);
  });

  it('matches the message-only variant', () => {
    expect(isStringTooLongError(new Error('Cannot create a string longer than 0x1fffffe8'))).toBe(
      true,
    );
  });

  it('rejects unrelated errors and non-errors', () => {
    expect(isStringTooLongError(new Error('unexpected token'))).toBe(false);
    expect(isStringTooLongError(null)).toBe(false);
    expect(isStringTooLongError('ERR_STRING_TOO_LONG-ish string')).toBe(false);
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
