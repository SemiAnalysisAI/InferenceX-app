import { describe, it, expect } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import {
  getPointLabel,
  generateTooltipContent,
  generateOverlayTooltipContent,
  generateGPUGraphTooltipContent,
  theoreticalPrefixTokens,
  uncachedInputTokens,
  type TooltipConfig,
  type OverlayTooltipConfig,
} from '@/components/inference/utils/tooltipUtils';

// ---------------------------------------------------------------------------
// fixture factories
// ---------------------------------------------------------------------------
function pt(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const mockHardwareConfig: HardwareConfig = {
  h100: {
    name: 'h100',
    label: 'H100',
    suffix: '',
    gpu: 'H100',
    color: 'red',
    power: 700,
    costh: 2.8,
    costn: 1.4,
    costr: 0.7,
  },
  b200: {
    name: 'b200',
    label: 'B200',
    suffix: '(TRTLLM)',
    gpu: 'B200',
    color: 'blue',
    power: 1000,
    costh: 5,
    costn: 2.5,
    costr: 1.25,
  },
} as unknown as HardwareConfig;

function tooltipConfig(overrides: Partial<TooltipConfig> = {}): TooltipConfig {
  return {
    data: pt(),
    isPinned: false,
    xLabel: 'E2E Latency (ms)',
    yLabel: 'Throughput per Chip',
    selectedYAxisMetric: 'y_tpPerGpu',
    hardwareConfig: mockHardwareConfig,
    ...overrides,
  };
}

// ===========================================================================
// getPointLabel
// ===========================================================================
describe('getPointLabel', () => {
  it('returns tp as string when no ep field', () => {
    expect(getPointLabel(pt({ tp: 8 }))).toBe('8');
  });

  it('returns "TEP8" when tp === ep and dp_attention is false', () => {
    expect(getPointLabel(pt({ tp: 8, ep: 8, dp_attention: false }))).toBe('TEP8');
  });

  it('returns "DEP8" when tp === ep and dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 8, ep: 8, dp_attention: true }))).toBe('DEP8');
  });

  it('returns "EP4" when ep > 1 and ep !== tp', () => {
    expect(getPointLabel(pt({ tp: 2, ep: 4 }))).toBe('EP4');
  });

  it('returns "DPAEP4" when ep > 1, ep !== tp, dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 2, ep: 4, dp_attention: true }))).toBe('DPAEP4');
  });

  it('returns "TP4" when ep is 1', () => {
    expect(getPointLabel(pt({ tp: 4, ep: 1 }))).toBe('TP4');
  });

  it('includes DCP and PCP in the point label when non-default', () => {
    expect(
      getPointLabel(
        pt({
          tp: 8,
          decode_tp: 8,
          ep: 1,
          prefill_dcp_size: 8,
          decode_dcp_size: 8,
          prefill_pcp_size: 1,
          decode_pcp_size: 1,
        }),
      ),
    ).toBe('TP8/DCP8');
    expect(
      getPointLabel(pt({ tp: 8, decode_tp: 8, ep: 1, decode_dcp_size: 8, prefill_pcp_size: 4 })),
    ).toBe('TP8/DCP8/PCP4');
  });

  it('returns "DPATP4" when ep is 1 and dp_attention is true', () => {
    expect(getPointLabel(pt({ tp: 4, ep: 1, dp_attention: true }))).toBe('DPATP4');
  });

  it('returns multinode disagg format', () => {
    const result = getPointLabel(
      pt({
        tp: 8,
        ep: 4,
        is_multinode: true,
        disagg: true,
        prefill_tp: 4,
        prefill_ep: 4,
        prefill_dp_attention: false,
        decode_tp: 8,
        decode_ep: 32,
        decode_dp_attention: true,
        prefill_num_workers: 2,
        decode_num_workers: 1,
      }),
    );
    expect(result).toBe('2xTEP4+1xDPAEP32');
  });

  it('uses fallback values for multinode disagg when specific fields are undefined', () => {
    const result = getPointLabel(
      pt({
        tp: 8,
        ep: 4,
        is_multinode: true,
        disagg: true,
      }),
    );
    // falls back to d.tp=8 and d.ep=4 for both prefill and decode
    // configSegmentLabel(8, 4, undefined): ep>1 && tp!==ep → "EP4"
    expect(result).toBe('1xEP4+1xEP4');
  });

  it('returns tp string when ep is explicitly undefined', () => {
    const d = pt({ tp: 4 });
    // ensure ep and prefill_ep are not set
    delete (d as any).ep;
    delete (d as any).prefill_ep;
    expect(getPointLabel(d)).toBe('4');
  });
});

