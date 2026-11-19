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

  it('ignores nested phase lookalikes and preserves selected scalar and compound values', async () => {
    const adversarial = gzipSync(
      JSON.stringify({
        metadata: {
          metrics: { wanted: { nested: 'must not be selected' } },
          warmup_metrics: { wanted: { nested: 'must not be selected' } },
        },
        metrics: {
          wanted: [1, { nested: true }, null],
          scalar: 42,
          ignored: { very: { deeply: ['nested', 'value'] } },
        },
        warmup_metrics: {
          wanted: false,
          scalar: 'warmup',
          ignored: [1, 2, 3],
        },
      }),
    );

    await expect(
      collectMetricPhases(adversarial, new Set(['wanted', 'scalar']), 1),
    ).resolves.toEqual({
      metrics: {
        wanted: [1, { nested: true }, null],
        scalar: 42,
      },
      warmupMetrics: {
        wanted: false,
        scalar: 'warmup',
      },
      complete: false,
    });
  });

  it('matches JSON semantics for duplicate phase and metric keys', async () => {
    const duplicateKeys = gzipSync(
      '{"metrics":{"wanted":1,"wanted":2},"metrics":{"wanted":3},' +
        '"warmup_metrics":{"wanted":4,"wanted":5}}',
    );

    await expect(collectMetricPhases(duplicateKeys, new Set(['wanted']), 1)).resolves.toEqual({
      metrics: { wanted: 3 },
      warmupMetrics: { wanted: 5 },
      complete: false,
    });
  });

  it('rejects malformed gzip input on both paths', async () => {
    await expect(
      collectMetricPhases(Buffer.from('not gzip'), new Set(['wanted']), 1),
    ).rejects.toThrow();
  });
});

const series = (start: number, length: number) => ({
  series: Array.from({ length }, (_, i) => ({
    labels: { note: `line\nbreak "quoted" \\ end ü 漢字 🚀 ${i}` },
    timeslices: [{ start_ns: start + i, rate: i / 3 }],
  })),
});

describe('collectMetricPhases streaming path', () => {
  const doc = {
    schema_version: '1.1',
    metadata: { metrics: { wanted: 'must not be selected' } },
    metrics: {
      ignored: series(0, 2000),
      wanted: series(100, 3000),
      'quote"key': [1, { nested: true }, null],
      scalar: 'last',
    },
    warmup_metrics: {
      wanted: false,
      empty: {},
      scalar: series(50, 1000),
    },
    input_config: { metrics: ['wanted'] },
  };
  const wanted = new Set(['wanted', 'scalar', 'quote"key', 'empty']);
  const pick = (phase: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(phase).filter(([key]) => wanted.has(key)));

  it.each([
    ['compact', JSON.stringify(doc)],
    ['pretty-printed', JSON.stringify(doc, null, 2)],
  ])('matches JSON.parse for %s JSON split across many gunzip chunks', async (_layout, json) => {
    // Several 64 KiB gunzip chunks, so tokens and multi-byte characters straddle chunk edges.
    expect(Buffer.byteLength(json)).toBeGreaterThan(8 * 64 * 1024);
    const parsed = JSON.parse(json) as typeof doc;

    const phases = await collectMetricPhases(gzipSync(json), wanted, 1);

    expect(phases).toStrictEqual({
      metrics: pick(parsed.metrics),
      warmupMetrics: pick(parsed.warmup_metrics),
      complete: false,
    });
    expect(Object.keys(phases.metrics)).toEqual(['wanted', 'quote"key', 'scalar']);
    expect(Object.keys(phases.warmupMetrics)).toEqual(['wanted', 'empty', 'scalar']);
  });

  it.each([
    ['an unterminated document', '{"metrics": {"wanted": 1}'],
    ['an unterminated value', '{"metrics": {"wanted": [1, 2'],
    ['trailing characters', '{"metrics": {"wanted": 1}} x'],
    ['a whitespace-only document', '  \n'],
  ])('rejects %s', async (_name, json) => {
    await expect(collectMetricPhases(gzipSync(json), wanted, 1)).rejects.toThrow();
  });

  it('rejects a truncated gzip stream', async () => {
    const blob = gzipSync(JSON.stringify(doc));

    await expect(
      collectMetricPhases(blob.subarray(0, blob.length >> 1), wanted, 1),
    ).rejects.toThrow();
  });
});
