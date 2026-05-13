import { describe, expect, it } from 'vitest';

import { buildLaunchCommand } from './reproduce-command';

describe('buildLaunchCommand', () => {
  describe('vllm', () => {
    it('builds a basic single-process command', () => {
      const result = buildLaunchCommand('vllm', {
        model: 'deepseek-ai/DeepSeek-R1',
        precision: 'fp8',
        tp: 8,
        conc: 64,
        isl: 1024,
        osl: 1024,
      });
      expect(result.kind).toBe('single');
      expect(result.framework).toBe('vllm');
      expect(result.command).toContain('vllm serve');
      expect(result.command).toContain('--tensor-parallel-size 8');
      expect(result.command).toContain('--dtype fp8');
      expect(result.command).toContain('--max-num-seqs 64');
      expect(result.command).toContain('--max-model-len 2048');
      // Properly quotes the model when it contains a /
      expect(result.command).toContain('deepseek-ai/DeepSeek-R1');
    });

    it('emits expert-parallel and dp-attention flags when requested', () => {
      const result = buildLaunchCommand('vllm', {
        model: 'm',
        precision: 'fp4',
        tp: 8,
        ep: 8,
        dp_attention: true,
      });
      expect(result.command).toContain('--expert-parallel-size 8');
      expect(result.command).toContain('--data-parallel-attention');
    });

    it('emits a JSON speculative-config when spec_decoding is set', () => {
      const result = buildLaunchCommand('vllm', {
        model: 'm',
        precision: 'fp8',
        tp: 4,
        spec_decoding: 'mtp',
      });
      // JSON gets shell-quoted because of the curly braces / quotes.
      expect(result.command).toMatch(/--speculative-config '\{"method":"mtp"\}'/);
    });

    it('omits speculative-config when spec_decoding is "none"', () => {
      const result = buildLaunchCommand('vllm', {
        model: 'm',
        precision: 'fp8',
        tp: 1,
        spec_decoding: 'none',
      });
      expect(result.command).not.toContain('speculative-config');
    });
  });

  describe('sglang', () => {
    it('builds a basic single-process command', () => {
      const result = buildLaunchCommand('sglang', {
        model: 'meta-llama/Llama-3.3-70B',
        precision: 'fp8',
        tp: 4,
        conc: 32,
        isl: 8192,
        osl: 1024,
      });
      expect(result.kind).toBe('single');
      expect(result.command).toContain('python -m sglang.launch_server');
      expect(result.command).toContain('--tp 4');
      expect(result.command).toContain('--max-running-requests 32');
      expect(result.command).toContain('--context-length 9216');
    });

    it('uses --enable-dp-attention for sglang', () => {
      const result = buildLaunchCommand('sglang', {
        model: 'm',
        precision: 'fp8',
        tp: 8,
        dp_attention: true,
      });
      expect(result.command).toContain('--enable-dp-attention');
    });

    it('emits --speculative-algorithm when spec_decoding is set', () => {
      const result = buildLaunchCommand('sglang', {
        model: 'm',
        precision: 'fp8',
        tp: 4,
        spec_decoding: 'eagle3',
      });
      expect(result.command).toContain('--speculative-algorithm EAGLE3');
    });
  });

  describe('trt / trtllm alias', () => {
    it('treats trtllm as an alias for trt', () => {
      const result = buildLaunchCommand('trtllm', {
        model: 'm',
        precision: 'fp4',
        tp: 8,
      });
      expect(result.framework).toBe('trt');
      expect(result.command).toContain('trtllm-serve');
      expect(result.command).toContain('--tp_size 8');
    });

    it('builds a basic trt command', () => {
      const result = buildLaunchCommand('trt', {
        model: 'm',
        precision: 'fp4',
        tp: 4,
        ep: 4,
        conc: 16,
        isl: 1024,
        osl: 256,
      });
      expect(result.command).toContain('--backend pytorch');
      expect(result.command).toContain('--tp_size 4');
      expect(result.command).toContain('--ep_size 4');
      expect(result.command).toContain('--max_batch_size 16');
      expect(result.command).toContain('--max_seq_len 1280');
      expect(result.command).toContain('--kv_cache_dtype fp4');
    });

    it('emits --speculative_config={"decoding_type":...} for spec', () => {
      const result = buildLaunchCommand('trt', {
        model: 'm',
        precision: 'fp4',
        tp: 1,
        spec_decoding: 'mtp',
      });
      // The flag is a single token because --speculative_config=... has no
      // space separator. The shell quoter kicks in because of the curly braces.
      expect(result.command).toMatch(/--speculative_config=\{"decoding_type":"MTP"\}/);
    });
  });

  describe('disagg', () => {
    it('returns two commands for vllm disagg with separate prefill / decode TPs', () => {
      const result = buildLaunchCommand('vllm', {
        model: 'm',
        precision: 'fp8',
        tp: 8,
        disagg: true,
        prefill_tp: 4,
        prefill_num_workers: 2,
        num_prefill_gpu: 8,
        decode_tp: 16,
        decode_num_workers: 1,
        num_decode_gpu: 16,
      });
      expect(result.kind).toBe('disagg');
      expect(result.commands).toHaveLength(2);
      expect(result.commands?.[0].label).toContain('Prefill');
      expect(result.commands?.[0].command).toContain('--tensor-parallel-size 4');
      expect(result.commands?.[0].command).toContain('--disagg-role prefill');
      expect(result.commands?.[1].label).toContain('Decode');
      expect(result.commands?.[1].command).toContain('--tensor-parallel-size 16');
      expect(result.commands?.[1].command).toContain('--disagg-role decode');
    });

    it('uses --disaggregate_role for trt disagg', () => {
      const result = buildLaunchCommand('trt', {
        model: 'm',
        precision: 'fp4',
        tp: 8,
        disagg: true,
        prefill_tp: 4,
        decode_tp: 8,
      });
      expect(result.kind).toBe('disagg');
      expect(result.commands?.[0].command).toContain('--disaggregate_role prefill');
      expect(result.commands?.[1].command).toContain('--disaggregate_role decode');
    });

    it('falls back to top-level tp when prefill_tp/decode_tp missing', () => {
      const result = buildLaunchCommand('sglang', {
        model: 'm',
        precision: 'fp8',
        tp: 4,
        disagg: true,
      });
      expect(result.kind).toBe('disagg');
      expect(result.commands?.[0].command).toContain('--tp 4');
      expect(result.commands?.[1].command).toContain('--tp 4');
    });
  });

  describe('compound / orchestrator frameworks → fallback', () => {
    const compounds = [
      ['atom', /ATOM/],
      ['mori-sglang', /MoRI/],
      ['dynamo-vllm', /Dynamo vLLM/],
      ['dynamo-trt', /Dynamo TRT/],
      ['dynamo-sglang', /Dynamo SGLang/],
    ] as const;

    it.each(compounds)('returns kind="fallback" for %s', (fw, msgRe) => {
      const result = buildLaunchCommand(fw, {
        model: 'm',
        precision: 'fp8',
        tp: 8,
      });
      expect(result.kind).toBe('fallback');
      expect(result.framework).toBe(fw);
      expect(result.fallbackReason).toMatch(msgRe);
    });

    it('resolves the dynamo-trtllm alias before deciding fallback', () => {
      const result = buildLaunchCommand('dynamo-trtllm', {
        model: 'm',
        precision: 'fp8',
        tp: 8,
      });
      expect(result.kind).toBe('fallback');
      expect(result.framework).toBe('dynamo-trt');
    });
  });

  describe('unknown framework', () => {
    it('returns a fallback with a clear reason for unknown frameworks', () => {
      const result = buildLaunchCommand('made-up-framework', {
        model: 'm',
        precision: 'fp8',
        tp: 1,
      });
      expect(result.kind).toBe('fallback');
      expect(result.fallbackReason).toContain('made-up-framework');
    });
  });

  describe('placeholders for missing fields', () => {
    it('uses <model> and <precision> placeholders when omitted', () => {
      const result = buildLaunchCommand('vllm', { tp: 1 });
      expect(result.command).toContain('<model>');
      expect(result.command).toContain('<precision>');
    });
  });
});
