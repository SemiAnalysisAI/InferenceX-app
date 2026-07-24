import { describe, expect, it } from 'vitest';

import { isKvOffloadEnabled } from './kv-offload';

describe('isKvOffloadEnabled', () => {
  it.each([
    [{ kv_offloading: 'dram', offload_mode: 'off' }, true],
    [{ kv_offloading: 'none', offload_mode: 'on' }, false],
    [{ kv_offloading: ' DRAM ' }, true],
    [{ offload_mode: 'on' }, true],
    [{ offload_mode: 'off' }, false],
    [{}, false],
  ] as const)('resolves %o to %s', (state, expected) => {
    expect(isKvOffloadEnabled(state)).toBe(expected);
  });
});
