import { describe, expect, it } from 'vitest';

import {
  cacheImplementationLabel,
  offloadTypeLabel,
  versionedComponentLabel,
} from './runtime-metadata-labels';

describe('runtime metadata labels', () => {
  it('normalizes known component names and preserves unknown names', () => {
    expect(cacheImplementationLabel('vllm-simple')).toBe('vLLM Simple');
    expect(cacheImplementationLabel('MOONCAKE')).toBe('Mooncake');
    expect(cacheImplementationLabel('custom-engine')).toBe('custom-engine');
  });

  it('combines independently reported component versions', () => {
    expect(versionedComponentLabel('lmcache', '0.5.1')).toBe('LMCache 0.5.1');
    expect(versionedComponentLabel('hicache', null)).toBe('HiCache');
    expect(versionedComponentLabel(null, 'ignored')).toBeNull();
  });

  it('formats DRAM and other offload types consistently', () => {
    expect(offloadTypeLabel('dram')).toBe('DRAM');
    expect(offloadTypeLabel('cpu')).toBe('CPU');
  });
});
