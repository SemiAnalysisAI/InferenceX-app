import { describe, it, expect } from 'vitest';
import { extractWorkers, mapBenchmarkRow } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';

/** Minimal valid v1 benchmark row. */
function makeV1Row(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'h200-nv',
    framework: 'vllm',
    precision: 'fp8',
    isl: 1024,
    osl: 1024,
    conc: 64,
    tp: 8,
    ep: 1,
    dp_attention: false,
    tput_per_gpu: 1234.5,
    median_ttft: 50.2,
    mean_tpot: 12.3,
    ...overrides,
  };
}

/** Minimal valid agentic row: scenario_type triggers the agentic path; `users` → conc. */
function makeAgenticRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsv4',
    hw: 'b200-nv',
    framework: 'vllm',
    precision: 'fp4',
    scenario_type: 'agentic-coding',
    users: 72,
    tput_per_gpu: 20000,
    ...overrides,
  };
}

/** Minimal valid v2 benchmark row (disaggregated prefill/decode parallelism). */
function makeV2Row(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsr1',
    hw: 'h200-nv',
    framework: 'sglang',
    precision: 'fp8',
    isl: 1024,
    osl: 8192,
    conc: 128,
    prefill_tp: 4,
    prefill_ep: 2,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 2,
    decode_ep: 4,
    decode_dp_attention: true,
    decode_num_workers: 2,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    tput_per_gpu: 567.8,
    ...overrides,
  };
}

