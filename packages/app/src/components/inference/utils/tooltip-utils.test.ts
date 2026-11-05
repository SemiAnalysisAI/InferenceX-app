// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import { modelSystemPower, type SystemPowerEstimate } from '@/lib/power/modeled-system-power';
import { gb300DisaggRow } from '@/lib/power/nvl72-power.fixture';
import {
  SYSTEM_POWER_MODEL_REVISION,
  SYSTEM_POWER_MODEL_SOURCE_URL,
} from '@/lib/power/system-power-model';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import {
  buildPointDetails,
  generateHoverTooltipContent,
  getPointLabel,
  type TooltipConfig,
} from '@/components/inference/utils/tooltipUtils';
import {
  comparisonDetailsText,
  detailsText,
} from '@/components/inference/utils/point-details-test-helpers';

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
    xLabel: 'E2E Latency (ms)',
    yLabel: 'Throughput per Chip',
    selectedYAxisMetric: 'y_tpPerGpu',
    hardwareConfig: mockHardwareConfig,
    ...overrides,
  };
}

const systemPower = {
  status: 'supported',
  unit: 'chassis',
  hardware: 'h100',
  modelRevision: SYSTEM_POWER_MODEL_REVISION,
  operatingState: { workload: 'agentic' as const, scaleOut: true },
  gpuCount: 16,
  chassisCount: 2,
  itWatts: 12000,
  itWattsPerGpu: 750,
  facilityWatts: 14400,
  pue: 1.2,
  measuredGpuWattsPerGpu: 500,
  modeledGpuCount: 16,
  deploymentItWatts: 12000,
  deploymentFacilityWatts: 14400,
  deploymentBreakdownWatts: {
    gpu: 8000,
    measuredCpu: 0,
    cpu: 900,
    memory: 360,
    nic: 600,
    nvswitch: 300,
    storage: 150,
    other: 90,
    fans: 500,
    psuLoss: 500,
    network: 600,
    facility: 2400,
  },
  topologyBasis: 'worker-hosts',
  chassisBasis: 'full',
  telemetryBasis: 'validated-v2',
} satisfies SystemPowerEstimate;

describe('run-specific framework tooltip labels', () => {
  it.each(['en', 'zh'] as const)('uses point provenance in all tooltip paths (%s)', (locale) => {
    const hwKey = 'mi355x_mori-sglang';
    const target = pt({
      hwKey,
      framework: 'mori-sglang',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34926284365/attempts/1',
    });
    const historical = {
      ...target,
      run_url: target.run_url!.replace('34926284365', '34926284364'),
    };
    const hardwareConfig = {
      [hwKey]: getInferenceHardwareConfig(hwKey, undefined, [target, historical]),
    };
    for (const point of [target, historical]) {
      const config = tooltipConfig({ data: point, hardwareConfig, locale });
      const outputs = [
        detailsText(config),
        comparisonDetailsText(config),
        detailsText({
          ...config,
          overlayData: { data: [target, historical], hardwareConfig, label: 'test-run' },
        }),
      ];
      for (const html of outputs) {
        expect(html).toContain(
          point === target ? 'MI355X\nMoRI UMBP SGLang · FP8' : 'MI355X\nMoRI SGLang · FP8',
        );
        expect(html).not.toContain('MoRI SGLang / MoRI UMBP SGLang');
        if (point === historical) expect(html).not.toContain('MoRI UMBP SGLang');
      }
    }
  });
});

