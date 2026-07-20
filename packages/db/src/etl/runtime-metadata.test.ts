import { describe, expect, it } from 'vitest';

import { extractRuntimeMetadata } from './runtime-metadata';

describe('extractRuntimeMetadata', () => {
  it('normalizes current component objects and preserves versions', () => {
    expect(
      extractRuntimeMetadata({
        kv_offloading: ' dram ',
        kv_offload_backend: { name: 'mooncake', version: '0.3.11.post1' },
        kv_p2p_transfer: 'mori',
        router: { name: 'sglang-router', version: '0.3.2' },
      }),
    ).toEqual({
      kv_offloading: 'dram',
      kv_offload_backend: 'mooncake',
      kv_offload_backend_version: '0.3.11.post1',
      kv_p2p_transfer: 'mori',
      router_name: 'sglang-router',
      router_version: '0.3.2',
    });
  });

  it('accepts legacy backend strings and ignores empty or malformed components', () => {
    expect(
      extractRuntimeMetadata({
        kv_offload_backend: 'hicache',
        kv_p2p_transfer: '',
        router: { name: '', version: '0.1.14' },
      }),
    ).toEqual({ kv_offload_backend: 'hicache' });
  });
});
