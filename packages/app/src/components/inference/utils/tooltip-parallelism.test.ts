import { describe, it, expect } from 'vitest';

import type { InferenceData, HardwareConfig } from '@/components/inference/types';
import type { TooltipConfig } from '@/components/inference/utils/tooltipUtils';
import {
  comparisonDetailsText,
  detailsText,
} from '@/components/inference/utils/point-details-test-helpers';

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

describe('tooltip parallelism — old data (no ep field)', () => {
  it('shows GPU count when ep and prefill_ep are absent', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 4 }) }));
    expect(html).toContain('Single-node aggregate · 4 chips · conc 64');
    expect(html).not.toContain('Tensor parallelism');
    expect(html).not.toContain('Expert parallelism');
  });

  it('pluralizes chips for tp > 1', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 8 }) }));
    expect(html).toContain('8 chips');
  });

  it('uses singular chip for tp = 1', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 1 }) }));
    expect(html).toContain('1 chip ·');
    expect(html).not.toContain('1 chips');
  });
});

describe('tooltip parallelism — standard (ep field present)', () => {
  it('shows the prefill DWDP group width without calling it TP8', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          ep: 1,
          disagg: true,
          is_multinode: true,
          prefill_tp: 1,
          prefill_ep: 1,
          prefill_dwdp_size: 8,
          prefill_dp_attention: false,
          prefill_num_workers: 2,
          decode_tp: 8,
          decode_ep: 8,
          decode_dp_attention: true,
          decode_num_workers: 1,
        }),
      }),
    );
    expect(html).toContain('Chips Configuration Workers');
    expect(html).toContain('Prefill ? DWDP8 2');
    expect(html).toContain('Decode ? DEP8 1');
    expect(html).not.toContain('TP8');
  });

  it('shows multinode aggregate as one topology without prefill/decode roles', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 16,
          decode_tp: 8,
          ep: 1,
          pp: 2,
          is_multinode: true,
          dp_attention: false,
          disagg: false,
        }),
      }),
    );

    expect(html).toContain('Multi-node aggregate · 16 chips · TP8PP2 · conc 64');
    expect(html).not.toContain('Prefill');
    expect(html).not.toContain('Decode');
  });

  it('shows TP, EP and DP attention for non-multinode data', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 4, ep: 8, dp_attention: false }) }));
    expect(html).toContain('Single-node aggregate · 4 chips · EP8 · conc 64');
    expect(html).toContain('TP ? · EP 8 · DP ? · DPA off · PP ? · DCP ? · PCP ? · DWDP 1');
  });

  it('shows dp_attention as True when enabled', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 4, ep: 8, dp_attention: true }) }));
    expect(html).toContain('DPAEP8');
  });

  it('shows pipeline parallelism when pp > 1', () => {
    const html = detailsText(
      tooltipConfig({ data: pt({ tp: 16, decode_tp: 8, ep: 1, pp: 2, dp_attention: false }) }),
    );
    expect(html).toContain('TP8PP2');
  });

  it('hides pipeline parallelism when pp is 1, 0, or absent', () => {
    for (const pp of [1, 0, undefined]) {
      const html = detailsText(
        tooltipConfig({ data: pt({ tp: 8, ep: 1, pp, dp_attention: false }) }),
      );
      expect(html).toContain('8 chips · TP8 · conc 64');
      expect(html).toContain(`PP ${pp ?? '?'} ·`);
    }
  });

  it('shows aggregate DCP and PCP widths when they are greater than one', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 1,
          dp_attention: false,
          prefill_dcp_size: 1,
          decode_dcp_size: 8,
          prefill_pcp_size: 4,
          decode_pcp_size: 1,
        }),
      }),
    );

    expect(html).toContain('TP8/DCP8/PCP4');
  });

  it('hides default DCP and PCP widths', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 1,
          prefill_dcp_size: 1,
          decode_dcp_size: 1,
          prefill_pcp_size: 1,
          decode_pcp_size: 1,
        }),
      }),
    );

    expect(html).toContain('8 chips · TP8 / EP1 · conc 64');
    expect(html).toContain('DCP 1 · PCP 1');
  });

  it('keeps an unknown expert width unknown when ep is null', () => {
    const d = pt({ tp: 4 });
    (d as any).ep = null;
    (d as any).prefill_ep = 2;
    const html = detailsText(tooltipConfig({ data: d }));
    expect(html).toContain('4 chips · TP4 · conc 64');
    expect(html).toContain('EP ? ·');
  });
});