describe('modeled system-power tooltip', () => {
  const config = (overrides: Partial<TooltipConfig> = {}) =>
    tooltipConfig({
      data: pt({ modeledSystemPower: systemPower }),
      selectedYAxisMetric: 'y_measuredAvgPower',
      ...overrides,
    });

  it('separates measured input, normalized IT power, and whole-deployment facility power', () => {
    const html = detailsText(config());
    expect(html).toContain('500 W/GPU');
    expect(html).toContain('750 W/GPU');
    expect(html).toContain('12,000 W');
    expect(html).toContain('14,400 W');
    expect(html).toContain('PUE 1.2');
    expect(html).toContain('Measured IT power per GPU (no PUE)');
    expect(html).toContain('Measured facility power');
    expect(html).not.toContain('Modeled');
    expect(html).toContain('2 full eight-GPU chassis · 16 GPUs');
    expect(html).toContain('Operating state:</strong> agentic · scale-out on');
    expect(html).toContain(
      'Includes GPU chassis CPUs; excludes separate CPU-only frontend/router hosts.',
    );
    expect(html).toContain(SYSTEM_POWER_MODEL_SOURCE_URL);
    expect(html).not.toContain('12,000 W/GPU');
    expect(html).not.toContain('Unmeasured chassis GPUs');
  });

  it('labels an extrapolated partial chassis and reports the measured GPUs’ share', () => {
    const data = pt({
      physicalChips: 4,
      modeledSystemPower: {
        ...systemPower,
        gpuCount: 4,
        chassisCount: 1,
        modeledGpuCount: 8,
        itWatts: 6000,
        facilityWatts: 7200,
        deploymentItWatts: 3000,
        deploymentFacilityWatts: 3600,
        topologyBasis: 'single-node',
        chassisBasis: 'extrapolated',
      },
    });
    const html = detailsText(config({ data }));
    expect(html).toContain(
      '1 eight-GPU chassis · 4 of 8 GPUs measured, extrapolated to full chassis',
    );
    expect(html).toContain('Unmeasured chassis GPUs are assumed to run the same workload');
    expect(html).toContain('3,000 W');
    expect(html).toContain('3,600 W');
    expect(html).not.toContain('6000 W');
    expect(html).not.toContain('7200 W');
    expect(html).toContain('Total chips: 4');

    const zh = detailsText(config({ data, locale: 'zh' }));
    expect(zh).toContain('1 个八卡机箱 · 实测 4/8 张 GPU，按满机箱外推');
    expect(zh).toContain('假设机箱内未实测的 GPU 运行相同负载');
    expect(zh).toContain('3,000 W');
    expect(zh).not.toContain('6000 W');
  });

  it('names NVL72 trays, the measured Grace socket, and the rack-share basis (en/zh)', () => {
    const data = pt({ hwKey: 'gb300', modeledSystemPower: modelSystemPower(gb300DisaggRow()) });
    const html = detailsText(config({ data }));
    expect(html).toContain('2 full NVL72 compute trays · 8 GPUs');
    expect(html).toContain('Measured Grace socket power:</strong> 98 W/socket');
    expect(html).toContain('Measured: GPU boards and whole Grace sockets');
    expect(html).toContain('each tray takes 1/18 of the rack');
    expect(html).toContain('PUE 1.1');
    expect(html).not.toContain('eight-GPU chassis');
    expect(html).not.toContain('regulator');

    const zh = detailsText(config({ data, locale: 'zh' }));
    expect(zh).toContain('2 个完整 NVL72 计算 tray · 8 张 GPU');
    expect(zh).toContain('Grace socket 实测功耗');
    expect(zh).toContain('每个 tray 分摊机架的 1/18');
  });

  it('preserves the same model provenance in unofficial and date-comparison tooltips', () => {
    const cases: [InferenceData, string[]][] = [
      [pt({ modeledSystemPower: systemPower }), ['500 W/GPU', '750 W/GPU', 'PUE 1.2']],
      [
        pt({ hwKey: 'gb300', modeledSystemPower: modelSystemPower(gb300DisaggRow()) }),
        ['2 full NVL72 compute trays · 8 GPUs', '98 W/socket', 'PUE 1.1'],
      ],
    ];
    for (const [data, expected] of cases) {
      const official = config({ data });
      const overlay = detailsText({
        ...official,
        overlayData: {
          label: 'PowerX comparison',
          hardwareConfig: mockHardwareConfig,
        } as TooltipConfig['overlayData'],
      });
      for (const html of [overlay, comparisonDetailsText(official)]) {
        for (const text of expected) expect(html).toContain(text);
        expect(html).toContain(SYSTEM_POWER_MODEL_REVISION);
      }
    }
  });

  it('explains unsupported hardware on the measured baseline without substituting zero', () => {
    const html = detailsText(
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

  it('sets every system-power line in the 11px tooltip text size', () => {
    const host = document.createElement('div');
    host.innerHTML = buildPointDetails(config()).powerHtml;
    const section = host.querySelector('[data-testid="tooltip-modeled-system-power"]')!;
    const sizes = new Set<string>();
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      let el = node.parentElement;
      while (el && el !== host && !el.style.fontSize) el = el.parentElement;
      sizes.add(el && el !== host ? el.style.fontSize : 'inherited');
    }
    expect([...sizes]).toEqual(['11px']);
  });

  it('keeps the hover card compact and leaves unrelated metrics unchanged', () => {
    const hover = generateHoverTooltipContent({ ...config(), color: 'red' });
    expect(hover).not.toContain('500 W/GPU');
    expect(hover).not.toContain('PUE 1.2');
    expect(detailsText(config({ selectedYAxisMetric: 'y_tpPerGpu' }))).not.toContain(
      'tooltip-modeled-system-power',
    );
  });

  it('localizes the measurement boundary and occupancy assumptions', () => {
    const html = detailsText(config({ locale: 'zh' }));
    expect(html).toContain('GPU 实测功耗');
    expect(html).toContain('整个部署的实测 IT 功耗');
    expect(html).toContain('实测数据中心功耗');
    expect(html).not.toContain('功耗估算');
    expect(html).toContain('2 个完整八卡机箱 · 16 张 GPU');
    expect(html).toContain('运行状态：</strong> 智能体 · scale-out 开启');
    expect(html).toContain('计入 GPU 机箱内的 CPU');
    expect(html).toContain('不计入独立的纯 CPU 前端或路由主机。');
  });

  it('breaks normalization and host scope into two compact lines in pinned tooltips', () => {
    for (const locale of ['en', 'zh'] as const) {
      const html = detailsText(config({ locale }));
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
// buildPointDetails
// ===========================================================================
describe('buildPointDetails', () => {
  it('renders View charts as a same-tab anchor so browsers offer open-in-new-tab', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
        hasTrace: true,
      }),
    );
    expect(html).toContain('data-action="view-charts"');
    expect(html).toContain('href="/inference/agentic/1"');
    expect(html).not.toContain('data-action="view-charts" target=');
  });

  it('renders View logs only for points with a stored server log', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
        hasLog: true,
      }),
    );
    expect(html).toContain('data-action="view-logs"');
    expect(html).toContain('href="/inference/agentic/7?view=logs"');
    expect(
      detailsText(
        tooltipConfig({
          data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
          hasLog: false,
        }),
      ),
    ).not.toContain('data-action="view-logs"');
  });

  it.each([
    [{ spec_decoding: 'draft_model' }, 'Draft Model'],
    [
      {
        spec_decoding: 'draft_model',
        spec_algorithm: 'dflash',
        spec_draft_model: 'RadixArk/Muse-Spark-Open-DFlash2',
      },
      'DFlash (RadixArk/Muse-Spark-Open-DFlash2)',
    ],
    [
      { spec_decoding: 'mtp', spec_algorithm: 'dspark', spec_draft_model: 'native' },
      'DSpark (native)',
    ],
    [{ spec_decoding: 'none', spec_algorithm: 'dspark', spec_draft_model: 'native' }, 'Off'],
  ])('labels speculative decoding by what the server ran: %j', (fields, label) => {
    const { rows } = buildPointDetails(
      tooltipConfig({ data: pt({ id: 3, benchmark_type: 'agentic_traces', ...fields }) }),
    );
    expect(rows).toContainEqual({ label: 'Speculative decoding', value: label });
  });

  it('routes fixed-sequence log actions to the fixed benchmark log viewer', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({ id: 96255, benchmark_type: 'single_turn' }),
        hasLog: true,
      }),
    );
    expect(html).toContain('data-action="view-logs"');
    expect(html).toContain('href="/inference/logs/96255"');
    expect(html).not.toContain('/inference/agentic/96255');
  });

  it('localizes point-detail actions and their /zh routes', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({ id: 7, benchmark_type: 'agentic_traces' }),
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
    const html = detailsText(
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

    expect(html).toContain('请求： 9 / 10 (90%)');
    expect(html).toContain('提示 token：');
    expect(html).toContain('生成 token：');
    expect(html).toContain('GitHub Actions 运行记录');
    expect(html).not.toContain('Requests:');
    expect(html).not.toContain('GitHub Actions run');
  });

  it('localizes dates, DPA flags, and worker labels for Chinese disaggregated tooltips', () => {
    const html = detailsText(
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

    expect(html).toContain('\n2026年1月2日\n');
    expect(html).toContain('DPA: 是, worker 数: 2');
    expect(html).toContain('DPA: 否, worker 数: 1');
    expect(html).not.toContain('DPA: True');
    expect(html).not.toContain('Workers:');
  });

  it('omits View charts when the point id is non-persisted (0 / NaN), even if pinned + hasTrace', () => {
    // Overlay agentic points arrive with id 0 / NaN — the button would otherwise
    // link to /inference/agentic/0, a doomed lookup.
    for (const badId of [0, Number.NaN]) {
      const html = detailsText(
        tooltipConfig({
          data: pt({ id: badId, benchmark_type: 'agentic_traces' }),
          hasTrace: true,
        }),
      );
      expect(html).not.toContain('data-action="view-charts"');
      expect(html).not.toContain('data-action="view-logs"');
    }
  });

  it('includes hardware display label from config', () => {
    const html = detailsText(tooltipConfig());
    expect(html).toContain('H100');
  });

  it('lists every point-detail action for a measured agentic point', () => {
    const details = buildPointDetails(
      tooltipConfig({
        hasTrace: true,
        hasLog: true,
        showPowerTelemetry: true,
        selectedYAxisMetric: 'y_measuredAvgPower',
        runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
        data: pt({
          id: 42,
          benchmark_type: 'agentic_traces',
          power_audit: { source: 'power_validation_h100_conc8.json' },
          run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
        }),
      }),
    );
    expect(details.links.map((link) => link.action)).toEqual([
      'run',
      'view-charts',
      'view-logs',
      'view-power-telemetry',
      'view-power-trace',
    ]);
  });

  it('includes date, xLabel, and yLabel', () => {
    const html = detailsText(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per Chip');
  });

  it('includes image field when present', () => {
    expect(buildPointDetails(tooltipConfig({ data: pt({ image: 'vllm-v0.6.0' }) })).image).toBe(
      'vllm-v0.6.0',
    );
  });

  it('splits image and SHA onto separate lines', () => {
    const { image } = buildPointDetails(
      tooltipConfig({ data: pt({ image: 'vllm-v0.6.0 abc123' }) }),
    );
    expect(image).toBe('vllm-v0.6.0\nabc123');
  });

  it('omits image section when no image', () => {
    expect(buildPointDetails(tooltipConfig()).image).toBeUndefined();
  });

  it('includes output throughput when metric is y_tpPerGpu and field exists', () => {
    const html = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).toContain('Output Token Throughput per Chip');
  });

  it('omits output throughput when metric is not y_tpPerGpu', () => {
    const html = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({ outputTputPerGpu: { y: 500, roof: false } }),
      }),
    );
    expect(html).not.toContain('Output Token Throughput per Chip');
  });

  it('includes input throughput when metric is y_tpPerGpu and field exists', () => {
    const html = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_tpPerGpu',
        data: pt({ inputTputPerGpu: { y: 200, roof: false } }),
      }),
    );
    expect(html).toContain('Input Token Throughput per Chip');
  });

  it('includes precision in uppercase', () => {
    const html = detailsText(tooltipConfig({ data: pt({ precision: 'fp8' }) }));
    expect(html).toContain('FP8');
  });

  it('shows offload type, backend, and version instead of the binary offload mode', () => {
    const html = detailsText(
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
    expect(html).toContain('Offload type: DRAM');
    expect(html).toContain('KV offload engine: Mooncake 0.3.11.post1');
    expect(html).not.toContain('Offload Mode');
  });

  it('keeps a clearly marked binary fallback for legacy agentic rows', () => {
    const enabled = detailsText(
      tooltipConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          offload_mode: 'on',
          kv_offloading: undefined,
        }),
      }),
    );
    const disabledZh = detailsText(
      tooltipConfig({
        locale: 'zh',
        data: pt({
          benchmark_type: 'agentic_traces',
          offload_mode: 'off',
          kv_offloading: undefined,
        }),
      }),
    );

    expect(enabled).toContain('Offload type: Enabled (legacy data)');
    expect(disabledZh).toContain('offload 类型： 已禁用（旧版数据）');
  });

  it('does not treat the fixed-sequence offload default as legacy metadata', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          benchmark_type: 'single_turn',
          offload_mode: 'off',
          kv_offloading: undefined,
        }),
      }),
    );

    expect(html).not.toContain('Offload type');
    expect(html).not.toContain('legacy data');
  });

  it('shows multinode KV transfer and cache-hit metadata for fixed-sequence points', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          benchmark_type: 'single_turn',
          is_multinode: true,
          kv_p2p_transfer: 'nixl',
          server_gpu_cache_hit_rate: 0.875,
        }),
      }),
    );
    expect(html).toContain('KV transfer engine: NIXL');
    expect(html).toContain('Chip cache hit rate: 87.5%');
  });

  it('hides stale CPU cache hits when offload is disabled', () => {
    const html = detailsText(
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

    expect(html).not.toContain('CPU cache hit rate');
    expect(html).toContain('Chip cache hit rate: 80.0%');
    expect(html).toContain('Theoretical cache hit rate: 90.0%');
  });

  it('uses legacy offload mode to gate CPU cache hits when no descriptor exists', () => {
    const disabled = detailsText(
      tooltipConfig({
        data: pt({
          kv_offloading: undefined,
          offload_mode: 'off',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );
    const enabled = detailsText(
      tooltipConfig({
        data: pt({
          kv_offloading: undefined,
          offload_mode: 'on',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );

    expect(disabled).not.toContain('CPU cache hit rate');
    expect(enabled).toContain('CPU cache hit rate: 42.0%');
  });

  it('labels TRTLLM offload cache hits as a combined chip and CPU rate', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          framework: 'dynamo-trt',
          kv_offloading: 'dram',
          server_gpu_cache_hit_rate: 0.978,
          server_cpu_cache_hit_rate: undefined,
        }),
      }),
    );

    expect(html).toContain('Combined chip + CPU cache hit rate: 97.8%');
    expect(html).not.toContain('\nCPU cache hit rate:');
    expect(html).not.toContain('\nChip cache hit rate:');
  });

  it('uses Chinese labels for new cache metadata on /zh surfaces', () => {
    const html = detailsText(
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
    expect(html).toContain('offload 类型： DRAM');
    expect(html).toContain('KV offload 引擎： LMCache');
    expect(html).toContain('路由器： vLLM Router 0.1.14');
  });

  it('omits the offload type row when the canonical tier is none', () => {
    const en = detailsText(tooltipConfig({ data: pt({ kv_offloading: 'none' }) }));
    const zh = detailsText(tooltipConfig({ locale: 'zh', data: pt({ kv_offloading: 'none' }) }));

    expect(en).not.toContain('Offload type');
    expect(zh).not.toContain('offload 类型');
  });

  it('falls back to hwKey when hardware config entry is missing', () => {
    const html = detailsText(tooltipConfig({ data: pt({ hwKey: 'unknown_gpu' }) }));
    expect(html).toContain('unknown_gpu');
  });

  it('renders a compact, non-selectable hover card without links or a dismiss hint', () => {
    const config = tooltipConfig({
      data: pt({ id: 7, benchmark_type: 'agentic_traces', tp: 16, ep: 32, dp_attention: true }),
      hasLog: true,
      runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1',
    });
    const html = generateHoverTooltipContent({ ...config, color: 'red' });
    expect(html).toContain('user-select: none');
    expect(html).toContain('500');
    expect(html).toContain('>ms<');
    expect(html).toContain('16 chips · DPAEP32');
    expect(html).toContain('conc 64');
    expect(html).not.toContain('data-action');
    expect(html).not.toContain('dismiss');
  });

  it('does not include the removed Track Over Time action', () => {
    const html = detailsText(tooltipConfig());
    expect(html).not.toContain('data-action="track-over-time"');
    expect(html).not.toContain('Track Over Time');
    expect(html).not.toContain('Untrack Over Time');
  });
});

// ===========================================================================
// buildPointDetails for unofficial overlays
// ===========================================================================
describe('buildPointDetails for unofficial overlays', () => {
  function overlayConfig(overrides: Partial<TooltipConfig> = {}): TooltipConfig {
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

  it('includes red border style on the hover card', () => {
    const html = generateHoverTooltipContent({ ...overlayConfig(), color: 'red' });
    expect(html).toContain('border: 2px solid #dc2626');
  });

  it('includes "UNOFFICIAL RUN" label', () => {
    const html = detailsText(overlayConfig());
    expect(html).toContain('Unofficial run');
  });

  it('includes branch label from overlayData', () => {
    const html = detailsText(overlayConfig());
    expect(html).toContain('feature-branch');
  });

  it('uses overlayData.hardwareConfig for display label', () => {
    const html = detailsText(overlayConfig({ data: pt({ hwKey: 'b200' }) }));
    expect(html).toContain('B200');
  });

  it('includes concurrency info', () => {
    const html = detailsText(overlayConfig());
    expect(html).toContain('Concurrency');
    expect(html).toContain('64');
  });

  it('shows cache metadata for unofficial agentic overlays', () => {
    const html = detailsText(
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
    expect(html).toContain('Offload type: DRAM');
    expect(html).toContain('KV offload engine: HiCache');
    expect(html).toContain('KV transfer engine: NIXL');
    expect(html).toContain('Router: SGLang Router 0.3.2');
    expect(html).toContain('CPU cache hit rate: 42.0%');
  });

  it('shows DCP and PCP for unofficial-run points', () => {
    const html = detailsText(
      overlayConfig({
        data: pt({ ep: 1, decode_dcp_size: 8, prefill_pcp_size: 4 }),
      }),
    );

    expect(html).toContain('Decode context parallelism (DCP): 8');
    expect(html).toContain('Prefill context parallelism (PCP): 4');
  });

  it('shows point-level speculative decoding for mixed agentic overlays', () => {
    const mtp = detailsText(
      overlayConfig({
        data: pt({ benchmark_type: 'agentic_traces', spec_decoding: 'mtp' }),
      }),
    );
    const standardZh = detailsText(
      overlayConfig({
        data: pt({ benchmark_type: 'agentic_traces', spec_decoding: 'none' }),
        locale: 'zh',
      }),
    );

    expect(mtp).toContain('Speculative decoding: MTP');
    expect(standardZh).toContain('投机解码： 关闭');
  });

  it('labels Kimi-K3 speculative decoding "DSpark" rather than the generic MTP', () => {
    const html = detailsText(
      overlayConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          model: 'Kimi-K3',
          spec_decoding: 'mtp',
        }),
      }),
    );

    expect(html).toContain('Speculative decoding: DSpark');
    expect(html).not.toContain('Speculative decoding: MTP');
  });

  it('hides stale CPU cache hits for unofficial overlays without offload', () => {
    const html = detailsText(
      overlayConfig({
        data: pt({
          benchmark_type: 'agentic_traces',
          kv_offloading: 'none',
          offload_mode: 'off',
          server_cpu_cache_hit_rate: 0.42,
        }),
      }),
    );

    expect(html).not.toContain('Offload type');
    expect(html).not.toContain('CPU cache hit rate');
  });
});

