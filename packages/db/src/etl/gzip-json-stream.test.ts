import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  collectMetricPhases,
  gunzipJsonWithinLimit,
  scanPrettyMetricPhases,
  streamCollectKeys,
  streamCollectMetricPhases,
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

const series = (start: number) => ({
  series: Array.from({ length: 20 }, (_, i) => ({
    labels: { note: 'line\nbreak "quoted" \\ end' },
    timeslices: [{ start_ns: start + i, rate: i / 3 }],
  })),
});

describe('scanPrettyMetricPhases', () => {
  const doc = {
    schema_version: '1.1',
    metadata: {
      metrics: { wanted: { nested: 'must not be selected' } },
      warmup_metrics: { wanted: { nested: 'must not be selected' } },
    },
    metrics: {
      ignored: series(100),
      wanted: series(0),
      'quote"key': [1, { nested: true }, null],
      'not wanted"': 'skip',
      'slash\\': 42,
      scalar: 'last',
    },
    warmup_metrics: {
      wanted: false,
      empty: {},
      scalar: series(50),
    },
    input_config: { metrics: ['wanted'] },
  };
  const wanted = new Set(['wanted', 'scalar', 'quote"key', 'slash\\', 'empty']);
  const expected = {
    metrics: {
      wanted: doc.metrics.wanted,
      'quote"key': [1, { nested: true }, null],
      'slash\\': 42,
      scalar: 'last',
    },
    warmupMetrics: {
      wanted: false,
      empty: {},
      scalar: doc.warmup_metrics.scalar,
    },
    complete: false,
  };
  const pretty = gzipSync(JSON.stringify(doc, null, 2));

  it.each([64, 67, 100, 4096])(
    'matches the token stream across %i-byte gunzip chunks',
    async (chunkSize) => {
      const scanned = await scanPrettyMetricPhases(pretty, wanted, chunkSize);
      const streamed = await streamCollectMetricPhases(pretty, wanted);

      expect(scanned).toEqual(expected);
      expect(scanned).toEqual(streamed);
      expect(Object.keys(scanned!.metrics)).toEqual(Object.keys(streamed.metrics));
    },
  );

  it('is used by collectMetricPhases above the in-memory limit', async () => {
    await expect(collectMetricPhases(pretty, wanted, 1)).resolves.toEqual(expected);
  });

  it('handles empty phases, duplicate members and trailing whitespace', async () => {
    const blob = gzipSync(
      '{\n  "metrics": {},\n  "warmup_metrics": {\n    "wanted": 1,\n    "other": 2,\n' +
        '    "wanted": 3\n  }\n}\n',
    );
    const result = { metrics: {}, warmupMetrics: { wanted: 3 }, complete: false };

    await expect(scanPrettyMetricPhases(blob, new Set(['wanted']))).resolves.toEqual(result);
    await expect(streamCollectMetricPhases(blob, new Set(['wanted']))).resolves.toEqual(result);
  });

  it.each([
    ['compact JSON', JSON.stringify(doc), expected],
    ['4-space indentation', JSON.stringify(doc, null, 4), expected],
    ['tab indentation', JSON.stringify(doc, null, '\t'), expected],
    [
      'a single-line phase',
      '{\n  "metrics": {"wanted": 1}\n}',
      { metrics: { wanted: 1 }, warmupMetrics: {}, complete: false },
    ],
    [
      'a non-object phase',
      '{\n  "metrics": null,\n  "warmup_metrics": {\n    "wanted": 1\n  }\n}',
      { metrics: {}, warmupMetrics: { wanted: 1 }, complete: false },
    ],
    [
      'duplicate phase keys',
      '{\n  "metrics": {\n    "wanted": 1\n  },\n  "metrics": {\n    "wanted": 3\n  }\n}',
      { metrics: { wanted: 3 }, warmupMetrics: {}, complete: false },
    ],
    [
      'a nested value at member indentation',
      '{\n  "metrics": {\n    "wanted": [\n    "x"\n    ]\n  }\n}',
      { metrics: { wanted: ['x'] }, warmupMetrics: {}, complete: false },
    ],
  ])('falls back to the token stream for %s', async (_name, json, result) => {
    const blob = gzipSync(json);

    await expect(scanPrettyMetricPhases(blob, wanted, 64)).resolves.toBeNull();
    await expect(collectMetricPhases(blob, wanted, 1)).resolves.toEqual(result);
  });

  it('rejects layouts that do not end at the top-level object', async () => {
    const truncated = gzipSync(JSON.stringify(doc, null, 2).slice(0, -2));

    await expect(scanPrettyMetricPhases(truncated, wanted)).resolves.toBeNull();
  });
});
