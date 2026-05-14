import { describe, it, expect } from 'vitest';

import { readEnvJson } from './env-json-reader';

describe('readEnvJson', () => {
  it('parses a full env.json into ParsedEnv with source = env_json', () => {
    const text = JSON.stringify({
      framework: 'sglang',
      framework_version: '0.4.3.post2',
      framework_sha: 'e136d70cdc6101007017c05d57fb4cec5d6ed98f',
      image: 'lmsysorg/sglang:latest',
      torch: '2.5.1+cu124',
      python: '3.12.7',
      cuda: '12.4',
      rocm: null,
      driver: '560.35.03',
      gpu_sku: 'NVIDIA H100 80GB HBM3',
    });
    const env = readEnvJson(text);
    expect(env).toEqual({
      source: 'env_json',
      frameworkVersion: '0.4.3.post2',
      frameworkSha: 'e136d70cdc6101007017c05d57fb4cec5d6ed98f',
      torchVersion: '2.5.1+cu124',
      pythonVersion: '3.12.7',
      cudaVersion: '12.4',
      rocmVersion: null,
      driverVersion: '560.35.03',
      gpuSku: 'NVIDIA H100 80GB HBM3',
      extra: {},
    });
  });

  it('handles AMD-style env.json (rocm set, cuda null)', () => {
    const env = readEnvJson(
      JSON.stringify({
        framework: 'sglang',
        rocm: '6.2.0',
        driver: '6.7.0',
        gpu_sku: 'AMD Instinct MI355X',
      }),
    );
    expect(env.rocmVersion).toBe('6.2.0');
    expect(env.cudaVersion).toBeNull();
    expect(env.gpuSku).toBe('AMD Instinct MI355X');
  });

  it('treats missing fields as null', () => {
    const env = readEnvJson('{}');
    expect(env.source).toBe('env_json');
    expect(env.frameworkVersion).toBeNull();
    expect(env.frameworkSha).toBeNull();
    expect(env.torchVersion).toBeNull();
    expect(env.pythonVersion).toBeNull();
    expect(env.cudaVersion).toBeNull();
    expect(env.rocmVersion).toBeNull();
    expect(env.driverVersion).toBeNull();
    expect(env.gpuSku).toBeNull();
  });

  it('treats empty strings the same as null', () => {
    const env = readEnvJson(JSON.stringify({ cuda: '', driver: '   ' }));
    expect(env.cudaVersion).toBeNull();
    expect(env.driverVersion).toBeNull();
  });

  it('captures unknown fields on extra', () => {
    const env = readEnvJson(
      JSON.stringify({
        framework_version: '1.0',
        nccl_version: '2.21.5',
        kernel: '6.5.0-generic',
      }),
    );
    expect(env.extra).toEqual({
      nccl_version: '2.21.5',
      kernel: '6.5.0-generic',
    });
  });

  it('throws on non-object input', () => {
    expect(() => readEnvJson('[]')).toThrow(/must be a JSON object/u);
    expect(() => readEnvJson('"foo"')).toThrow();
    expect(() => readEnvJson('42')).toThrow();
  });

  it('throws on malformed JSON', () => {
    expect(() => readEnvJson('{ not json')).toThrow();
  });
});
