import { describe, expect, it } from 'bun:test';

import { compactTimeline, kernelCategory } from './timeline';

describe('kernelCategory', () => {
  it('keeps GPU kernel names on their name rules', () => {
    expect(kernelCategory('nvjet_tst_128x64_64x8_2x1_v_bz_TNT')).toBe('gemm');
    expect(kernelCategory('fused_moe_kernel')).toBe('expert-gemm');
    expect(kernelCategory('splitKreduce_kernel')).toBe('reduce');
    expect(kernelCategory('some_unknown_kernel')).toBe('other');
  });

  it('matches an XLA op by its own name, not the operands it lists', () => {
    // The operand `%abs_reduce_fusion` must not make this matmul a reduction.
    const matmul =
      '%fusion.1 = bf16[4,6144]{1,0} fusion(f8e4m3fn[4,2048]{1,0} %abs_reduce_fusion, f8e4m3fn[2048,6144]{1,0} %Arg_0.1)';
    expect(kernelCategory(matmul, 'convolution fusion')).toBe('gemm');
    expect(
      kernelCategory(
        '%abs_reduce_fusion = bf16[4]{0} fusion(bf16[4,2048]{1,0} %Arg_2.1)',
        'loop fusion',
      ),
    ).toBe('reduce');
    expect(
      kernelCategory(
        '%router_topk.1 = (f32[1024,16]{1,0}) custom-call(f32[1024,896]{1,0} %x)',
        'custom-call',
      ),
    ).toBe('routing');
    // A grouped-matmul custom call is the routed experts, even cut before its ` = `.
    expect(
      kernelCategory('%gmm_v2-g_896-m_16384-k_3584-act_situ_4.0_25.0-n_768-tm_256', 'custom-call'),
    ).toBe('expert-gemm');
  });

  it('falls back to the HLO category, then other', () => {
    expect(
      kernelCategory(
        '%fusion.10 = bf16[16384,16384]{1,0} fusion(u16[16384,16384]{1,0} %rng)',
        'loop fusion',
      ),
    ).toBe('memory');
    expect(
      kernelCategory(
        '%all-reduce.2 = bf16[1024,7168]{1,0} all-reduce(bf16[1024,7168]{1,0} %f)',
        'all-reduce',
      ),
    ).toBe('reduce');
    expect(
      kernelCategory(
        '%reshape.62 = f32[1024,16]{1,0} reshape(f32[16384]{0} %g)',
        'data formatting',
      ),
    ).toBe('memory');
    expect(
      kernelCategory('%custom-call = u32[2]{0} custom-call(u64[2]{0} %Arg_0.1)', 'custom-call'),
    ).toBe('other');
    expect(kernelCategory('%fusion.3 = bf16[8,8]{1,0} fusion(bf16[8,8]{1,0} %a)')).toBe('other');
  });
});

describe('compactTimeline on an XLA profile', () => {
  it('categorizes cut-off timeline events by their op name in the kernel list', () => {
    const op =
      '%fusion.28 = bf16[16,3584]{1,0:T(8,128)(2,1)S(1)} fusion(bf16[16,7168]{1,0} %copy-done, bf16[7168,3584]{1,0} %Arg_1.1), kind=kOutput';
    const timeline = compactTimeline({
      profile: {
        span_us: 4,
        timeline: [
          { name: op.slice(0, 60), stream: 'XLA Ops', start_us: 0, dur_us: 3 },
          {
            name: '%copy-start.2 = (bf16[3584]{0}, bf16[3584]{0}) copy-start(bf16[3584]{0} %p)',
            stream: 'Async XLA Ops',
            start_us: 3,
            dur_us: 1,
          },
        ],
        kernels: [
          // A 1-in-20 cache flush in another module reuses the op name as a loop fusion.
          {
            name: '%fusion.28 = bf16[16384,16384]{1,0} fusion(u16[16384,16384]{1,0} %rng)',
            hlo_category: 'loop fusion',
            count_per_call: 0.05,
            us_per_call: 5,
          },
          { name: op, hlo_category: 'convolution fusion', count_per_call: 1, us_per_call: 3 },
        ],
      },
    });
    const category = (prefix: string) =>
      timeline!.categories[timeline!.names.findIndex((n) => n.startsWith(prefix))];
    expect(category('%fusion.28 = bf16[16,3584]')).toBe('gemm');
    expect(category('%copy-start.2')).toBe('memory');
  });
});