// ===========================================================================
// generateTooltipContent
// ===========================================================================
describe('generateTooltipContent', () => {
  it('renders View charts as a same-tab anchor so browsers offer open-in-new-tab', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
        isPinned: true,
        hasTrace: true,
      }),
    );
    expect(html).toContain('<a data-action="view-charts"');
    expect(html).toContain('href="/inference/agentic/1"');
    expect(html).not.toContain('data-action="view-charts" target=');
  });

  it('renders View logs only for pinned points with a stored server log', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
        isPinned: true,
        hasLog: true,
      }),
    );
    expect(html).toContain('<a data-action="view-logs"');
    expect(html).toContain('href="/inference/agentic/7?view=logs"');
    expect(
      generateTooltipContent(
        tooltipConfig({
          data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
          isPinned: false,
          hasLog: true,
        }),
      ),
    ).not.toContain('data-action="view-logs"');
    expect(
      generateTooltipContent(
        tooltipConfig({
          data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
          isPinned: true,
          hasLog: false,
        }),
      ),
    ).not.toContain('data-action="view-logs"');
  });

  it('routes fixed-sequence log actions to the fixed benchmark log viewer', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({ id: 96255, benchmark_type: 'single_turn' }),
        isPinned: true,
        hasLog: true,
      }),
    );
    expect(html).toContain('<a data-action="view-logs"');
    expect(html).toContain('href="/inference/logs/96255"');
    expect(html).not.toContain('/inference/agentic/96255');
  });

  it('localizes point-detail actions and their /zh routes', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
        isPinned: true,
        hasTrace: true,
        hasLog: true,
        locale: 'zh',
      }),
    );
    expect(html).toContain('查看图表');
    expect(html).toContain('href="/zh/inference/agentic/7"');
    expect(html).toContain('查看日志');
    expect(html).toContain('href="/zh/inference/agentic/7?view=logs"');
  });

  it('omits View charts when the point id is non-persisted (0 / NaN), even if pinned + hasTrace', () => {
    // Overlay agentic points arrive with id 0 / NaN — the button would otherwise
    // link to /inference/agentic/0, a doomed lookup.
    for (const badId of [0, Number.NaN]) {
      const html = generateTooltipContent(
        tooltipConfig({
          data: pt({ id: badId, benchmark_type: 'agentic_traces' }),
          isPinned: true,
          hasTrace: true,
        }),
      );
      expect(html).not.toContain('data-action="view-charts"');
      expect(html).not.toContain('data-action="view-logs"');
    }
  });

  it('includes hardware display label from config', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).toContain('H100');
  });

  it('shows "Click elsewhere to dismiss" when isPinned is true', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).toContain('Click elsewhere to dismiss');
  });

  it('does not show dismiss text when isPinned is false', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: false }));
    expect(html).not.toContain('Click elsewhere to dismiss');
  });

  it('includes date, xLabel, and yLabel', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per Chip');
  });

  it('includes image field when present', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ image: 'vllm-v0.6.0' }) }));
    expect(html).toContain('vllm-v0.6.0');
    expect(html).toContain('Image:');
  });

  it('splits image and SHA onto separate lines', () => {
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ image: 'vllm-v0.6.0 abc123' }) }),
    );
    expect(html).toContain('vllm-v0.6.0<br />abc123');
  });

  it('omits image section when no image', () => {
    const html = generateTooltipContent(tooltipConfig());
    expect(html).not.toContain('Image:');
  });

  it('includes output throughput when metric is y_tpPerGpu and field exists', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).toContain('Output Token Throughput per Chip');
  });

  it('omits output throughput when metric is not y_tpPerGpu', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).not.toContain('Output Token Throughput per Chip');
  });

  it('includes input throughput when metric is y_tpPerGpu and field exists', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ inputTputPerGpu: { y: 200, roof: false } }),
      }),
    );
    expect(html).toContain('Input Token Throughput per Chip');
  });

  it('includes precision in uppercase', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ precision: 'fp8' }) }));
    expect(html).toContain('FP8');
  });

  it('shows theoretical prefix and uncached input token rows for agentic points', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          total_prompt_tokens: 1_000_000,
          theoretical_cache_hit_rate: 0.92,
        }),
      }),
    );
    expect(html).toContain('<strong>Theoretical Prefix Tokens:</strong> 920,000');
    expect(html).toContain('<strong>Input Tokens w/o Prefix Caching:</strong> 80,000');
  });

  it('omits the prefix token rows when the theoretical hit rate is missing', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          total_prompt_tokens: 1_000_000,
          theoretical_cache_hit_rate: undefined,
        }),
      }),
    );
    expect(html).toContain('<strong>Prompt Tokens:</strong> 1,000,000');
    expect(html).not.toContain('Theoretical Prefix Tokens');
    expect(html).not.toContain('Input Tokens w/o Prefix Caching');
  });

  it('never shows prefix token rows on fixed-sequence points', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'single_turn',
          total_prompt_tokens: 1_000_000,
          theoretical_cache_hit_rate: 0.92,
        }),
      }),
    );
    expect(html).not.toContain('Theoretical Prefix Tokens');
    expect(html).not.toContain('Input Tokens w/o Prefix Caching');
  });

  it('uses Chinese labels for the prefix token rows on /zh surfaces', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        locale: 'zh',
        data: pt({
          benchmark_type: 'agentic_traces',
          total_prompt_tokens: 500_000,
          theoretical_cache_hit_rate: 0.9,
        }),
      }),
    );
    expect(html).toContain('<strong>理论 prefix token 数：</strong> 450,000');
    expect(html).toContain('<strong>无 prefix cache 的输入 token 数：</strong> 50,000');
  });
});

