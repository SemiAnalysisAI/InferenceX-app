import { describe, it, expect } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import type { SystemPowerEstimate } from '@/lib/modeled-system-power';
import {
  getPointLabel,
  generateTooltipContent,
  generateOverlayTooltipContent,
  generateGPUGraphTooltipContent,
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
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
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

const systemPower = {
  status: 'supported',
  hardware: 'h100',
  modelRevision: 'ca4403aa527069857351ad8047dbb726844b3382',
  modelPath: 'chassis/H100.py',
  gpuCount: 16,
  chassisCount: 2,
  chassisAcWatts: 12000,
  chassisAcWattsPerGpu: 750,
  facilityWatts: 14400,
  pue: 1.2,
  measuredGpuWattsPerGpu: 500,
  modeledGpuCount: 16,
  deploymentAcWatts: 12000,
  deploymentFacilityWatts: 14400,
  topologyBasis: 'worker-hosts',
  chassisBasis: 'full',
  telemetryBasis: 'validated-v2',
} satisfies SystemPowerEstimate;

describe('modeled system-power tooltip', () => {
  const config = (overrides: Partial<TooltipConfig> = {}) =>
    tooltipConfig({
      data: pt({ modeledSystemPower: systemPower }),
      selectedYAxisMetric: 'y_modeledChassisPowerPerGpu',
      isPinned: true,
      ...overrides,
    });

  it('separates measured input, normalized chassis AC, and whole-deployment facility power', () => {
    const html = generateTooltipContent(config());
    expect(html).toContain('500 W/GPU');
    expect(html).toContain('750 W/GPU');
    expect(html).toContain('12,000 W');
    expect(html).toContain('14,400 W');
    expect(html).toContain('PUE 1.2');
    expect(html).toContain('2 full eight-GPU chassis · 16 GPUs');
    expect(html).toContain('CPU/DRAM utilization: 20%');
    expect(html).toContain(
      'Includes GPU chassis CPUs; excludes separate CPU-only frontend/router hosts.',
    );
    expect(html).toContain(`/blob/${systemPower.modelRevision}/${systemPower.modelPath}`);
    expect(html).not.toContain('12,000 W/GPU');
    expect(html).not.toContain('Unmeasured chassis GPUs');
  });

  it('labels an extrapolated partial chassis and reports the measured GPUs’ share', () => {
    const html = generateTooltipContent(
      config({
        data: pt({
          physicalChips: 4,
          modeledSystemPower: {
            ...systemPower,
            gpuCount: 4,
            chassisCount: 1,
            modeledGpuCount: 8,
            chassisAcWatts: 6000,
            facilityWatts: 7200,
            deploymentAcWatts: 3000,
            deploymentFacilityWatts: 3600,
            topologyBasis: 'single-node',
            chassisBasis: 'extrapolated',
          },
        }),
      }),
    );
    expect(html).toContain(
      '1 eight-GPU chassis · 4 of 8 GPUs measured, extrapolated to full chassis',
    );
    expect(html).toContain('Unmeasured chassis GPUs are assumed to run the same workload');
    expect(html).toContain('3000 W');
    expect(html).toContain('3600 W');
    expect(html).not.toContain('6000 W');
    expect(html).not.toContain('7200 W');
    expect(html).toContain('<strong>Total Chips:</strong> 4');
  });

  it('preserves the same model provenance in unofficial and date-comparison tooltips', () => {
    const official = config();
    const overlay = generateOverlayTooltipContent({
      ...official,
      overlayData: {
        label: 'PowerX comparison',
        hardwareConfig: mockHardwareConfig,
      } as OverlayTooltipConfig['overlayData'],
    });
    for (const html of [overlay, generateGPUGraphTooltipContent(official)]) {
      expect(html).toContain('500 W/GPU');
      expect(html).toContain('750 W/GPU');
      expect(html).toContain(systemPower.modelRevision);
    }
  });

  it('explains unsupported hardware on the measured baseline without substituting zero', () => {
    const html = generateTooltipContent(
      config({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({
          modeledSystemPower: {
            status: 'unsupported',
            reason: 'hardware',
            modelRevision: systemPower.modelRevision,
          },
        }),
      }),
    );
    expect(html).toContain('No matching chassis model is available');
    expect(html).not.toContain('tooltip-modeled-system-power');
    expect(html).not.toContain('0 W/GPU');
  });

  it('keeps hover compact and leaves unrelated metrics unchanged', () => {
    const hover = generateTooltipContent(config({ isPinned: false }));
    expect(hover).toContain('500 W/GPU');
    expect(hover).not.toContain('PUE 1.2');
    expect(generateTooltipContent(config({ selectedYAxisMetric: 'y_tpPerGpu' }))).not.toContain(
      'tooltip-modeled-system-power',
    );
  });

  it('localizes the measurement boundary and occupancy assumptions', () => {
    const html = generateTooltipContent(config({ locale: 'zh' }));
    expect(html).toContain('GPU 实测功耗');
    expect(html).toContain('整个部署的机箱交流功耗估算');
    expect(html).toContain('数据中心功耗估算');
    expect(html).toContain('2 个完整八卡机箱 · 16 张 GPU');
    expect(html).toContain('CPU/DRAM 利用率：20%');
    expect(html).toContain('计入 GPU 机箱内的 CPU');
    expect(html).toContain('不计入独立的纯 CPU 前端或路由主机。');
  });

  it('breaks normalization and host scope into two compact lines in pinned tooltips', () => {
    for (const locale of ['en', 'zh'] as const) {
      const html = generateTooltipContent(config({ locale }));
      const match = /(?<normalization>[^<>]+)<br\s*\/>(?<boundary>[^<>]+)<\/div>/u.exec(html);
      expect(match?.groups?.normalization).toContain(
        locale === 'en' ? 'all modeled chassis GPUs' : '建模机箱的 GPU 总数',
      );
      expect(match?.groups?.boundary).toContain(
        locale === 'en' ? 'frontend/router hosts' : '前端或路由主机',
      );
      expect(match?.groups?.normalization.length).toBeLessThanOrEqual(80);
      expect(match?.groups?.boundary.length).toBeLessThanOrEqual(80);
    }
  });

  it('uses validated model topology while preserving legacy configuration counts separately', () => {
    const data = pt({
      physicalChips: 64,
      modeledSystemPower: {
        ...systemPower,
        gpuCount: 8,
        chassisCount: 1,
        modeledGpuCount: 8,
        chassisAcWatts: 6000,
        deploymentAcWatts: 6000,
        topologyBasis: 'single-node',
        telemetryBasis: 'validated-unversioned-single-node',
      },
    });
    const html = generateTooltipContent(config({ data }));
    expect(html).toContain('<strong>Total Chips:</strong> 8');
    expect(html).toContain('<strong>Configured Chip Count:</strong> 64');
    expect(html).toContain('1 full eight-GPU chassis · 8 GPUs');
    const measured = generateTooltipContent(
      config({ data, selectedYAxisMetric: 'y_measuredAvgPower' }),
    );
    expect(measured).toContain('<strong>Total Chips:</strong> 64');
    expect(measured).not.toContain('Configured Chip Count');
  });
});

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

  it('localizes agentic request counters and workflow link chrome for Chinese tooltips', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        locale: 'zh',
        runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
        data: pt({
          benchmark_type: 'agentic_traces',
          num_requests_successful: 9,
          num_requests_total: 10,
          total_prompt_tokens: 12_345,
          total_generation_tokens: 678,
        }),
      }),
    );

    expect(html).toContain('<strong>请求：</strong> 9 / 10 (90%)');
    expect(html).toContain('<strong>提示 token：</strong>');
    expect(html).toContain('<strong>生成 token：</strong>');
    expect(html).toContain('GitHub Actions 运行记录');
    expect(html).not.toContain('<strong>Requests:</strong>');
    expect(html).not.toContain('GitHub Actions Run');
  });

  it('localizes dates, DPA flags, and worker labels for Chinese disaggregated tooltips', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        locale: 'zh',
        data: pt({
          date: '2026-01-02',
          actualDate: '2026-01-02',
          ep: 2,
          disagg: true,
          is_multinode: true,
          prefill_tp: 2,
          prefill_ep: 2,
          prefill_dp_attention: true,
          prefill_num_workers: 2,
          decode_tp: 4,
          decode_ep: 4,
          decode_dp_attention: false,
          decode_num_workers: 1,
          num_prefill_gpu: 4,
          num_decode_gpu: 4,
        }),
      }),
    );

    expect(html).toContain('<strong>日期：</strong> 2026年1月2日');
    expect(html).toContain('DPA: 是, worker 数: 2');
    expect(html).toContain('DPA: 否, worker 数: 1');
    expect(html).not.toContain('DPA: True');
    expect(html).not.toContain('Workers:');
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

  it('labels TRTLLM offload cache hits as a combined chip and CPU rate', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        data: pt({
          framework: 'dynamo-trt',
          kv_offloading: 'dram',
          server_gpu_cache_hit_rate: 0.978,
          server_cpu_cache_hit_rate: undefined,
        }),
      }),
    );

    expect(html).toContain('<strong>Combined Chip + CPU Cache Hit Rate:</strong> 97.8%');
    expect(html).not.toContain('<strong>CPU Cache Hit Rate:</strong>');
    expect(html).not.toContain('<strong>Chip Cache Hit Rate:</strong>');
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

