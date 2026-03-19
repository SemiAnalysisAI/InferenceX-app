import { describe, it, expect } from 'vitest';
import { mapBenchmarkRow } from './benchmark-mapper';
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

    it('normalizes dynamo-trtllm to dynamo-trt', () => {
      const tracker = createSkipTracker();
      const result = mapBenchmarkRow(makeV1Row({ framework: 'dynamo-trtllm' }), tracker);

      expect(result!.config.framework).toBe('dynamo-trt');
      expect(result!.config.disagg).toBe(false);
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

    it('defaults to fp8 when absent', () => {
      const tracker = createSkipTracker();
      const row = makeV1Row();
      delete row.precision;
      const result = mapBenchmarkRow(row, tracker);

      expect(result!.config.precision).toBe('fp8');
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
});