describe('mapBenchmarkRow', () => {
  describe('v1 schema', () => {
    it('maps a valid v1 row to BenchmarkParams', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result).not.toBeNull();
      expect(result!.config.hardware).toBe('h200');
      expect(result!.config.framework).toBe('vllm');
      expect(result!.config.model).toBe('dsr1');
      expect(result!.config.precision).toBe('fp8');
      expect(result!.config.specMethod).toBe('none');
      expect(result!.config.disagg).toBe(false);
      expect(result!.config.isMultinode).toBe(false);
      expect(result!.isl).toBe(1024);
      expect(result!.osl).toBe(1024);
      expect(result!.conc).toBe(64);
      expect(result!.image).toBeNull();
    });

    it('sets v1 parallelism: prefill = decode = tp*ep', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ tp: 4, ep: 2, dp_attention: 'True' }), tracker);

      expect(result!.config.prefillTp).toBe(4);
      expect(result!.config.prefillEp).toBe(2);
      expect(result!.config.prefillDpAttn).toBe(true);
      expect(result!.config.prefillNumWorkers).toBe(0);
      expect(result!.config.decodeTp).toBe(4);
      expect(result!.config.decodeEp).toBe(2);
      expect(result!.config.decodeDpAttn).toBe(true);
      expect(result!.config.decodeNumWorkers).toBe(0);
      expect(result!.config.numPrefillGpu).toBe(8);
      expect(result!.config.numDecodeGpu).toBe(8);
    });

    it('defaults tp=1, ep=1 when absent', () => {
      const row = makeV1Row();
      delete row.tp;
      delete row.ep;
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(row, tracker);

      expect(result!.config.prefillTp).toBe(1);
      expect(result!.config.prefillEp).toBe(1);
      expect(result!.config.numPrefillGpu).toBe(1);
    });

    it('captures numeric metrics and excludes non-metric keys', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result!.metrics.tput_per_gpu).toBe(1234.5);
      expect(result!.metrics.median_ttft).toBe(50.2);
      expect(result!.metrics.mean_tpot).toBe(12.3);
      // Non-metric keys should not be in metrics
      expect(result!.metrics).not.toHaveProperty('hw');
      expect(result!.metrics).not.toHaveProperty('model');
      expect(result!.metrics).not.toHaveProperty('framework');
      expect(result!.metrics).not.toHaveProperty('isl');
      expect(result!.metrics).not.toHaveProperty('osl');
      expect(result!.metrics).not.toHaveProperty('conc');
      expect(result!.metrics).not.toHaveProperty('tp');
      expect(result!.metrics).not.toHaveProperty('ep');
    });
  });

  describe('v2 schema', () => {
    it('maps a valid v2 row with separate prefill/decode parallelism', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV2Row(), tracker);

      expect(result).not.toBeNull();
      expect(result!.config.prefillTp).toBe(4);
      expect(result!.config.prefillEp).toBe(2);
      expect(result!.config.prefillDpAttn).toBe(false);
      expect(result!.config.prefillNumWorkers).toBe(1);
      expect(result!.config.decodeTp).toBe(2);
      expect(result!.config.decodeEp).toBe(4);
      expect(result!.config.decodeDpAttn).toBe(true);
      expect(result!.config.decodeNumWorkers).toBe(2);
      expect(result!.config.numPrefillGpu).toBe(8);
      expect(result!.config.numDecodeGpu).toBe(8);
    });

    it('defaults num_prefill_gpu to prefillTp*prefillEp when absent', () => {
      const row = makeV2Row();
      delete row.num_prefill_gpu;
      delete row.num_decode_gpu;
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(row, tracker);

      expect(result!.config.numPrefillGpu).toBe(8); // 4 * 2
      expect(result!.config.numDecodeGpu).toBe(8); // 2 * 4
    });
  });

  describe('skip tracking', () => {
    it('skips and counts unmapped model', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({ infmax_model_prefix: 'nonexistent_model_xyz', model: undefined }),
        tracker,
      );

      expect(result).toBeNull();
      expect(tracker.skips.unmappedModel).toBe(1);
      expect(tracker.unmappedModels.has('nonexistent_model_xyz')).toBe(true);
    });

    it('skips and counts unmapped hardware', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ hw: 'imaginary-gpu-999' }), tracker);

      expect(result).toBeNull();
      expect(tracker.skips.unmappedHw).toBe(1);
      expect(tracker.unmappedHws.has('imaginary-gpu-999')).toBe(true);
    });

    it('skips when ISL/OSL/conc missing', () => {
      const tracker = createSkipTracker();
      const row = makeV1Row();
      delete row.isl;
      delete row.osl;
      const result = mapBenchmarkRow(row, tracker);

      expect(result).toBeNull();
      expect(tracker.skips.noIslOsl).toBe(1);
    });

    it('skips when conc is missing', () => {
      const tracker = createSkipTracker();
      const row = makeV1Row();
      delete row.conc;
      const result = mapBenchmarkRow(row, tracker);

      expect(result).toBeNull();
      expect(tracker.skips.noIslOsl).toBe(1);
    });
  });

  describe('ISL/OSL fallback', () => {
    it('uses islOslFallback when row lacks isl/osl', () => {
      const tracker = createSkipTracker();
      const row = makeV1Row();
      delete row.isl;
      delete row.osl;
      const result = mapBenchmarkRow(row, tracker, { isl: 1024, osl: 8192 });

      expect(result).not.toBeNull();
      expect(result!.isl).toBe(1024);
      expect(result!.osl).toBe(8192);
    });

    it('prefers row isl/osl over fallback', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ isl: 8192, osl: 1024 }), tracker, {
        isl: 1024,
        osl: 1024,
      });

      expect(result!.isl).toBe(8192);
      expect(result!.osl).toBe(1024);
    });
  });

  describe('edge cases', () => {
    it('skips row with zero conc', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ conc: 0 }), tracker);

      expect(result).toBeNull();
      expect(tracker.skips.noIslOsl).toBe(1);
    });

    it('skips row with null isl', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ isl: null }), tracker);

      expect(result).toBeNull();
    });

    it('handles non-numeric metric values gracefully', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({ tput_per_gpu: 'not_a_number', median_ttft: 50.2 }),
        tracker,
      );

      expect(result).not.toBeNull();
      expect(result!.metrics).not.toHaveProperty('tput_per_gpu');
      expect(result!.metrics.median_ttft).toBe(50.2);
    });

    it('handles empty framework string', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ framework: '' }), tracker);

      expect(result).not.toBeNull();
      expect(result!.config.framework).toBe('');
    });

    it('captures image field with special characters', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({ image: 'registry.io#org#repo:v1.2.3-rc1+build.123' }),
        tracker,
      );

      expect(result!.image).toBe('registry.io/org/repo:v1.2.3-rc1+build.123');
    });

    it('handles v2 row with missing optional parallelism fields', () => {
      const tracker = createSkipTracker();
      const row = makeV2Row();
      delete row.prefill_num_workers;
      delete row.decode_num_workers;
      const result = mapBenchmarkRow(row, tracker);

      expect(result!.config.prefillNumWorkers).toBe(0);
      expect(result!.config.decodeNumWorkers).toBe(0);
    });

    it('parses string numeric values for isl/osl/conc', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ isl: '2048', osl: '4096', conc: '32' }), tracker);

      expect(result!.isl).toBe(2048);
      expect(result!.osl).toBe(4096);
      expect(result!.conc).toBe(32);
    });

    it('handles disagg field as string "True"', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ disagg: 'True' }), tracker);

      expect(result!.config.disagg).toBe(true);
    });

    it('handles spec_decoding=mtp', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ spec_decoding: 'mtp' }), tracker);

      expect(result!.config.specMethod).toBe('mtp');
    });
  });

  describe('framework normalization', () => {
    it('normalizes sglang-disagg to mori-sglang + disagg=true', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ framework: 'sglang-disagg' }), tracker);

      expect(result!.config.framework).toBe('mori-sglang');
      expect(result!.config.disagg).toBe(true);
    });

    it('normalizes dynamo-trtllm to dynamo-trt and forces disagg=true (framework implies it)', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ framework: 'dynamo-trtllm' }), tracker);

      expect(result!.config.framework).toBe('dynamo-trt');
      expect(result!.config.disagg).toBe(true);
    });
  });

  describe('image field', () => {
    it('replaces # with / in image path', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({ image: 'nvcr.io#nvidia#tritonserver:24.07' }),
        tracker,
      );

      expect(result!.image).toBe('nvcr.io/nvidia/tritonserver:24.07');
    });

    it('returns null when image not present', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result!.image).toBeNull();
    });
  });

  describe('spec_decoding', () => {
    it('normalizes spec_decoding to lowercase', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ spec_decoding: 'Eagle' }), tracker);

      expect(result!.config.specMethod).toBe('eagle');
    });

    it('defaults to none when absent', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result!.config.specMethod).toBe('none');
    });
  });

  describe('precision', () => {
    it('lowercases precision', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ precision: 'FP8' }), tracker);

      expect(result!.config.precision).toBe('fp8');
    });

    it('defaults to empty string when absent and flags as unmapped', () => {
      const tracker = createSkipTracker();
      const row = makeV1Row();
      delete row.precision;
      const result = mapBenchmarkRow(row, tracker);

      expect(result!.config.precision).toBe('');
      expect(tracker.unmappedPrecisions.has('')).toBe(true);
    });
  });

  describe('is_multinode', () => {
    it('parses is_multinode boolean', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ is_multinode: true }), tracker);

      expect(result!.config.isMultinode).toBe(true);
    });

    it('parses is_multinode string "True"', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ is_multinode: 'True' }), tracker);

      expect(result!.config.isMultinode).toBe(true);
    });

    it('defaults to false when absent', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result!.config.isMultinode).toBe(false);
    });
  });

  describe('workers payload (multinode / disagg measured power)', () => {
    it('leaves workers undefined when the row omits the field', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result!.workers).toBeUndefined();
    });

    it('extracts a multinode disagg workers array intact', () => {
      const tracker = createSkipTracker();
      const workers = [
        {
          role: 'prefill',
          worker_idx: 0,
          hosts: ['pn0'],
          num_gpus: 4,
          avg_power_w: 612.3,
          avg_temp_c: 71.2,
          peak_temp_c: 78,
          avg_util_pct: 92.1,
          avg_mem_used_mb: 65432,
        },
        {
          role: 'decode',
          worker_idx: 0,
          hosts: ['dn0', 'dn1', 'dn2', 'dn3'],
          num_gpus: 16,
          avg_power_w: 712.1,
        },
      ];
      const result = mapBenchmarkRow(makeV2Row({ workers }), tracker);

      expect(result!.workers).toHaveLength(2);
      expect(result!.workers![0].role).toBe('prefill');
      expect(result!.workers![0].hosts).toEqual(['pn0']);
      expect(result!.workers![0].avg_power_w).toBe(612.3);
      expect(result!.workers![0].avg_temp_c).toBe(71.2);
      expect(result!.workers![0].peak_temp_c).toBe(78);
      expect(result!.workers![0].avg_util_pct).toBe(92.1);
      expect(result!.workers![0].avg_mem_used_mb).toBe(65432);
      expect(result!.workers![1].role).toBe('decode');
      expect(result!.workers![1].hosts).toEqual(['dn0', 'dn1', 'dn2', 'dn3']);
      expect(result!.workers![1].num_gpus).toBe(16);
      // Optional telemetry fields stay absent when the source omits them.
      expect(result!.workers![1].avg_temp_c).toBeUndefined();
    });

    it('does not write workers into the metrics record', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({
          workers: [{ role: 'prefill', worker_idx: 0, num_gpus: 4, avg_power_w: 500 }],
        }),
        tracker,
      );

      // workers is an array — parseNum yields undefined, but the explicit
      // NON_METRIC_KEYS entry is what guarantees it never leaks into metrics.
      expect(result!.metrics).not.toHaveProperty('workers');
    });

    it('captures new cluster-wide temp / util / mem scalars into metrics', () => {
      // These are flat scalars on the agg row (sibling of avg_power_w), so
      // the auto-capture path must store them under their raw keys without
      // emitting a "[WARN] auto-captured unexpected metric" warning. The
      // warning suppression is verified indirectly: METRIC_KEYS now contains
      // these keys, so a clean test run never produces a warning.
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(
        makeV1Row({
          avg_temp_c: 68.4,
          peak_temp_c: 79.2,
          avg_util_pct: 88.5,
          avg_mem_used_mb: 71234.5,
        }),
        tracker,
      );

      expect(result!.metrics.avg_temp_c).toBe(68.4);
      expect(result!.metrics.peak_temp_c).toBe(79.2);
      expect(result!.metrics.avg_util_pct).toBe(88.5);
      expect(result!.metrics.avg_mem_used_mb).toBe(71234.5);
    });

    it('backward-compat: row without temp/util/mem still maps cleanly', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row(), tracker);

      expect(result).not.toBeNull();
      expect(result!.metrics).not.toHaveProperty('avg_temp_c');
      expect(result!.metrics).not.toHaveProperty('peak_temp_c');
      expect(result!.metrics).not.toHaveProperty('avg_util_pct');
      expect(result!.metrics).not.toHaveProperty('avg_mem_used_mb');
      expect(result!.workers).toBeUndefined();
    });
  });
});