describe('worker power drilldown', () => {
  const workers = [
    { role: 'frontend', worker_idx: 0, hosts: ['fe0'], num_gpus: 0, avg_power_w: 120 },
    {
      role: 'prefill',
      worker_idx: 0,
      hosts: ['pn0'],
      num_gpus: 8,
      avg_power_w: 612.3,
      avg_temp_c: 68.4,
      peak_temp_c: 79.2,
      avg_util_pct: 88.5,
      avg_mem_used_mb: 71234.5,
    },
    { role: 'decode', worker_idx: 0, hosts: ['dn0'], num_gpus: 8, avg_power_w: 701.5 },
  ];

  const overlayData = {
    label: 'feature-branch',
    hardwareConfig: mockHardwareConfig,
    data: [],
    runUrl: 'https://example.com',
  } as any;

  it('renders the worker table on a pinned tooltip in all three generators', () => {
    const config = tooltipConfig({ data: pt({ workers }), isPinned: true });
    const outputs = [
      generateTooltipContent(config),
      generateOverlayTooltipContent({ ...config, overlayData }),
      generateGPUGraphTooltipContent(config),
    ];
    for (const html of outputs) {
      expect(html).toContain('data-testid="tooltip-worker-power"');
      expect(html).toContain('Measured Worker Power');
      expect(html).toContain('<strong>prefill[0]</strong>');
      expect(html).toContain('612.3 W');
      expect(html).toContain('<strong>decode[0]</strong>');
      expect(html).toContain('701.5 W');
      expect(html).toContain('<strong>frontend[0]</strong>');
      expect(html).toContain('0 chips');
      expect(html).toContain('pn0');
    }
  });

  it('includes optional telemetry cells only when the worker carries them', () => {
    const html = generateTooltipContent(tooltipConfig({ data: pt({ workers }), isPinned: true }));
    expect(html).toContain('68.4/79.2°C');
    expect(html).toContain('88.5%');
    expect(html).toContain('69.565 GiB');
    const decodeRow = html.split('<strong>decode[0]</strong>')[1].split('</div>')[0];
    expect(decodeRow).not.toContain('°C');
    expect(decodeRow).not.toContain('%');
    expect(decodeRow).not.toContain('GiB');
  });

  it('renders nothing when the tooltip is not pinned', () => {
    const config = tooltipConfig({ data: pt({ workers }), isPinned: false });
    expect(generateTooltipContent(config)).not.toContain('tooltip-worker-power');
    expect(generateOverlayTooltipContent({ ...config, overlayData })).not.toContain(
      'tooltip-worker-power',
    );
    expect(generateGPUGraphTooltipContent(config)).not.toContain('tooltip-worker-power');
  });

  it('renders nothing when workers is absent or empty', () => {
    expect(generateTooltipContent(tooltipConfig({ isPinned: true }))).not.toContain(
      'tooltip-worker-power',
    );
    expect(
      generateTooltipContent(tooltipConfig({ data: pt({ workers: [] }), isPinned: true })),
    ).not.toContain('tooltip-worker-power');
  });

  it('caps the table at 8 rows with a "+N more workers" line', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: 'decode',
      worker_idx: i,
      num_gpus: 8,
      avg_power_w: 700 + i,
    }));
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ workers: many }), isPinned: true }),
    );
    expect(html).toContain('<strong>decode[7]</strong>');
    expect(html).not.toContain('<strong>decode[8]</strong>');
    expect(html).toContain('+2 more workers');
  });

  it('renders the ZH strings under the zh locale', () => {
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ workers }), isPinned: true, locale: 'zh' }),
    );
    expect(html).toContain('各 Worker 实测功耗');
    expect(html).toContain('8 芯片');
    const many = Array.from({ length: 9 }, (_, i) => ({
      role: 'decode',
      worker_idx: i,
      num_gpus: 8,
      avg_power_w: 700,
    }));
    const capped = generateTooltipContent(
      tooltipConfig({ data: pt({ workers: many }), isPinned: true, locale: 'zh' }),
    );
    expect(capped).toContain('另有 1 个 worker');
  });

  it('HTML-escapes role and hosts strings from the JSONB boundary', () => {
    const hostile = [
      {
        role: '<img src=x onerror=alert(1)>',
        worker_idx: 0,
        hosts: ['<script>evil</script>'],
        num_gpus: 8,
        avg_power_w: 700,
      },
    ];
    const html = generateTooltipContent(
      tooltipConfig({ data: pt({ workers: hostile }), isPinned: true }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });
});

