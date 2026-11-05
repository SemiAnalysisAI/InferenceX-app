import { describe, expect, it } from 'vitest';

import type { InferenceData, OverlayData } from '@/components/inference/types';
import {
  generateGPUGraphTooltipContent,
  generateOverlayTooltipContent,
  generateTooltipContent,
  type TooltipConfig,
} from './tooltipUtils';

const point = (overrides: Partial<InferenceData> = {}): InferenceData =>
  ({
    id: 123,
    date: '2026-11-05',
    x: 196.123,
    y: 1_490_000_000,
    hwKey: 'gb300',
    framework: 'sglang',
    tp: 64,
    physicalChips: 64,
    conc: 10888,
    precision: 'fp4',
    benchmark_type: 'agentic_traces',
    disagg: true,
    is_multinode: true,
    prefill_tp: 2,
    prefill_ep: 2,
    prefill_dp_attention: true,
    prefill_num_workers: 16,
    num_prefill_gpu: 32,
    decode_tp: 32,
    decode_ep: 32,
    decode_dp_attention: true,
    decode_num_workers: 1,
    num_decode_gpu: 32,
    kv_offloading: 'dram',
    kv_offload_backend: 'hicache',
    server_gpu_cache_hit_rate: 0.707,
    server_cpu_cache_hit_rate: 0.242,
    theoretical_cache_hit_rate: 0.973,
    total_prompt_tokens: 566_443_844,
    total_generation_tokens: 4_180_360,
    ...overrides,
  }) as InferenceData;

const config = (overrides: Partial<TooltipConfig> = {}): TooltipConfig => ({
  data: point(),
  isPinned: true,
  xLabel: 'P90 Interactivity (tok/s/user)',
  yLabel: 'Total Tokens per $1 TCO (tok/$)',
  selectedYAxisMetric: 'y_costh',
  hardwareConfig: {},
  color: 'rgb(100, 150, 50)',
  ...overrides,
});

// Assert text only; do not insert generated markup into a document.
const text = (html: string) =>
  html
    .split(/<[^>]*>/u)
    .join('')
    .replaceAll(/\s+/gu, ' ');

const overlay = (cfg: TooltipConfig) =>
  generateOverlayTooltipContent({
    ...cfg,
    overlayData: { hardwareConfig: {}, label: 'test-run' } as OverlayData,
  });