describe('extractWorkers', () => {
  it('returns undefined for non-array input', () => {
    expect(extractWorkers(undefined)).toBeUndefined();
    expect(extractWorkers(null)).toBeUndefined();
    expect(extractWorkers('not-an-array')).toBeUndefined();
    expect(extractWorkers(42)).toBeUndefined();
    expect(extractWorkers({ role: 'prefill' })).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    expect(extractWorkers([])).toBeUndefined();
  });

  it('keeps well-formed entries and drops malformed ones', () => {
    const result = extractWorkers([
      { role: 'prefill', worker_idx: 0, num_gpus: 4, avg_power_w: 500 },
      // missing role
      { worker_idx: 1, num_gpus: 4, avg_power_w: 500 },
      // missing avg_power_w
      { role: 'decode', worker_idx: 0, num_gpus: 4 },
      // ok
      { role: 'frontend', worker_idx: 0, num_gpus: 0, avg_power_w: 0 },
    ]);

    expect(result).toHaveLength(2);
    expect(result![0].role).toBe('prefill');
    expect(result![1].role).toBe('frontend');
    expect(result![1].avg_power_w).toBe(0);
  });

  it('coerces string-numeric values via parseNum / parseInt2', () => {
    const result = extractWorkers([
      {
        role: 'decode',
        worker_idx: '2',
        num_gpus: '8',
        avg_power_w: '712.5',
        avg_temp_c: '71.5',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result![0].worker_idx).toBe(2);
    expect(result![0].num_gpus).toBe(8);
    expect(result![0].avg_power_w).toBe(712.5);
    expect(result![0].avg_temp_c).toBe(71.5);
  });

  it('drops hosts when it is not an all-string array', () => {
    const result = extractWorkers([
      {
        role: 'prefill',
        worker_idx: 0,
        num_gpus: 4,
        avg_power_w: 500,
        hosts: 'pn0',
      },
      {
        role: 'decode',
        worker_idx: 0,
        num_gpus: 4,
        avg_power_w: 500,
        hosts: ['dn0', 42],
      },
      {
        role: 'agg',
        worker_idx: 0,
        num_gpus: 4,
        avg_power_w: 500,
        hosts: ['ok'],
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result![0].hosts).toBeUndefined();
    expect(result![1].hosts).toBeUndefined();
    expect(result![2].hosts).toEqual(['ok']);
  });

  it('returns undefined when every entry is malformed', () => {
    expect(extractWorkers([null, 'bad', 0, undefined])).toBeUndefined();
  });
});

describe('mapBenchmarkRow — agentic interactivity normalization', () => {
  it('derives *_intvty from 1/*_itl, discarding the artifact value', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(
      makeAgenticRow({
        p90_itl: 0.0893,
        p90_intvty: 23.91, // fast-tail contamination — must be overwritten
        p75_itl: 0.0692,
        p75_intvty: 19,
      }),
      tracker,
    );
    expect(result!.benchmarkType).toBe('agentic_traces');
    expect(result!.metrics.p90_intvty).toBeCloseTo(1 / 0.0893, 6);
    expect(result!.metrics.p75_intvty).toBeCloseTo(1 / 0.0692, 6);
  });

  it('derives *_intvty even when the artifact omits it', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeAgenticRow({ p90_itl: 0.1 }), tracker);
    expect(result!.metrics.p90_intvty).toBeCloseTo(10, 6);
  });

  it('does not touch *_intvty for single_turn rows', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeV1Row({ p90_itl: 0.05, p90_intvty: 999 }), tracker);
    expect(result!.metrics.p90_intvty).toBe(999);
  });

  it('DELETES a stale artifact *_intvty when the matching *_itl is absent', () => {
    // Artifact ships intvty (possibly the drifted p(1/ITL) definition) but no itl
    // for that percentile. Passing it through would mix harness semantics into a
    // column meant to be 1/p(ITL) everywhere — so the key must be removed, not kept.
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeAgenticRow({ p90_intvty: 42, p95_itl: 0.2 }), tracker);
    expect(result!.metrics).not.toHaveProperty('p90_intvty'); // stale → deleted
    expect(result!.metrics.p95_intvty).toBeCloseTo(5, 6); // derived from itl
  });

  it('DELETES a stale artifact *_intvty when the matching *_itl is zero/invalid', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeAgenticRow({ p90_itl: 0, p90_intvty: 42 }), tracker);
    expect(result!.metrics).not.toHaveProperty('p90_intvty');
  });
});

