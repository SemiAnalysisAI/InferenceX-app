import { describe, expect, it } from 'vitest';

import { SERIES_LINE_PATTERNS, frameworkDasharray, legendSwatchDasharray } from './framework-dash';

describe('frameworkDasharray', () => {
  it('keys the pattern on the serving framework', () => {
    expect(frameworkDasharray('b200_vllm', true)).toBe('none');
    expect(frameworkDasharray('b200_sglang', true)).toBe('5 3');
    expect(frameworkDasharray('h200_trt', true)).toBe('2 3');
    expect(frameworkDasharray('gb200_dynamo-vllm', true)).toBe('10 3');
    expect(frameworkDasharray('gb200_dynamo-sglang', true)).toBe('10 3 4 3');
    expect(frameworkDasharray('gb200_dynamo-trt', true)).toBe('10 3 2 3');
  });

  it('resolves aliases and skips non-framework parts', () => {
    expect(frameworkDasharray('gb300_dynamo-trtllm_mtp', true)).toBe('10 3 2 3');
    expect(frameworkDasharray('gb300_dynamo-trt_mtp', true)).toBe('10 3 2 3');
    expect(frameworkDasharray('vr200_coreweave-vera-rubin_dynamo-trt', true)).toBe('10 3 2 3');
    expect(frameworkDasharray('mi355x_sglang-disagg', true)).toBe(
      frameworkDasharray('mi355x_mori-sglang', true),
    );
  });

  it('gives frameworks that share a chip family distinct patterns', () => {
    const nvidia = [
      'vllm',
      'sglang',
      'trt',
      'dynamo-vllm',
      'dynamo-sglang',
      'dynamo-trt',
      'llmd-vllm',
      'tokenspeed',
    ].map((framework) => frameworkDasharray(`gb200_${framework}`, true));
    const amd = ['vllm', 'sglang', 'atom', 'mooncake-atom', 'mori-sglang', 'vllm-disagg'].map(
      (framework) => frameworkDasharray(`mi355x_${framework}`, true),
    );
    expect(new Set(nvidia).size).toBe(nvidia.length);
    expect(new Set(amd).size).toBe(amd.length);
  });

  it('leaves keys without a known framework to the default swatch', () => {
    expect(frameworkDasharray('b200', true)).toBeUndefined();
    expect(frameworkDasharray('h200-dgxc_normal_ep8', true)).toBeUndefined();
    expect(frameworkDasharray('b200_constructor', true)).toBeUndefined();
  });
});

describe('series line patterns switch', () => {
  it('is off by default', () => {
    expect(SERIES_LINE_PATTERNS).toBe(false);
  });

  it('draws every framework solid when off', () => {
    expect(frameworkDasharray('b200_sglang')).toBeUndefined();
    expect(frameworkDasharray('gb200_dynamo-trt', false)).toBeUndefined();
  });

  it('keeps the line swatch only when on', () => {
    expect(legendSwatchDasharray('5 3', true)).toBe('5 3');
    expect(legendSwatchDasharray('none', true)).toBe('none');
    expect(legendSwatchDasharray(undefined, true)).toBeUndefined();
    expect(legendSwatchDasharray('5 3')).toBeUndefined();
    expect(legendSwatchDasharray('none', false)).toBeUndefined();
  });
});
