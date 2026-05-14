import { describe, it, expect } from 'vitest';

import { parseServerLogEnv } from './env-parser';

// Fixtures lifted from the live read-write DB fork (single representative
// preamble line per framework). Keep them minimal — the parser must work
// on a small slice, not require the full log.

describe('parseServerLogEnv', () => {
  describe('trt / dynamo-trt', () => {
    const log = [
      '/usr/local/lib/python3.12/dist-packages/torch/cuda/__init__.py:63: FutureWarning: …',
      'Skipping import of cpp extensions due to incompatible torch version 2.11.0a0+eb65b36914.nv26.02 for torchao version 0.15.0',
      '[TensorRT-LLM] TensorRT LLM version: 1.3.0rc11',
    ].join('\n');

    it('extracts the TensorRT-LLM version', () => {
      const env = parseServerLogEnv(log, 'trt');
      expect(env.frameworkVersion).toBe('1.3.0rc11');
    });

    it('treats dynamo-trt the same as trt', () => {
      const env = parseServerLogEnv(log, 'dynamo-trt');
      expect(env.frameworkVersion).toBe('1.3.0rc11');
    });

    it('captures torch + python versions across frameworks', () => {
      const env = parseServerLogEnv(log, 'trt');
      expect(env.torchVersion).toBe('2.11.0a0+eb65b36914.nv26.02');
      expect(env.pythonVersion).toBe('3.12');
    });
  });

  describe('vllm / dynamo-vllm', () => {
    const log = [
      '(APIServer pid=2163842) INFO 05-06 21:00:42 [utils.py:299]  ▄▄ ▄█ █     █     █ ▀▄▀ █  version 0.19.0',
      '(APIServer pid=2163842) INFO 05-06 21:00:42 [utils.py:233] non-default args: …',
    ].join('\n');

    it('extracts the vLLM version', () => {
      const env = parseServerLogEnv(log, 'vllm');
      expect(env.frameworkVersion).toBe('0.19.0');
    });

    it('treats dynamo-vllm the same as vllm', () => {
      const env = parseServerLogEnv(log, 'dynamo-vllm');
      expect(env.frameworkVersion).toBe('0.19.0');
    });
  });

  describe('sglang / atom (no version line today)', () => {
    const log = [
      '[2026-05-10 17:27:39] server_args=ServerArgs(model_path=…, tp_size=4, …)',
      'python3.10 site-packages …',
    ].join('\n');

    it('returns null framework version for sglang', () => {
      const env = parseServerLogEnv(log, 'sglang');
      expect(env.frameworkVersion).toBeNull();
    });

    it('returns null framework version for atom', () => {
      const env = parseServerLogEnv(log, 'atom');
      expect(env.frameworkVersion).toBeNull();
    });

    it('still captures python version', () => {
      const env = parseServerLogEnv(log, 'sglang');
      expect(env.pythonVersion).toBe('3.10');
    });
  });

  describe('contract', () => {
    it('always tags source = log_parse', () => {
      expect(parseServerLogEnv('', 'trt').source).toBe('log_parse');
      expect(parseServerLogEnv('arbitrary', 'sglang').source).toBe('log_parse');
    });

    it('returns all nulls (and extra={}) for an empty log', () => {
      const env = parseServerLogEnv('', 'trt');
      expect(env.frameworkVersion).toBeNull();
      expect(env.frameworkSha).toBeNull();
      expect(env.torchVersion).toBeNull();
      expect(env.pythonVersion).toBeNull();
      expect(env.cudaVersion).toBeNull();
      expect(env.rocmVersion).toBeNull();
      expect(env.driverVersion).toBeNull();
      expect(env.gpuSku).toBeNull();
      expect(env.extra).toEqual({});
    });

    it('never fills host-level fields from logs', () => {
      // Even when an nvidia-smi-shaped block accidentally appears in a log,
      // we deliberately do not parse it — logs are not authoritative for
      // these fields.
      const log = [
        '[TensorRT-LLM] TensorRT LLM version: 1.3.0rc11',
        'NVIDIA-SMI 550.54.15  Driver Version: 550.54.15  CUDA Version: 12.4',
      ].join('\n');
      const env = parseServerLogEnv(log, 'trt');
      expect(env.driverVersion).toBeNull();
      expect(env.cudaVersion).toBeNull();
      expect(env.gpuSku).toBeNull();
    });

    it('handles unknown framework keys gracefully', () => {
      const env = parseServerLogEnv('python3.11 something', 'someNewFramework');
      expect(env.frameworkVersion).toBeNull();
      expect(env.pythonVersion).toBe('3.11');
    });
  });
});