/**
 * Minimal v3 agentic row (2026-07-02+): nested request_metrics/server_metrics,
 * p50 percentiles, pre-inverted intvty, kv_offloading descriptors. Mirrors the
 * real artifact from GH run 28553943579 (trimmed).
 */
function makeV3AgenticRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    infmax_model_prefix: 'dsv4',
    hw: 'cluster:b300-nv',
    framework: 'vllm',
    precision: 'fp4',
    spec_decoding: 'none',
    disagg: false,
    scenario_type: 'agentic-coding',
    is_multinode: false,
    tp: 4,
    ep: 1,
    dp_attention: 'false',
    conc: 16,
    image: 'vllm/vllm-openai:v0.23.0',
    kv_offloading: 'none',
    kv_offload_backend: '',
    num_requests_total: 1648,
    num_requests_successful: 1648,
    dataset: {
      source_type: 'public_dataset',
      hf_dataset_name: 'semianalysisai/cc-traces-weka-062126',
    },
    request_metrics: {
      qps: {
        window_seconds: 1,
        samples: 7209,
        mean: 0.22846,
        p50: 0,
        p75: 0,
        p90: 1,
        p95: 1,
        std: 0.60707,
      },
      latency: {
        ttft: {
          mean: 12.90033,
          p50: 1.49712,
          p75: 12.09501,
          p90: 56.22194,
          p95: 68.03156,
          std: 22.68353,
        },
        e2el: {
          mean: 81.05644,
          p50: 26.18817,
          p75: 84.93601,
          p90: 199.85996,
          p95: 360.31579,
          std: 149.59205,
        },
        itl: {
          mean: 0.07548,
          p50: 0.03677,
          p75: 0.10253,
          p90: 0.16652,
          p95: 0.22255,
          std: 0.08327,
        },
        tpot: {
          mean: 0.07548,
          p50: 0.03677,
          p75: 0.10253,
          p90: 0.16652,
          p95: 0.22255,
          std: 0.08327,
        },
        // already slow-tail inverted upstream (pXX_intvty = 1/pXX_itl)
        intvty: {
          mean: 13.2482,
          p50: 27.19411,
          p75: 9.75304,
          p90: 6.00526,
          p95: 4.49335,
          std: 24.77636,
        },
      },
      tokens: {
        input: {
          mean: 157676.054,
          p50: 96047,
          p75: 197684.25,
          p90: 404935.9,
          p95: 547502.85,
          std: 152480.17653,
        },
        output_actual: {
          mean: 849.06735,
          p50: 290.5,
          p75: 783.5,
          p90: 2231.8,
          p95: 3915.45,
          std: 1568.90823,
        },
        output_expected: {
          mean: 1432.32728,
          p50: 571.5,
          p75: 1820,
          p90: 3927,
          p95: 5312.9,
          std: 2067.19215,
        },
      },
      throughput: {
        input: { tokens_per_second: 35980.14001 },
        output: { tokens_per_second: 193.7489 },
        total: { tokens_per_second: 36173.88892 },
        duration_seconds: 7222.04352,
        per_gpu: {
          total_tput_tps: 9043.47223,
          output_tput_tps: 48.43723,
          input_tput_tps: 8995.035,
        },
      },
      cache: { theoretical_cache_hit_rate: 0.97509 },
    },
    server_metrics: {
      present: true,
      adapter: 'vllm',
      metric_count: 49,
      cache: {
        gpu_cache_hit_rate: 0.78539,
        cpu_cache_hit_rate: 0,
        external_cache_hit_rate: 0,
        overall_cache_hit_rate: 0.78539,
        prefix_cache_hits: 205576960,
        prefix_cache_queries: 261750519,
        frontend_cache_hit_rate: null,
      },
      kv_cache: { gpu_usage_pct: 0.82134, cpu_usage_pct: null, cpu_used_tokens: null },
      tokens: {
        prompt_total: 261750519,
        generation_total: 1422696,
        requests_completed: 1648,
        prompt_by_source: {
          gpu_cache_hit: 205576960,
          cpu_or_external_cache_hit: 0,
          computed: 56173559,
        },
      },
      sources: [{ id: 'combined|http://localhost:8888/metrics|engine=0', role: 'combined' }],
    },
    ...overrides,
  };
}