describe('theoreticalPrefixTokens / uncachedInputTokens', () => {
  it('recovers the prefix token sum from the trace hit rate', () => {
    const d = pt({ total_prompt_tokens: 1_000_000, theoretical_cache_hit_rate: 0.925 });
    expect(theoreticalPrefixTokens(d)).toBe(925_000);
    expect(uncachedInputTokens(d)).toBe(75_000);
  });

  it('returns undefined when either input is missing', () => {
    expect(theoreticalPrefixTokens(pt({ total_prompt_tokens: 100 }))).toBeUndefined();
    expect(theoreticalPrefixTokens(pt({ theoretical_cache_hit_rate: 0.5 }))).toBeUndefined();
    expect(uncachedInputTokens(pt({ total_prompt_tokens: 100 }))).toBeUndefined();
  });

  it('rejects out-of-range or NaN hit rates', () => {
    expect(
      theoreticalPrefixTokens(pt({ total_prompt_tokens: 100, theoretical_cache_hit_rate: 1.2 })),
    ).toBeUndefined();
    expect(
      theoreticalPrefixTokens(pt({ total_prompt_tokens: 100, theoretical_cache_hit_rate: -0.1 })),
    ).toBeUndefined();
    expect(
      theoreticalPrefixTokens(pt({ total_prompt_tokens: 100, theoretical_cache_hit_rate: NaN })),
    ).toBeUndefined();
  });

  it('clamps rounding so uncached input never goes negative', () => {
    const d = pt({ total_prompt_tokens: 3, theoretical_cache_hit_rate: 1 });
    expect(theoreticalPrefixTokens(d)).toBe(3);
    expect(uncachedInputTokens(d)).toBe(0);
  });
});