describe('tooltip parallelism — multinode disagg', () => {
  it('shows prefill and decode rows for multinode disagg', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
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
          decode_num_workers: 3,
          num_prefill_gpu: 16,
          num_decode_gpu: 24,
        }),
      }),
    );
    expect(html).toContain('Multi-node disaggregated ·');
    expect(html).toContain('Chips Configuration Workers');
    expect(html).toContain('Prefill 16 TEP4 2');
    expect(html).toContain('Decode 24 DPAEP32 3');
  });

  it('falls back to shared values and keeps missing role fields unknown', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          dp_attention: true,
        }),
      }),
    );
    expect(html).toContain('Prefill ? DPAEP4 ?');
    expect(html).toContain('Decode ? DPAEP4 ?');
  });

  it('shows per-role PP only when a role uses it', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 1,
          is_multinode: true,
          disagg: true,
          prefill_tp: 8,
          prefill_ep: 1,
          prefill_pp: 2,
          prefill_dp_attention: false,
          decode_tp: 8,
          decode_ep: 1,
          decode_pp: 1,
          decode_dp_attention: false,
          prefill_num_workers: 1,
          decode_num_workers: 1,
          num_prefill_gpu: 16,
          num_decode_gpu: 8,
        }),
      }),
    );
    expect(html).toContain('Prefill 16 TP8PP2 1');
    expect(html).toContain('Decode 8 TP8 1');
  });

  it('shows per-role DCP and PCP in disaggregated details', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 16,
          ep: 1,
          is_multinode: true,
          disagg: true,
          prefill_tp: 8,
          prefill_ep: 1,
          prefill_dcp_size: 2,
          prefill_pcp_size: 4,
          prefill_dp_attention: false,
          decode_tp: 8,
          decode_ep: 1,
          decode_dcp_size: 8,
          decode_pcp_size: 1,
          decode_dp_attention: false,
          num_prefill_gpu: 8,
          num_decode_gpu: 8,
        }),
      }),
    );

    expect(html).toContain('Prefill 8 TP8/DCP2/PCP4 ?');
    expect(html).toContain('Decode 8 TP8/DCP8 ?');
  });

  it('shows "?" for missing chip count fields', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 4,
          ep: 2,
          is_multinode: true,
          disagg: true,
        }),
      }),
    );
    expect(html).toContain('Prefill ? TP4 / EP2 ?');
  });

  it('also works with comparison details', () => {
    const html = comparisonDetailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          prefill_tp: 4,
          prefill_ep: 4,
          decode_tp: 8,
          decode_ep: 8,
          decode_dp_attention: true,
          num_prefill_gpu: 8,
          num_decode_gpu: 16,
        }),
      }),
    );
    expect(html).toContain('Prefill 8 TP4 / EP4');
    expect(html).toContain('Decode 16 DEP8');
  });
});

describe('tooltip parallelism — zh locale', () => {
  it('localizes the standard parallelism labels', () => {
    const config = tooltipConfig({
      data: pt({ tp: 16, decode_tp: 8, ep: 1, pp: 2, dp_attention: false }),
      locale: 'zh',
    });
    const text = detailsText(config);
    expect(text).toContain('单节点聚合 · 16 芯片 · TP8PP2 · 并发 64');
    expect(text).not.toContain('配置详情');
    expect(text).not.toContain('Parallelism strategy');
  });

  it('localizes DCP and PCP labels', () => {
    const text = detailsText(
      tooltipConfig({
        data: pt({ tp: 8, ep: 1, dp_attention: false, decode_dcp_size: 8, prefill_pcp_size: 4 }),
        locale: 'zh',
      }),
    );

    expect(text).toContain('8 芯片 · TP8/DCP8/PCP4 · 并发 64');
  });

  it('localizes the old-data parallelism strategy line', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 4 }), locale: 'zh' }));
    expect(html).toContain('单节点聚合 · 4 芯片 · 并发 64');
  });

  it('localizes the multinode disagg role rows', () => {
    const html = detailsText(
      tooltipConfig({
        data: pt({
          tp: 8,
          ep: 4,
          is_multinode: true,
          disagg: true,
          num_prefill_gpu: 16,
          num_decode_gpu: 24,
        }),
        locale: 'zh',
      }),
    );
    expect(html).toContain('分离式');
    expect(html).toContain('个芯片 配置 worker 数');
    expect(html).toContain('预填充 16 TP8 / EP4');
    expect(html).toContain('解码 24 TP8 / EP4');
  });
});

describe('tooltip — chip count', () => {
  it('always shows the chip count in the standard tooltip', () => {
    const html = detailsText(tooltipConfig({ data: pt({ tp: 16 }) }));
    expect(html).toContain('16 chips');
  });

  it('always shows the chip count in the GPU graph tooltip', () => {
    const html = comparisonDetailsText(tooltipConfig({ data: pt({ tp: 32 }) }));
    expect(html).toContain('32 chips');
  });
});