// ===========================================================================
// buildPointDetails for comparison dates
// ===========================================================================
describe('buildPointDetails for comparison dates', () => {
  it('dates points by comparison date and notes the data date', () => {
    const html = comparisonDetailsText(
      tooltipConfig({ data: pt({ date: '2025-06-15', actualDate: '2025-06-10' }) }),
    );
    expect(html).toContain('2025-06-15 (data from 2025-06-10)');
  });

  it('includes date and axis values', () => {
    const html = comparisonDetailsText(tooltipConfig());
    expect(html).toContain('2025-06-15');
    expect(html).toContain('E2E Latency (ms)');
    expect(html).toContain('Throughput per Chip');
  });

  it('shows input/output throughput when metric is y_tpPerGpu', () => {
    const html = comparisonDetailsText(
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
    const html = comparisonDetailsText(
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
    const html = comparisonDetailsText(tooltipConfig({ data: pt({ precision: 'bf16' }) }));
    expect(html).toContain('BF16');
  });

  it('shows DCP and PCP in comparison point tooltips', () => {
    const html = comparisonDetailsText(
      tooltipConfig({
        data: pt({ ep: 1, decode_dcp_size: 8, prefill_pcp_size: 4 }),
      }),
    );

    expect(html).toContain('Decode context parallelism (DCP): 8');
    expect(html).toContain('Prefill context parallelism (PCP): 4');
  });

  it('splits image and SHA onto separate lines', () => {
    const html = comparisonDetailsText(
      tooltipConfig({ data: pt({ image: 'vllm-v0.6.0 abc123' }) }),
    );
    expect(html).toContain('vllm-v0.6.0\nabc123');
  });

  it('shows View charts only for points with stored trace data', () => {
    const html = comparisonDetailsText(
      tooltipConfig({
        data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
        hasTrace: true,
      }),
    );
    expect(html).toContain('data-action="view-charts"');
    expect(html).toContain('href="/inference/agentic/1"');
    expect(
      comparisonDetailsText(
        tooltipConfig({
          data: pt({ id: 1, benchmark_type: 'agentic_traces' }),
          hasTrace: false,
        }),
      ),
    ).not.toContain('data-action="view-charts"');
  });
});

describe('measured-power withheld tooltip line', () => {
  const reasons = ['sampling_gap_exceeded', 'expected_gpu_count_mismatch'];

  it('renders the withheld line in Chinese on /zh surfaces', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({ power_valid: 0, power_invalid_reasons: reasons }),
        locale: 'zh',
      }),
    );
    expect(html).toContain('实测功耗未采信');
    expect(html).toContain('sampling gap exceeded');
  });

  it('filters malformed codes before HTML interpolation (defense in depth)', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          power_valid: 0,
          power_invalid_reasons: ['<img src=x>', 'sampling_gap_exceeded', 'UPPER'],
        }),
      }),
    );
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('UPPER');
    expect(html).toContain('sampling gap exceeded');
  });

  it('omits the line entirely when every code is malformed', () => {
    const html = detailsText(
      tooltipConfig({ data: pt({ power_valid: 0, power_invalid_reasons: ['<img src=x>'] }) }),
    );
    expect(html).not.toContain('Measured power withheld');
  });

  it.each([['absent reasons', pt({ power_valid: 0 })]])('omits the line for %s', (_name, data) => {
    const html = detailsText(tooltipConfig({ data }));
    expect(html).not.toContain('Measured power withheld');
  });

  it('gives unofficial overlay tooltips the same line', () => {
    const html = detailsText({
      ...tooltipConfig({ data: pt({ power_valid: 0, power_invalid_reasons: reasons }) }),
      overlayData: {
        label: 'feature-branch',
        hardwareConfig: mockHardwareConfig,
        data: [],
        runUrl: 'https://example.com',
      } as any,
    } as TooltipConfig);
    expect(html).toContain('Measured power withheld');
    expect(html).toContain('sampling gap exceeded');
  });

  it('gives GPU comparison tooltips the same line', () => {
    const html = comparisonDetailsText(
      tooltipConfig({ data: pt({ power_valid: 0, power_invalid_reasons: reasons }) }),
    );
    expect(html).toContain('Measured power withheld');
    expect(html).toContain('sampling gap exceeded');
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

  it('renders the worker table in official, overlay and comparison details', () => {
    const config = tooltipConfig({ data: pt({ workers }) });
    const outputs = [
      detailsText(config),
      detailsText({ ...config, overlayData }),
      comparisonDetailsText(config),
    ];
    for (const html of outputs) {
      expect(html).toContain('data-testid="tooltip-worker-power"');
      expect(html).toContain('Measured worker power');
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
    const html = detailsText(tooltipConfig({ data: pt({ workers }) }));
    expect(html).toContain('68.4/79.2°C');
    expect(html).toContain('88.5%');
    expect(html).toContain('69.565 GiB');
    const decodeRow = html.split('<strong>decode[0]</strong>')[1].split('</div>')[0];
    expect(decodeRow).not.toContain('°C');
    expect(decodeRow).not.toContain('%');
    expect(decodeRow).not.toContain('GiB');
  });

  it('leaves the worker table out of the hover card', () => {
    const html = generateHoverTooltipContent({
      ...tooltipConfig({ data: pt({ workers }) }),
      color: 'red',
    });
    expect(html).not.toContain('tooltip-worker-power');
  });

  it('caps the table at 8 rows with a "+N more workers" line', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: 'decode',
      worker_idx: i,
      num_gpus: 8,
      avg_power_w: 700 + i,
    }));
    const html = detailsText(tooltipConfig({ data: pt({ workers: many }) }));
    expect(html).toContain('<strong>decode[7]</strong>');
    expect(html).not.toContain('<strong>decode[8]</strong>');
    expect(html).toContain('+2 more workers');
  });

  it('renders the ZH strings under the zh locale', () => {
    const html = detailsText(tooltipConfig({ data: pt({ workers }), locale: 'zh' }));
    expect(html).toContain('各 Worker 实测功耗');
    expect(html).toContain('8 芯片');
    const many = Array.from({ length: 9 }, (_, i) => ({
      role: 'decode',
      worker_idx: i,
      num_gpus: 8,
      avg_power_w: 700,
    }));
    const capped = detailsText(tooltipConfig({ data: pt({ workers: many }), locale: 'zh' }));
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
    const html = detailsText(tooltipConfig({ data: pt({ workers: hostile }) }));
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });
});

