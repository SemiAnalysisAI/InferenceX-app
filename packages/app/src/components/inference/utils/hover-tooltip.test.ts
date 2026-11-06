// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import {
  formatHoverValue,
  generateHoverTooltipContent,
  generateTooltipContent,
  shortAxisLabel,
  type HoverTooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

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

const config = (
  data: InferenceData,
  overrides: Partial<HoverTooltipConfig> = {},
): HoverTooltipConfig => ({
  data,
  xLabel: 'P90 Interactivity (tok/s/user)',
  yLabel: 'Total Tokens per $1 TCO (tok/$)',
  selectedYAxisMetric: 'y_costh',
  hardwareConfig,
  color: 'rgb(156, 204, 101)',
  ...overrides,
});

// Read the generated markup as plain text without handing it to an HTML parser.
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};
const render = (html: string) => ({
  // Text between tags only; the result is asserted on, never rendered.
  textContent: html
    .split(/<[^>]*>/)
    .join('')
    .replaceAll(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity),
  hasCacheBar: html.includes('data-hover-cache-bar'),
});

describe('formatHoverValue', () => {
  it('abbreviates large values and trims small ones', () => {
    expect(formatHoverValue(31_264_799.83)).toBe('31.26M');
    expect(formatHoverValue(1_550_000_000)).toBe('1.55B');
    expect(formatHoverValue(45_678)).toBe('45.7K');
    expect(formatHoverValue(144.092)).toBe('144');
    expect(formatHoverValue(39.308)).toBe('39.3');
    expect(formatHoverValue(0.8512)).toBe('0.85');
  });

  it('keeps watt metrics as whole watts', () => {
    expect(formatHoverValue(893.079, 'y_measuredAvgPower')).toBe('893');
  });
});

describe('shortAxisLabel', () => {
  it('keeps the unit and a leading percentile qualifier', () => {
    expect(shortAxisLabel('P90 Interactivity (tok/s/user)')).toBe('P90 tok/s/user');
    expect(shortAxisLabel('Total Tokens per $1 TCO (tok/$)')).toBe('tok/$');
    expect(shortAxisLabel('Median TTFT (s)')).toBe('Median s');
    expect(shortAxisLabel('P99.9 TTFT (s)')).toBe('P99.9 s');
    expect(shortAxisLabel('p99.9 E2E Latency (s)')).toBe('p99.9 s');
  });

  it('handles full-width parentheses and labels without a unit', () => {
    expect(shortAxisLabel('P90 交互性（tok/s/user）')).toBe('P90 tok/s/user');
    expect(shortAxisLabel('Concurrency')).toBe('Concurrency');
  });
});