describe('power tier tooltip line', () => {
  it('states the tier for a legacy point on a measured axis', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredJPerOutputToken',
        data: pt({ power_tier: 'legacy' }),
      }),
    );
    expect(html).toContain(
      '<strong>Power Measurement:</strong> Historical (not validated under the current method)',
    );
  });

  it('states the certified tier on a measured axis', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({ power_tier: 'certified' }),
      }),
    );
    expect(html).toContain('<strong>Power Measurement:</strong> Validated (current PowerX method)');
  });

  it('omits the tier line on non-measured axes', () => {
    const html = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ power_tier: 'legacy' }),
      }),
    );
    expect(html).not.toContain('Power Measurement');
  });

  it('omits the tier line when the point carries no tier', () => {
    const html = generateTooltipContent(
      tooltipConfig({ selectedYAxisMetric: 'y_measuredAvgPower', data: pt() }),
    );
    expect(html).not.toContain('Power Measurement');
  });

  it('renders the ZH strings under the zh locale', () => {
    const legacy = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredJPerOutputToken',
        data: pt({ power_tier: 'legacy' }),
        locale: 'zh',
      }),
    );
    const certified = generateTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredJPerOutputToken',
        data: pt({ power_tier: 'certified' }),
        locale: 'zh',
      }),
    );
    expect(legacy).toContain('<strong>功耗测量：</strong> 历史测量（尚未按当前方法验证）');
    expect(certified).toContain('<strong>功耗测量：</strong> 已验证（采用当前 PowerX 方法）');
  });

  it('reaches overlay and GPU-graph tooltips through the same gate', () => {
    const overlay = generateOverlayTooltipContent({
      ...tooltipConfig({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({ power_tier: 'legacy' }),
      }),
      overlayData: {
        label: 'feature-branch',
        hardwareConfig: mockHardwareConfig,
        data: [],
        runUrl: 'https://example.com',
      } as any,
    });
    const gpuGraph = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({ power_tier: 'legacy' }),
      }),
    );
    const gpuGraphOffAxis = generateGPUGraphTooltipContent(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({ power_tier: 'legacy' }),
      }),
    );

    expect(overlay).toContain(
      '<strong>Power Measurement:</strong> Historical (not validated under the current method)',
    );
    expect(gpuGraph).toContain(
      '<strong>Power Measurement:</strong> Historical (not validated under the current method)',
    );
    expect(gpuGraphOffAxis).not.toContain('Power Measurement');
  });
});