describe('power tier tooltip line', () => {
  it('states the certified tier on a measured axis', () => {
    const html = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({ power_tier: 'certified' }),
      }),
    );
    expect(html).toContain('Power measurement: Validated (current PowerX method)');
  });

  it('omits the tier line when the point carries no tier', () => {
    const html = detailsText(
      tooltipConfig({ selectedYAxisMetric: 'y_measuredAvgPower', data: pt() }),
    );
    expect(html).not.toContain('Power measurement');
  });

  it('renders the ZH strings under the zh locale', () => {
    const legacy = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredJPerOutputToken',
        data: pt({ power_tier: 'legacy' }),
        locale: 'zh',
      }),
    );
    const certified = detailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredJPerOutputToken',
        data: pt({ power_tier: 'certified' }),
        locale: 'zh',
      }),
    );
    expect(legacy).toContain('功耗测量： 历史测量（尚未按当前方法验证）');
    expect(certified).toContain('功耗测量： 已验证（采用当前 PowerX 方法）');
  });

  it('reaches overlay and GPU-graph tooltips through the same gate', () => {
    const overlay = detailsText({
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
    const gpuGraph = comparisonDetailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_measuredAvgPower',
        data: pt({ power_tier: 'legacy' }),
      }),
    );
    const gpuGraphOffAxis = comparisonDetailsText(
      tooltipConfig({
        selectedYAxisMetric: 'y_costh',
        data: pt({ power_tier: 'legacy' }),
      }),
    );

    expect(overlay).toContain(
      'Power measurement: Historical (not validated under the current method)',
    );
    expect(gpuGraph).toContain(
      'Power measurement: Historical (not validated under the current method)',
    );
    expect(gpuGraphOffAxis).not.toContain('Power measurement');
  });
});

it.each(['en', 'zh'] as const)('keeps only the existing TPU log/chart actions in %s', (locale) => {
  const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX-Private-TPU/actions/runs/1';
  for (const available of [true, false]) {
    const html = detailsText(
      tooltipConfig({
        locale,
        runUrl,
        hasTrace: available,
        hasLog: available,
        data: pt({ id: 123, hwKey: 'tpuv7_vllm', benchmark_type: 'agentic_traces' }),
      }),
    );
    expect(html).not.toContain(runUrl);
    expect(html.match(/data-action="view-logs"/g) ?? []).toHaveLength(available ? 1 : 0);
    expect(html.match(/data-action="view-charts"/g) ?? []).toHaveLength(available ? 1 : 0);
    expect(html.match(/View [Ll]ogs|查看日志/g) ?? []).toHaveLength(available ? 1 : 0);
  }
});
