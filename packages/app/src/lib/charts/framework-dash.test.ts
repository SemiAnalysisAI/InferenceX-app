import { describe, expect, it } from 'vitest';

import { frameworkDasharray } from './framework-dash';

describe('frameworkDasharray', () => {
  it('keys the pattern on the serving framework', () => {
    expect(frameworkDasharray('b200_vllm')).toBe('none');
    expect(frameworkDasharray('b200_sglang')).toBe('5 3');
    expect(frameworkDasharray('h200_trt')).toBe('2 3');
    expect(frameworkDasharray('gb200_dynamo-vllm')).toBe('10 3');
    expect(frameworkDasharray('gb200_dynamo-sglang')).toBe('10 3 4 3');
    expect(frameworkDasharray('gb200_dynamo-trt')).toBe('10 3 2 3');
  });

  it('resolves aliases and skips non-framework parts', () => {
    expect(frameworkDasharray('gb300_dynamo-trtllm_mtp')).toBe('10 3 2 3');
    expect(frameworkDasharray('gb300_dynamo-trt_mtp')).toBe('10 3 2 3');
    expect(frameworkDasharray('vr200_coreweave-vera-rubin_dynamo-trt')).toBe('10 3 2 3');
    expect(frameworkDasharray('mi355x_sglang-disagg')).toBe(
      frameworkDasharray('mi355x_mori-sglang'),
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
    ].map((framework) => frameworkDasharray(`gb200_${framework}`));
    const amd = ['vllm', 'sglang', 'atom', 'mooncake-atom', 'mori-sglang', 'vllm-disagg'].map(
      (framework) => frameworkDasharray(`mi355x_${framework}`),
    );
    expect(new Set(nvidia).size).toBe(nvidia.length);
    expect(new Set(amd).size).toBe(amd.length);
  });

  it('leaves keys without a known framework to the default swatch', () => {
    expect(frameworkDasharray('b200')).toBeUndefined();
    expect(frameworkDasharray('h200-dgxc_normal_ep8')).toBeUndefined();
    expect(frameworkDasharray('b200_constructor')).toBeUndefined();
  });
});