describe.each([
  ['official', generateTooltipContent],
  ['historical', generateGPUGraphTooltipContent],
  ['unofficial', overlay],
] as const)('%s pinned details', (_name, render) => {
  it('groups role topology and explicit concurrency/precision without losing full values', () => {
    const html = render(config());
    const content = text(html);
    expect(content).toContain('Concurrency: 10,888');
    expect(content).toContain('Precision: FP4');
    expect(content).toContain('Chips TP EP DPA Workers');
    expect(content).toContain('Prefill 32 2 2 True 16');
    expect(content).toContain('Decode 32 32 32 True 1');
    expect(content).toContain('196.123');
    expect(content).toContain('566,443,844');
    expect(content).toContain('4,180,360');
    expect(html).not.toContain('monospace');
  });

  it('uses the shared cache bar with the series color and theoretical marker', () => {
    const html = render(config());
    const content = text(html);
    expect(html).toContain('data-pinned-cache');
    expect(html).toContain('data-hover-cache-bar');
    expect(html).toContain('background: rgb(100, 150, 50)');
    expect(html).toContain('left: calc(97.3% - 1px)');
    expect(content).toContain('94.9%');
    expect(content).toContain('Chip 70.7%');
    expect(content).toContain('CPU 24.2%');
    expect(content).toContain('theoretical 97.3%');
  });

  it('keeps combined TRT rates separate from a chip/CPU breakdown', () => {
    const content = text(render(config({ data: point({ framework: 'trt' }) })));
    expect(content).toContain('Chip + CPU 70.7%');
    expect(content).not.toContain('CPU 24.2%');
    expect(content).not.toContain('94.9%');
  });

  it('does not count disabled offload, and retains partial or zero measurements', () => {
    const disabled = text(render(config({ data: point({ kv_offloading: 'none' }) })));
    expect(disabled).not.toContain('CPU 24.2%');
    const partial = render(config({ data: point({ server_gpu_cache_hit_rate: undefined }) }));
    expect(partial).not.toContain('data-hover-cache-bar');
    expect(text(partial)).toContain('CPU Cache Hit Rate: 24.2%');
    expect(text(partial)).toContain('Theoretical Cache Hit Rate: 97.3%');
    const zero = render(config({ data: point({ server_gpu_cache_hit_rate: 0 }) }));
    expect(zero).toContain('data-hover-cache-bar');
    expect(text(zero)).toContain('Chip 0.0%');
  });

  it('preserves context parallelism and false string flags in role rows', () => {
    const content = text(
      render(
        config({
          data: point({
            is_multinode: false,
            prefill_pp: 2,
            prefill_dcp_size: 4,
            prefill_pcp_size: 8,
            prefill_dwdp_size: 2,
            prefill_dp_attention: 'false' as unknown as boolean,
            decode_dp_attention: false,
          }),
        }),
      ),
    );
    expect(content).toContain('Chips TP EP DPA Workers PP DCP PCP DWDP');
    expect(content).toContain('Prefill 32 2 2 False 16 2 4 8 2');
    expect(content).toContain('Decode 32 32 32 False 1');
  });

  it('keeps aggregate topology distinct and unknown role metadata unknown', () => {
    const aggregate = text(
      render(config({ data: point({ disagg: false, ep: 4, dp: 2, dp_attention: false }) })),
    );
    expect(aggregate).toContain('Multi-node aggregate');
    expect(aggregate).toContain('TP EP DPA DP');
    expect(aggregate).toContain('32 4 False 2');
    expect(aggregate).not.toContain('Prefill');
    const missing = text(
      render(
        config({
          data: point({ prefill_num_workers: undefined, prefill_dp_attention: undefined }),
        }),
      ),
    );
    expect(missing).toContain('Prefill 32 2 2 ? ?');
  });

  it('uses the existing Chinese labels', () => {
    const content = text(render(config({ locale: 'zh' })));
    expect(content).toContain('并发数： 10,888');
    expect(content).toContain('精度： FP4');
    expect(content).toContain('个芯片 TP EP DPA worker 数');
    expect(content).toContain('预填充 32 2 2 是 16');
    expect(content).toContain('KV cache 命中率');
    expect(content).toContain('理论 97.3%');
  });

  it('uses compact DEP labels without removing the raw configuration', () => {
    const html = render(config());
    expect(html).toContain('DEP2');
    expect(html).toContain('DEP32');
    expect(html).toContain('<details class="pinned-raw-topology">');
    const aggregate = render(
      config({
        data: point({
          disagg: false,
          tp: 4,
          decode_tp: 4,
          ep: 4,
          dp_attention: true,
        }),
      }),
    );
    expect(aggregate).toContain('DEP4');
  });

  it('draws the token split proportionally while keeping exact counts', () => {
    const html = render(
      config({ data: point({ total_prompt_tokens: 75, total_generation_tokens: 25 }) }),
    );
    expect(html).toContain('data-token-prompt style="width: 75%;"');
    expect(html).toContain('data-token-generated style="width: 25%;"');
    expect(html).toContain('Prompt Tokens: 75; Generated Tokens: 25');
    expect(html).toContain('class="pinned-token-count">75</span>');
    expect(html).toContain('class="pinned-token-count">25</span>');
  });

  it('does not invent token proportions for partial, invalid, or zero data', () => {
    for (const count of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(render(config({ data: point({ total_generation_tokens: count }) }))).not.toContain(
        'data-pinned-tokens',
      );
    }
    const zero = render(
      config({ data: point({ total_prompt_tokens: 0, total_generation_tokens: 0 }) }),
    );
    expect(zero).toContain('data-token-prompt style="width: 0%;"');
    expect(zero).toContain('data-token-generated style="width: 0%;"');
    expect(zero).not.toContain('NaN');
  });

  it('keeps the complete image digest escaped', () => {
    const image = `vendor/image@sha256:${'a'.repeat(64)}<img src=x>`;
    const html = render(config({ data: point({ image }) }));
    expect(html).toContain('a'.repeat(64));
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
  });
});