describe('mapBenchmarkRow — v3 agentic nested agg schema', () => {
  it('maps identity/routing and flattens the nested containers', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeV3AgenticRow(), tracker);

    expect(result).not.toBeNull();
    expect(result!.benchmarkType).toBe('agentic_traces');
    expect(result!.config.hardware).toBe('b300');
    expect(result!.conc).toBe(16);
    expect(result!.isl).toBeNull();
    expect(result!.osl).toBeNull();

    const m = result!.metrics;
    // latency distributions, p50 stored under the canonical median_* name
    expect(m.median_ttft).toBeCloseTo(1.49712, 6);
    expect(m.p90_ttft).toBeCloseTo(56.22194, 6);
    expect(m.std_e2el).toBeCloseTo(149.59205, 6);
    expect(m.p95_itl).toBeCloseTo(0.22255, 6);
    expect(m.mean_tpot).toBeCloseTo(0.07548, 6);
    // qps + token distributions
    expect(m.median_qps).toBe(0);
    expect(m.p90_input_tokens).toBeCloseTo(404935.9, 3);
    expect(m.median_output_tokens_actual).toBeCloseTo(290.5, 3);
    expect(m.p95_output_tokens_expected).toBeCloseTo(5312.9, 3);
    // throughput scalars under the v2 flat names
    expect(m.tput_per_gpu).toBeCloseTo(9043.47223, 3);
    expect(m.output_tput_per_gpu).toBeCloseTo(48.43723, 3);
    expect(m.input_tput_per_gpu).toBeCloseTo(8995.035, 3);
    expect(m.total_tput_tps).toBeCloseTo(36173.88892, 3);
    expect(m.duration_seconds).toBeCloseTo(7222.04352, 3);
    // cache / kv / totals
    expect(m.theoretical_cache_hit_rate).toBeCloseTo(0.97509, 6);
    expect(m.server_gpu_cache_hit_rate).toBeCloseTo(0.78539, 6);
    expect(m.server_external_cache_hit_rate).toBe(0);
    expect(m.gpu_kv_cache_usage_pct).toBeCloseTo(0.82134, 6);
    expect(m.total_prompt_tokens).toBe(261750519);
    expect(m.total_generation_tokens).toBe(1422696);
    expect(m.total_requests_completed).toBe(1648);
    // nested containers must not leak into metrics
    expect(m).not.toHaveProperty('request_metrics');
    expect(m).not.toHaveProperty('server_metrics');
  });

  it('re-derives *_intvty from *_itl (matching the pre-inverted artifact values)', () => {
    const tracker = createSkipTracker();
    const m = mapBenchmarkRow(makeV3AgenticRow(), tracker)!.metrics;
    // The artifact already ships slow-tail intvty; the derive invariant keeps
    // one definition and must agree with it (up to the artifact's rounding).
    expect(m.median_intvty).toBeCloseTo(1 / 0.03677, 6);
    expect(m.p90_intvty).toBeCloseTo(1 / 0.16652, 6);
    expect(m.median_intvty).toBeCloseTo(27.19411, 2);
    expect(m.p90_intvty).toBeCloseTo(6.00526, 2);
    // std is never inverted — passes through from the artifact
    expect(m.std_intvty).toBeCloseTo(24.77636, 6);
  });

  it("maps kv_offloading 'none' to offload off and skips the empty backend", () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(makeV3AgenticRow(), tracker);
    expect(result!.offloadMode).toBe('off');
    expect(result!.metrics).not.toHaveProperty('kv_offload_backend');
  });

  it("maps kv_offloading 'dram' + backend to offload on with the backend preserved", () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(
      makeV3AgenticRow({ kv_offloading: 'dram', kv_offload_backend: 'mooncake', conc: 32 }),
      tracker,
    );
    expect(result!.offloadMode).toBe('on');
    expect((result!.metrics as Record<string, unknown>).kv_offloading).toBe('dram');
    expect((result!.metrics as Record<string, unknown>).kv_offload_backend).toBe('mooncake');
  });

  it('still applies the failed-run guard to v3 rows', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(
      makeV3AgenticRow({ num_requests_successful: 0, num_requests_total: 100 }),
      tracker,
    );
    expect(result).toBeNull();
    expect(tracker.skips.failedRun).toBe(1);
  });

  it('skips rows where the server never came up (zero total requests)', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(
      makeV3AgenticRow({ num_requests_successful: 0, num_requests_total: 0 }),
      tracker,
    );
    expect(result).toBeNull();
    expect(tracker.skips.failedRun).toBe(1);
  });

  it('leaves v2 flat agentic rows byte-identical (no flattening applied)', () => {
    const tracker = createSkipTracker();
    const result = mapBenchmarkRow(
      makeAgenticRow({ p90_itl: 0.1, mean_ttft: 1.5, offload_mode: 'on' }),
      tracker,
    );
    expect(result!.metrics.mean_ttft).toBe(1.5);
    expect(result!.metrics.p90_intvty).toBeCloseTo(10, 6);
    expect(result!.offloadMode).toBe('on');
  });
});
