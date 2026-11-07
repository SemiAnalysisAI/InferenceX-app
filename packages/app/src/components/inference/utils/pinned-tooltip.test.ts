import { describe, expect, it } from 'vitest';

import type { InferenceData, OverlayData } from '@/components/inference/types';
import { htmlText as text, pointDetailsText } from './point-details-test-helpers';
import { buildPointDetails, type TooltipConfig } from './tooltipUtils';

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
  xLabel: 'P90 Interactivity (tok/s/user)',
  yLabel: 'Total Tokens per $1 TCO (tok/$)',
  selectedYAxisMetric: 'y_costh',
  hardwareConfig: {},
  color: 'rgb(100, 150, 50)',
  ...overrides,
});

const official = (cfg: TooltipConfig) => buildPointDetails(cfg).html;

const historical = (cfg: TooltipConfig) => buildPointDetails({ ...cfg, comparisonDate: true }).html;

const overlay = (cfg: TooltipConfig) =>
  buildPointDetails({
    ...cfg,
    overlayData: { hardwareConfig: {}, label: 'test-run' } as OverlayData,
  }).html;

describe.each([
  ['official', official],
  ['historical', historical],
  ['unofficial', overlay],
] as const)('%s pinned details', (_name, render) => {
  it('merges deployment, chips and concurrency into one line without losing full values', () => {
    const html = render(config());
    const content = text(html);
    expect(content).toContain('Multi-node disaggregated · 64 chips · conc 10,888');
    expect(buildPointDetails(config()).subtitle).toBe('FP4');
    expect(content).toContain('Chips Configuration Workers');
    expect(content).toContain('Prefill 32 DEP2 16');
    expect(content).toContain('Decode 32 DEP32 1');
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
    expect(text(partial)).toContain('CPU cache hit rate: 24.2%');
    expect(text(partial)).toContain('Theoretical cache hit rate: 97.3%');
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
    expect(content).toContain('Prefill 32 DWDP2PP2/DCP4/PCP8 16');
    expect(content).toContain('Decode 32 TEP32 1');
  });

  it('keeps aggregate topology distinct and unknown role metadata unknown', () => {
    const aggregate = text(
      render(config({ data: point({ disagg: false, ep: 4, dp: 2, dp_attention: false }) })),
    );
    expect(aggregate).toContain('Multi-node aggregate');
    expect(aggregate).toContain('EP4/DP2');
    expect(aggregate).not.toContain('Prefill');
    const missing = text(
      render(
        config({
          data: point({ prefill_num_workers: undefined, prefill_dp_attention: undefined }),
        }),
      ),
    );
    expect(missing).toContain('Prefill 32 TP2 / EP2 ?');
  });

  it('uses the existing Chinese labels', () => {
    const content = text(render(config({ locale: 'zh' })));
    expect(content).toContain('分离式 · 64 芯片 · 并发 10,888');
    expect(content).toContain('个芯片 配置 worker 数');
    expect(content).toContain('预填充 32 DEP2 16');
    expect(content).toContain('KV cache 命中率');
    expect(content).toContain('理论 97.3%');
  });

  it.each(['en', 'zh'] as const)(
    'keeps compact configuration without the details accordion (%s)',
    (locale) => {
      const html = render(config({ locale }));
      expect(html).toContain('DEP2');
      expect(html).toContain('DEP32');
      expect(html).not.toContain('pinned-raw-topology');
      expect(html).not.toContain('Configuration details');
      expect(html).not.toContain('配置详情');
      const aggregate = render(
        config({
          locale,
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
      expect(aggregate).not.toContain('pinned-raw-topology');
      expect(aggregate).not.toContain('Configuration details');
      expect(aggregate).not.toContain('配置详情');
    },
  );

  it('draws the token split proportionally while keeping exact counts', () => {
    const html = render(
      config({ data: point({ total_prompt_tokens: 75, total_generation_tokens: 25 }) }),
    );
    expect(html).toContain('data-token-prompt style="width: 75%;"');
    expect(html).toContain('data-token-generated style="width: 25%;"');
    expect(html).toContain('Prompt tokens: 75; Generated tokens: 25');
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

  it('does not invent tensor parallelism for legacy chip-count-only rows', () => {
    const html = render(
      config({
        data: point({
          disagg: false,
          tp: 8,
          physicalChips: 8,
          ep: undefined,
          prefill_ep: undefined,
          decode_ep: undefined,
          prefill_dcp_size: 4,
        }),
      }),
    );
    expect(text(html)).toContain('Multi-node aggregate · 8 chips · conc 10,888');
    expect(text(html)).toContain('DCP 4 ·');
    expect(html).not.toContain('>TP8<');
  });
});

describe('reader-facing fields', () => {
  const full = point({
    hwKey: 'gb300_sglang',
    model: 'DeepSeek-R1',
    date: '2026-11-05',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/42',
    image: `lmsysorg/sglang:v1@sha256:${'b'.repeat(64)}`,
    tp: 70,
    physicalChips: 70,
    is_multinode: true,
    prefill_tp: 3,
    prefill_ep: 5,
    prefill_pp: 7,
    prefill_dcp_size: 11,
    prefill_pcp_size: 13,
    prefill_dwdp_size: 17,
    prefill_dp_attention: true,
    prefill_num_workers: 19,
    num_prefill_gpu: 23,
    decode_tp: 29,
    decode_ep: 31,
    decode_pp: 37,
    decode_dcp_size: 41,
    decode_pcp_size: 43,
    decode_dp_attention: false,
    decode_num_workers: 2,
    num_decode_gpu: 47,
    spec_decoding: 'mtp',
    spec_algorithm: 'eagle3',
    spec_draft_model: 'org/draft-model',
    kv_p2p_transfer: 'nixl',
    router_name: 'sgl-router',
    router_version: '0.3.1',
    server_external_cache_hit_rate: 0.123,
    num_requests_total: 200,
    num_requests_successful: 199,
    power_tier: 'certified',
    avg_power_w: 812,
    p75_power_w: 830,
    p90_power_w: 845,
    prefill_avg_power_w: 700,
    decode_avg_power_w: 900,
    joules_per_output_token: 0.51,
    joules_per_total_token: 0.12,
    joules_per_input_token: 0.4,
    joules_per_successful_query: 1234,
    prefill_joules_per_input_token: 0.3,
    decode_joules_per_output_token: 0.6,
    avg_temp_c: 61,
    peak_temp_c: 78,
    avg_util_pct: 84,
    avg_mem_used_mb: 143_360,
    workers: Array.from({ length: 12 }, (_, i) => ({
      role: 'decode',
      worker_idx: i,
      num_gpus: 4,
      avg_power_w: 600 + i,
    })),
  });
  const expected = {
    en: [
      'Multi-node disaggregated · 70 chips · conc 10,888',
      'Prefill 23 DWDP17PP7/DCP11/PCP13 19',
      'Decode 47 EP31PP37/DCP41/PCP43 2',
      'Prefill TP 3 · EP 5 · DPA on · PP 7 · DCP 11 · PCP 13 · DWDP 17',
      'Decode TP 29 · EP 31 · DPA off · PP 37 · DCP 41 · PCP 43',
      'Offload type: DRAM',
      'KV transfer engine: NIXL',
      'Router: sgl-router 0.3.1',
      'External cache hit rate: 12.3%',
      'Chip 70.7%',
      'CPU 24.2%',
      'theoretical 97.3%',
      'EAGLE3 (org/draft-model)',
      'Requests: 199 / 200 (100%)',
      '566,443,844',
      '4,180,360',
      'Power measurement: Validated (current PowerX method)',
      'Measured chip power avg 812 W · P75 830 W · P90 845 W · prefill 700 W · decode 900 W',
      'Measured energy 0.51 J/output token · 0.12 J/total token · 0.4 J/input token · 1234 J/query · prefill 0.3 J/input token · decode 0.6 J/output token',
      'Chip telemetry 61 °C avg · 78 °C peak · 84% util · 140 GiB memory',
      'decode[11]',
      `lmsysorg/sglang:v1@sha256:${'b'.repeat(64)}`,
      'href="https://github.com/SemiAnalysisAI/InferenceX/actions/runs/42"',
    ],
    zh: [
      '多节点分离式 · 70 芯片 · 并发 10,888',
      '预填充 TP 3 · EP 5 · DPA 开启 · PP 7 · DCP 11 · PCP 13 · DWDP 17',
      '解码 TP 29 · EP 31 · DPA 关闭 · PP 37 · DCP 41 · PCP 43',
      '外部 Cache 命中率： 12.3%',
      '芯片实测功耗 平均 812 W · P75 830 W · P90 845 W · 预填充 700 W · 解码 900 W',
      '实测能耗 0.51 J/输出 token · 0.12 J/总 token · 0.4 J/输入 token · 1234 J/请求 · 预填充 0.3 J/输入 token · 解码 0.6 J/输出 token',
      '芯片遥测 平均 61 °C · 峰值 78 °C · 利用率 84% · 显存 140 GiB',
    ],
  } as const;

  it.each(['en', 'zh'] as const)(
    'renders every field of a fully populated point (%s)',
    (locale) => {
      const content = pointDetailsText(
        buildPointDetails(config({ locale, data: full, runUrl: full.run_url })),
      );
      for (const field of expected[locale]) expect(content, field).toContain(field);
    },
  );

  it('shows every aggregate width and marks unrecorded ones unknown', () => {
    const aggregate = (overrides: Partial<InferenceData>) =>
      text(
        buildPointDetails(
          config({
            data: point({
              disagg: false,
              is_multinode: false,
              tp: 8,
              physicalChips: 8,
              decode_tp: 8,
              ep: 8,
              dp: 2,
              pp: 1,
              dp_attention: true,
              prefill_dcp_size: 1,
              decode_dcp_size: 4,
              prefill_pcp_size: 2,
              decode_pcp_size: 1,
              prefill_dwdp_size: 4,
              prefill_num_workers: 2,
              ...overrides,
            }),
          }),
        ).html,
      );
    expect(aggregate({})).toContain(
      'TP 8 · EP 8 · DP 2 · DPA on · PP 1 · DCP 4 · PCP 2 · DWDP 4 · Workers 2',
    );
    expect(
      aggregate({
        ep: undefined,
        prefill_ep: undefined,
        dp: undefined,
        pp: undefined,
        dp_attention: undefined,
        prefill_dcp_size: undefined,
        decode_dcp_size: undefined,
        prefill_pcp_size: undefined,
        decode_pcp_size: undefined,
        prefill_dwdp_size: undefined,
      }),
    ).toContain('TP 8 · EP ? · DP ? · DPA ? · PP ? · DCP ? · PCP ? · DWDP 1');
  });
});
