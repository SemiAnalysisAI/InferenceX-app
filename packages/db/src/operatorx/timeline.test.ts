import { describe, expect, it } from 'bun:test';

import { compactTimeline, kernelCategory, withoutHarnessFlush } from './timeline';

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

describe('withoutHarnessFlush', () => {
  const gemm = 'nvjet_sm103_tst_64x8_64x16_4x1_v_bz_splitK_TNT';
  const reduce = 'cublasLt::splitKreduce_kernel<32, 16, int, float, __nv_bfloat16>';
  const memset = 'Memset (Device)';
  // A B300 GEMM case on torch 2.16: 12.3 us latency, an 84 us flush closing the replay.
  const leaked = {
    iters: 3,
    span_us: 94.369,
    busy_us: 92.161,
    gap_us: 2.208,
    overlap_us: 1.024,
    kernels: [
      { name: memset, cat: 'gpu_memset', count_per_call: 1, us_per_call: 84.875 },
      { name: gemm, cat: 'kernel', count_per_call: 1, us_per_call: 6.304 },
      { name: reduce, cat: 'kernel', count_per_call: 1, us_per_call: 3.307 },
    ],
    timeline: [
      { name: gemm, stream: 7, start_us: 0, dur_us: 5.76 },
      { name: reduce, stream: 7, start_us: 4.736, dur_us: 3.136 },
      { name: memset, stream: 7, start_us: 10.08, dur_us: 84.289 },
    ],
  };

  it('drops a flush the profiler left in and re-times the replay', () => {
    const timeline = compactTimeline({ profile: leaked })!;
    expect(timeline.names).toEqual([gemm, reduce]);
    expect(timeline.events).toEqual([
      [0, 0, 0, 5.76],
      [1, 0, 4.736, 3.136],
    ]);
    expect(timeline.kernels.map((k) => k.usPerCall)).toEqual([6.304, 3.307]);
    expect(timeline).toMatchObject({
      spanUs: 7.872,
      busyUs: 7.872,
      gapUs: 0,
      overlapUs: 1.024,
      truncated: false,
    });
  });

  it("keeps the op's own memsets when the profiler took its fills for the flush", () => {
    // A B200 attention case: two of the op's fill kernels were excluded instead.
    const profile = withoutHarnessFlush({
      ...leaked,
      flush_kernels_excluded: 2,
      kernels: [
        { name: memset, cat: 'gpu_memset', count_per_call: 2, us_per_call: 91.712 },
        { name: gemm, cat: 'kernel', count_per_call: 1, us_per_call: 6.304 },
      ],
      timeline: [
        { name: gemm, stream: 7, start_us: 0, dur_us: 5.76 },
        { name: memset, stream: 7, start_us: 21.856, dur_us: 2.24 },
        { name: memset, stream: 7, start_us: 45.663, dur_us: 89.44 },
      ],
    });
    expect(profile.kernels).toEqual([
      { name: gemm, cat: 'kernel', count_per_call: 1, us_per_call: 6.304 },
      { name: memset, cat: 'gpu_memset', count_per_call: 1, us_per_call: 2.24 },
    ]);
    expect(profile).toMatchObject({ span_us: 24.096, busy_us: 8, gap_us: 16.096 });
  });

  it('drops the flush from the kernels when the final replay is the one shown', () => {
    const profile = withoutHarnessFlush({ ...leaked, timeline: leaked.timeline.slice(0, 2) });
    expect(profile.kernels).toEqual(leaked.kernels.slice(1));
    expect(profile.span_us).toBe(leaked.span_us);
  });

  it('leaves a profile alone when every flush was excluded or it has no memset', () => {
    // torch 2.14: the fill kernel was excluded, and the memset is the op's own.
    const clean = { ...leaked, flush_kernels_excluded: 3 };
    expect(withoutHarnessFlush(clean)).toBe(clean);
    const xla = { iters: 20, kernels: [{ name: '%fusion.1', count_per_call: 1 }], timeline: [] };
    expect(withoutHarnessFlush(xla)).toBe(xla);
  });
});
