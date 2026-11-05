// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import {
  buildPointDetails,
  generatePointHoverCard,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';
import { detailsText } from '@/components/inference/utils/point-details-test-helpers';
import { axisLabelUnit } from '@/lib/d3-chart/tooltip-shell';

const hardwareConfig: HardwareConfig = {
  b300_sglang: {
    name: 'b300_sglang',
    label: 'B300',
    suffix: '(SGLang)',
    gpu: 'B300',
  },
};

function agenticPoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2026-11-04',
    x: 39.308,
    y: 31_264_799.83,
    tp: 8,
    ep: 2,
    decode_dcp_size: 8,
    prefill_dcp_size: 8,
    conc: 40,
    hwKey: 'b300_sglang',
    framework: 'sglang',
    precision: 'fp4',
    benchmark_type: 'agentic_traces',
    image: 'lmsysorg/sglang:dev-kimi-k31-pro@sha256:67fc77d',
    spec_decoding: 'dflash',
    spec_algorithm: 'dflash',
    spec_draft_model: 'RadixArk/Kimi-K3.1-Dflash2-Preview',
    kv_offloading: 'dram',
    kv_offload_backend: 'hicache',
    offload_mode: 'on',
    server_gpu_cache_hit_rate: 0.707,
    server_cpu_cache_hit_rate: 0.242,
    theoretical_cache_hit_rate: 0.973,
    total_prompt_tokens: 566_443_844,
    total_generation_tokens: 4_180_360,
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const config = (data: InferenceData, overrides: Partial<TooltipConfig> = {}): TooltipConfig => ({
  data,
  xLabel: 'P90 Interactivity (tok/s/user)',
  yLabel: 'Total Tokens per $1 TCO (tok/$)',
  selectedYAxisMetric: 'y_costh',
  hardwareConfig,
  ...overrides,
});

const hover = (c: TooltipConfig) => {
  const host = document.createElement('div');
  host.innerHTML = generatePointHoverCard(buildPointDetails(c), 'rgb(156, 204, 101)');
  return {
    text: (host.textContent ?? '').replaceAll(/\s+/g, ' '),
    hasCacheBar: host.querySelector('[data-hover-cache-bar]') !== null,
  };
};

describe('axisLabelUnit', () => {
  it('keeps the unit and a leading percentile qualifier', () => {
    expect(axisLabelUnit('P90 Interactivity (tok/s/user)')).toBe('P90 tok/s/user');
    expect(axisLabelUnit('Total Tokens per $1 TCO (tok/$)')).toBe('tok/$');
    expect(axisLabelUnit('Median TTFT (s)')).toBe('Median s');
    expect(axisLabelUnit('P99.9 TTFT (s)')).toBe('P99.9 s');
    expect(axisLabelUnit('p99.9 E2E Latency (s)')).toBe('p99.9 s');
  });

  it('handles full-width parentheses and labels without a unit', () => {
    expect(axisLabelUnit('P90 交互性（tok/s/user）')).toBe('P90 tok/s/user');
    expect(axisLabelUnit('Concurrency')).toBe('Concurrency');
  });
});

describe('generatePointHoverCard', () => {
  it('shows compact headline values, the speculative algorithm and the cache bar', () => {
    const { text, hasCacheBar } = hover(config(agenticPoint()));
    expect(text).toContain('B300 SGLang · FP4');
    expect(text).toContain('31.3M');
    expect(text).toContain('P90 tok/s/user');
    expect(text).toContain('39.3');
    expect(text).toContain('conc 40 · 8 chips · DFlash');
    expect(text).toContain('KV cache hit · HiCache → DRAM');
    expect(text).toContain('94.9%');
    expect(text).toContain('Chip 70.7%');
    expect(text).toContain('CPU 24.2%');
    expect(text).toContain('theoretical 97.3%');
    expect(hasCacheBar).toBe(true);
  });

  it('leaves the draft model, image and token counts to the details panel', () => {
    const { text } = hover(config(agenticPoint()));
    expect(text).not.toContain('sha256');
    expect(text).not.toContain('RadixArk');
    const details = detailsText(config(agenticPoint()));
    expect(details).toContain('DFlash (RadixArk/Kimi-K3.1-Dflash2-Preview)');
    expect(details).toContain('Theoretical cache hit rate');
  });

  it('shows the speculative row in the details panel for non-agentic points that use it', () => {
    const details = detailsText(config(agenticPoint({ benchmark_type: 'single_turn' })));
    expect(details).toContain('Speculative decoding: DFlash (RadixArk/Kimi-K3.1-Dflash2-Preview)');
    const off = detailsText(
      config(agenticPoint({ benchmark_type: 'single_turn', spec_decoding: 'none' })),
    );
    expect(off).not.toContain('Speculative decoding');
  });

  it('omits the cache section when no hit rate was recorded', () => {
    const { text, hasCacheBar } = hover(
      config(
        agenticPoint({
          benchmark_type: 'single_turn',
          server_gpu_cache_hit_rate: undefined,
          server_cpu_cache_hit_rate: undefined,
          theoretical_cache_hit_rate: undefined,
          kv_offloading: undefined,
          kv_offload_backend: undefined,
          offload_mode: undefined,
          spec_decoding: 'none',
          spec_algorithm: undefined,
        }),
      ),
    );
    expect(hasCacheBar).toBe(false);
    expect(text).not.toContain('KV cache hit');
    expect(text).not.toContain('DFlash');
  });

  it('drops the CPU segment when offload is off', () => {
    const { text } = hover(
      config(
        agenticPoint({ kv_offloading: 'none', kv_offload_backend: undefined, offload_mode: 'off' }),
      ),
    );
    expect(text).toContain('Chip 70.7%');
    expect(text).not.toContain('CPU 24.2%');
  });

  it('labels the TRT-LLM combined chip + CPU rate as one segment', () => {
    const { text } = hover(config(agenticPoint({ framework: 'trt' })));
    expect(text).toContain('Chip + CPU 70.7%');
    expect(text).not.toContain('CPU 24.2%');
  });

  it('renders Chinese copy', () => {
    const { text } = hover(
      config(agenticPoint(), {
        locale: 'zh',
        xLabel: 'P90 交互性（tok/s/user）',
        yLabel: '每 $1 TCO 总 token 数（tok/$）',
      }),
    );
    expect(text).toContain('并发 40');
    expect(text).toContain('P90 tok/s/user');
    expect(text).toContain('KV Cache 命中率');
    expect(text).toContain('理论 97.3%');
  });

  it('escapes the hardware key when no config entry exists', () => {
    const html = generatePointHoverCard(
      buildPointDetails(
        config(agenticPoint({ hwKey: '<img src=x>' as never }), { hardwareConfig: {} }),
      ),
      'red',
    );
    expect(html).not.toContain('<img src=x>');
  });
});