describe('generateTooltipContent cache metadata', () => {
  it('shows offload type, backend, and version instead of the binary offload mode', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          offload_mode: 'on',
          kv_offloading: 'dram',
          kv_offload_backend: 'mooncake',
          kv_offload_backend_version: '0.3.11.post1',
        }),
      }),
    );
    expect(html).toContain('<strong>Offload Type:</strong> DRAM');
    expect(html).toContain('<strong>KV Offload Engine:</strong> Mooncake 0.3.11.post1');
    expect(html).not.toContain('Offload Mode');
  });

  it('keeps a clearly marked binary fallback for legacy agentic rows', () => {
    const enabled = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          offload_mode: 'on',
          kv_offloading: undefined,
        }),
      }),
    );
    const disabledZh = generateTooltipContent(
      tooltipConfig({
        locale: 'zh',
        data: pt({
          benchmark_type: 'agentic_traces',
          offload_mode: 'off',
          kv_offloading: undefined,
        }),
      }),
    );

    expect(enabled).toContain('<strong>Offload Type:</strong> Enabled (legacy data)');
    expect(disabledZh).toContain('<strong>offload 类型：</strong> 已禁用（旧版数据）');
  });

  it('does not treat the fixed-sequence offload default as legacy metadata', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'single_turn',
          offload_mode: 'off',
          kv_offloading: undefined,
        }),
      }),
    );

    expect(html).not.toContain('Offload Type');
    expect(html).not.toContain('legacy data');
  });

  it('shows multinode KV transfer and cache-hit metadata for fixed-sequence points', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          benchmark_type: 'single_turn',
          is_multinode: true,
          kv_p2p_transfer: 'nixl',
          server_gpu_cache_hit_rate: 0.875,
        }),
      }),
    );
    expect(html).toContain('<strong>KV Transfer Engine:</strong> NIXL');
    expect(html).toContain('<strong>Chip Cache Hit Rate:</strong> 87.5%');
  });

  it('hides stale CPU cache hits when offload is disabled', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          kv_offloading: 'none',
          offload_mode: 'on',
          server_gpu_cache_hit_rate: 0.8,
          server_cpu_cache_hit_rate: 0.42,
          theoretical_cache_hit_rate: 0.9,
        }),
      }),
    );

    expect(html).not.toContain('CPU Cache Hit Rate');
    expect(html).toContain('<strong>Chip Cache Hit Rate:</strong> 80.0%');
    expect(html).toContain('<strong>Theoretical Cache Hit Rate:</strong> 90.0%');
  });

  it('uses legacy offload mode to gate CPU cache hits when no descriptor exists', () => {
    const disabled = generateTooltipContent(
      tooltipConfig({
        data: pt({
          kv_offloading: undefined,
          offload_mode: 'off',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );
    const enabled = generateTooltipContent(
      tooltipConfig({
        data: pt({
          kv_offloading: undefined,
          offload_mode: 'on',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );

    expect(disabled).not.toContain('CPU Cache Hit Rate');
    expect(enabled).toContain('<strong>CPU Cache Hit Rate:</strong> 42.0%');
  });

  it('uses Chinese labels for new cache metadata on /zh surfaces', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        locale: 'zh',
        data: pt({
          kv_offloading: 'dram',
          kv_offload_backend: 'lmcache',
          router_name: 'vllm-router',
          router_version: '0.1.14',
        }),
      }),
    );
    expect(html).toContain('<strong>offload 类型：</strong> DRAM');
    expect(html).toContain('<strong>KV offload 引擎：</strong> LMCache');
    expect(html).toContain('<strong>路由器：</strong> vLLM Router 0.1.14');
  });

  it('omits the offload type row when the canonical tier is none', () => {
    const en = generateTooltipContent(tooltipConfig({ data: pt({ kv_offloading: 'none' }) }));
    const zh = generateTooltipContent(
      tooltipConfig({ locale: 'zh', data: pt({ kv_offloading: 'none' }) }),
    );

    expect(en).not.toContain('Offload Type');
    expect(zh).not.toContain('offload 类型');
  });

  it('falls back to hwKey when hardware config entry is missing', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ hwKey: 'unknown_gpu' }) }));
    expect(html).toContain('unknown_gpu');
  });

  it('sets user-select to "text" when pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).toContain('user-select: text');
  });

  it('sets user-select to "none" when not pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: false }));
    expect(html).toContain('user-select: none');
  });

  it('does not include the removed Track Over Time action when pinned', () => {
    const html = generateTooltipContent(tooltipConfig({ isPinned: true }));
    expect(html).not.toContain('data-action="track-over-time"');
    expect(html).not.toContain('Track Over Time');
    expect(html).not.toContain('Untrack Over Time');
  });
});