describe('generateHoverTooltipContent', () => {
  it('shows the headline values, compact config and cache bar', () => {
    const el = render(generateHoverTooltipContent(config(agenticPoint())));
    const text = el.textContent.replaceAll(/\s+/g, ' ');
    expect(text).toContain('B300 (SGLang)');
    expect(text).toContain('FP4 · conc 40');
    expect(text).toContain('31.26M tok/$');
    expect(text).toContain('39.3 P90 tok/s/user');
    expect(text).toContain('8 chips');
    expect(text).toContain('DFlash');
    expect(text).toContain('KV cache hit · HiCache → DRAM');
    expect(text).toContain('94.9%');
    expect(text).toContain('Chip 70.7%');
    expect(text).toContain('CPU 24.2%');
    expect(text).toContain('theoretical 97.3%');
    expect(text).toContain('Click for full details');
    expect(el.hasCacheBar).toBe(true);
  });

  it('leaves pinned-only details out of the hover card', () => {
    const text = render(generateHoverTooltipContent(config(agenticPoint()))).textContent;
    expect(text).not.toContain('sha256');
    expect(text).not.toContain('566,443,844');
    expect(text).not.toContain('RadixArk');
    expect(text).not.toContain('GitHub Actions');
  });

  it('keeps comparison dates and carried-forward source dates in compact hover', () => {
    const html = generateHoverTooltipContent(
      config(agenticPoint({ date: '2026-11-04', actualDate: '2026-11-02' }), {
        comparisonLabel: '2026-11-04',
        color: '#123456',
      }),
    );
    expect(render(html).textContent).toContain('Date: 2026-11-04 (data from 2026-11-02)');
    expect(html).toContain('background: #123456');
    expect(html).toContain('data-hover-cache-bar');
    expect(html).not.toContain('sha256');
  });

  it('preserves same-day run numbering without a misleading source-date note', () => {
    const text = render(
      generateHoverTooltipContent(
        config(agenticPoint({ date: '2026-11-04~r123', actualDate: '2026-11-04' }), {
          comparisonLabel: '2026-11-04 #2',
        }),
      ),
    ).textContent;
    expect(text).toContain('Date: 2026-11-04 #2');
    expect(text).not.toContain('~r123');
    expect(text).not.toContain('data from');
  });

  it('localizes comparison context and preserves unofficial provenance safely', () => {
    const html = generateHoverTooltipContent(
      config(agenticPoint({ date: '2026-11-04', actualDate: '2026-11-02' }), {
        locale: 'zh',
        comparisonLabel: '2026-11-04',
        overlayData: { label: 'feat/<script>test</script>' } as OverlayData,
      }),
    );
    expect(render(html).textContent).toContain('日期： 2026-11-04');
    expect(render(html).textContent).toContain('2026年11月2日');
    expect(html).toContain('data-hover-notice');
    expect(html).toContain('feat/&lt;script&gt;test&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('keeps every field in the pinned tooltip', () => {
    const text = render(
      generateTooltipContent({
        data: agenticPoint(),
        isPinned: true,
        xLabel: 'P90 Interactivity (tok/s/user)',
        yLabel: 'Total Tokens per $1 TCO (tok/$)',
        selectedYAxisMetric: 'y_costh',
        hardwareConfig,
      }),
    ).textContent;
    expect(text).toContain('Prompt Tokens');
    expect(text).toContain('theoretical 97.3%');
    expect(text).toContain('RadixArk/Kimi-K3.1-Dflash2-Preview');
  });

  it('omits the cache section when no hit rate was recorded', () => {
    const el = render(
      generateHoverTooltipContent(
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
      ),
    );
    expect(el.hasCacheBar).toBe(false);
    expect(el.textContent).not.toContain('KV cache hit');
  });

  it('drops the CPU segment when offload is off', () => {
    const text = render(
      generateHoverTooltipContent(
        config(
          agenticPoint({
            kv_offloading: 'none',
            kv_offload_backend: undefined,
            offload_mode: 'off',
          }),
        ),
      ),
    ).textContent.replaceAll(/\s+/g, ' ');
    expect(text).toContain('Chip 70.7%');
    expect(text).not.toContain('CPU 24.2%');
    expect(text).toContain('70.7%');
  });

  it('labels the TRT-LLM combined chip + CPU rate as one segment', () => {
    const text = render(
      generateHoverTooltipContent(config(agenticPoint({ framework: 'trt' }))),
    ).textContent.replaceAll(/\s+/g, ' ');
    expect(text).toContain('Chip + CPU 70.7%');
    expect(text).not.toContain('CPU 24.2%');
  });

  it('renders Chinese copy', () => {
    const text = render(
      generateHoverTooltipContent(
        config(agenticPoint(), {
          locale: 'zh',
          xLabel: 'P90 交互性（tok/s/user）',
          yLabel: '每 $1 TCO 总 token 数（tok/$）',
        }),
      ),
    ).textContent.replaceAll(/\s+/g, ' ');
    expect(text).toContain('并发 40');
    expect(text).toContain('8 芯片');
    expect(text).toContain('KV cache 命中率');
    expect(text).toContain('理论 97.3%');
    expect(text).toContain('点击查看完整信息');
  });

  it('escapes the hardware key when no config entry exists', () => {
    const html = generateHoverTooltipContent(
      config(agenticPoint({ hwKey: '<img src=x>' as never }), { hardwareConfig: {} }),
    );
    expect(html).not.toContain('<img src=x>');
  });
});
