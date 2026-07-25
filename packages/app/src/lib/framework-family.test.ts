import { describe, expect, it } from 'vitest';

import { frameworkFamily } from './framework-family';

describe('frameworkFamily', () => {
  it('maps base and variant engines to their family', () => {
    expect(frameworkFamily('vllm')).toBe('vllm');
    expect(frameworkFamily('dynamo-vllm')).toBe('vllm');
    expect(frameworkFamily('sglang')).toBe('sglang');
    expect(frameworkFamily('mori-sglang')).toBe('sglang');
    expect(frameworkFamily('trt')).toBe('trt');
    expect(frameworkFamily('trtllm')).toBe('trt');
    expect(frameworkFamily('dynamo-trt')).toBe('trt');
    expect(frameworkFamily('atom')).toBe('atom');
    expect(frameworkFamily('mooncake-atom')).toBe('atom');
  });

  it('returns undefined for unknown or missing frameworks', () => {
    expect(frameworkFamily('mystery-engine')).toBeUndefined();
    expect(frameworkFamily(undefined)).toBeUndefined();
  });
});