// ===========================================================================
// generateOverlayTooltipContent
// ===========================================================================
describe('generateOverlayTooltipContent', () => {
  function overlayConfig(overrides: Partial<OverlayTooltipConfig> = {}): OverlayTooltipConfig {
    return {
      ...tooltipConfig(),
      overlayData: {
        label: 'feature-branch',
        hardwareConfig: mockHardwareConfig,
        data: [],
        runUrl: 'https://example.com',
      } as any,
      ...overrides,
    };
  }

  it('includes red border style', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('border: 2px solid #dc2626');
  });

  it('includes "UNOFFICIAL RUN" label', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('UNOFFICIAL RUN');
  });

  it('includes branch label from overlayData', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('feature-branch');
  });

  it('uses overlayData.hardwareConfig for display label', () => {
    const html = generateOverlayTooltipContent(overlayConfig({ data: pt({ hwKey: 'b200' }) }));
    expect(html).toContain('B200');
  });

  it('includes concurrency info', () => {
    const html = generateOverlayTooltipContent(overlayConfig());
    expect(html).toContain('Concurrency');
    expect(html).toContain('64');
  });

  it('shows cache metadata for unofficial agentic overlays', () => {
    const html = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          kv_offloading: 'dram',
          kv_offload_backend: 'hicache',
          kv_p2p_transfer: 'nixl',
          router_name: 'sglang-router',
          router_version: '0.3.2',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );
    expect(html).toContain('<strong>Offload Type:</strong> DRAM');
    expect(html).toContain('<strong>KV Offload Engine:</strong> HiCache');
    expect(html).toContain('<strong>KV Transfer Engine:</strong> NIXL');
    expect(html).toContain('<strong>Router:</strong> SGLang Router 0.3.2');
    expect(html).toContain('<strong>CPU Cache Hit Rate:</strong> 42.0%');
  });

  it('shows DCP and PCP for unofficial-run points', () => {
    const html = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({ ep: 1, decode_dcp_size: 8, prefill_pcp_size: 4 }),
      }),
    );

    expect(html).toContain('<strong>Decode Context Parallelism (DCP):</strong> 8');
    expect(html).toContain('<strong>Prefill Context Parallelism (PCP):</strong> 4');
  });

  it('shows point-level speculative decoding for mixed agentic overlays', () => {
    const mtp = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({ benchmark_type: 'agentic_traces', spec_decoding: 'mtp' }),
      }),
    );
    const standardZh = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({ benchmark_type: 'agentic_traces', spec_decoding: 'none' }),
        locale: 'zh',
      }),
    );

    expect(mtp).toContain('<strong>Speculative Decoding:</strong> MTP');
    expect(standardZh).toContain('<strong>投机解码：</strong> 关闭');
  });

  it('labels Kimi-K3 speculative decoding "DSpark" rather than the generic MTP', () => {
    const html = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          model: 'Kimi-K3',
          spec_decoding: 'mtp',
        }),
      }),
    );

    expect(html).toContain('<strong>Speculative Decoding:</strong> DSpark');
    expect(html).not.toContain('<strong>Speculative Decoding:</strong> MTP');
  });

  it('hides stale CPU cache hits for unofficial overlays without offload', () => {
    const html = generateOverlayTooltipContent(
      overlayConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          kv_offloading: 'none',
          offload_mode: 'off',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );

    expect(html).not.toContain('Offload Type');
    expect(html).not.toContain('CPU Cache Hit Rate');
  });
});

// ===========================================================================
// generateGPUGraphTooltipContent
// ===========================================================================
describe('generateGPUGraphTooltipContent', () => {
  it('includes "Chip Config:" label', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig());
    expect(html).toContain('Chip Config:');
  });

  it('includes date and axis values', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per Chip');
  });

  it('shows input/output throughput when metric is y_tpPerGpu', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({
          inputTputPerGpu: { y: 200, roof: false },
          outputTputPerGpu: { y: 500, roof: false },
        }),
      }),
    );
    expect(html).toContain('Input Token Throughput per Chip');
    expect(html).toContain('Output Token Throughput per Chip');
  });

  it('omits throughput fields when metric is not y_tpPerGpu', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({
          inputTputPerGpu: { y: 200, roof: false },
          outputTputPerGpu: { y: 500, roof: false },
        }),
      }),
    );
    expect(html).not.toContain('Input Token Throughput per Chip');
    expect(html).not.toContain('Output Token Throughput per Chip');
  });

  it('includes precision in uppercase', () => {
    const html = generateGPUGraphTooltipContent(tooltipConfig({ data: pt({ precision: 'bf16' }) }));
    expect(html).toContain('BF16');
  });

  it('shows DCP and PCP in comparison point tooltips', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({
        data: pt({ ep: 1, decode_dcp_size: 8, prefill_pcp_size: 4 }),
      }),
    );

    expect(html).toContain('<strong>Decode Context Parallelism (DCP):</strong> 8');
    expect(html).toContain('<strong>Prefill Context Parallelism (PCP):</strong> 4');
  });

  it('splits image and SHA onto separate lines', () => {
    const html = generateGPUGraphTooltipContent(
      tooltipConfig({ data: pt({ image: 'vllm-v0.6.0 abc123' }) }),
    );
    expect(html).toContain('vllm-v0.6.0<br />abc123');
  });

  it('shows View charts only for pinned points with stored trace data', () => {
    expect(
      generateGPUGraphTooltipContent(
        tooltipConfig({
          data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
          isPinned: true,
          hasTrace: true,
        }),
      ),
    ).toContain('data-action="view-charts"');
    expect(
      generateGPUGraphTooltipContent(
        tooltipConfig({
          data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
          isPinned: true,
          hasTrace: true,
        }),
      ),
    ).toContain('href="/inference/agentic/1"');
    expect(
      generateGPUGraphTooltipContent(
        tooltipConfig({
          data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
          isPinned: false,
          hasTrace: true,
        }),
      ),
    ).not.toContain('data-action="view-charts"');
    expect(
      generateGPUGraphTooltipContent(
        tooltipConfig({
          data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
          isPinned: true,
          hasTrace: false,
        }),
      ),
    ).not.toContain('data-action="view-charts"');
  });
});
