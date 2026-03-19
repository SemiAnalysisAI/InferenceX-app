import { describe, it, expect } from 'vitest';
import { configCacheKey, type ConfigParams } from './config-cache';

function makeConfig(overrides: Partial<ConfigParams> = {}): ConfigParams {
  return {
    hardware: 'h200',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp8',
    specMethod: 'none',
    disagg: false,
    isMultinode: false,
    prefillTp: 8,
    prefillEp: 1,
    prefillDpAttn: false,
    prefillNumWorkers: 0,
    decodeTp: 8,
    decodeEp: 1,
    decodeDpAttn: false,
    decodeNumWorkers: 0,
    numPrefillGpu: 8,
    numDecodeGpu: 8,
    ...overrides,
  };
}

describe('configCacheKey', () => {
  it('produces a colon-joined string of all config fields', () => {
    const key = configCacheKey(makeConfig());
    expect(key).toBe('h200:vllm:dsr1:fp8:none:false:false:8:1:false:0:8:1:false:0:8:8');
  });

  it('is deterministic — same input produces same output', () => {
    const a = configCacheKey(makeConfig());
    const b = configCacheKey(makeConfig());
    expect(a).toBe(b);
  });

  it('differs when any single field changes', () => {
    const base = configCacheKey(makeConfig());

    // Change each field and verify the key is different
    expect(configCacheKey(makeConfig({ hardware: 'mi355x' }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ framework: 'sglang' }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ model: 'llama70b' }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ precision: 'fp4' }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ specMethod: 'eagle' }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ disagg: true }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ isMultinode: true }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ prefillTp: 4 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ prefillEp: 2 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ prefillDpAttn: true }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ prefillNumWorkers: 1 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ decodeTp: 4 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ decodeEp: 2 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ decodeDpAttn: true }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ decodeNumWorkers: 1 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ numPrefillGpu: 4 }))).not.toBe(base);
    expect(configCacheKey(makeConfig({ numDecodeGpu: 4 }))).not.toBe(base);
  });

  it('includes all 17 fields in the key', () => {
    const key = configCacheKey(makeConfig());
    // 17 fields = 16 colons
    expect(key.split(':').length).toBe(17);
  });

  it('handles boolean fields correctly', () => {
    const keyFalse = configCacheKey(makeConfig({ disagg: false }));
    const keyTrue = configCacheKey(makeConfig({ disagg: true }));
    expect(keyFalse).toContain('false');
    expect(keyTrue).toContain('true');
    expect(keyFalse).not.toBe(keyTrue);
  });
});
