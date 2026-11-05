import { formatNumber, getDisplayLabel } from '@/lib/shared/utils';
import { getPointHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { specMethodDisplayLabel } from '@/lib/compare/compare-variant-slug';
import { agenticDetailHref } from '@/lib/agentx/agentic-detail-link';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import type { Locale } from '@/lib/i18n/i18n';
import type { PowerBasisLabelStyle } from '@/lib/power/power-basis';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';
import { chartStateHref } from '@/lib/routing/url-state';
import type {
  SystemPowerUnit,
  SystemPowerUnsupportedReason,
} from '@/lib/power/modeled-system-power';
import {
  SYSTEM_POWER_MODEL_SOURCE_URL,
  type SystemPowerWorkload,
} from '@/lib/power/system-power-model';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import { powerBasisPillHtml } from '@/components/inference/powerx/PowerBasisPill';
import {
  isAllInMeasuredConfigKey,
  isMeasuredEnergyConfigKey,
} from '@/components/inference/metric-registry';
import { getMeasuredMetricConfig } from '@/components/inference/measured-metric-config';
import { powerVariantLabel } from '@/components/inference/utils/power-compare';
import {
  POWER_TIMELINE_METRIC_KEY,
  traceKeyForPoint,
} from '@/components/inference/utils/powerTimeline';
import { reconstructedRoleEnergy } from '@/components/inference/utils/role-energy';
import {
  configSegmentLabel,
  meaningfulParallelismSize,
  parallelismLabel,
} from '@/components/inference/utils/parallelism-label';
import {
  cacheImplementationLabel,
  offloadTypeLabel,
  versionedComponentLabel,
} from '@/components/inference/utils/runtime-metadata-labels';

export interface TooltipConfig {
  data: InferenceData;
  isPinned: boolean;
  xLabel: string;
  yLabel: string;
  selectedYAxisMetric: string;
  hardwareConfig: HardwareConfig;
  runUrl?: string;
  hasTrace?: boolean;
  hasLog?: boolean;
  showPowerTelemetry?: boolean;
  locale?: Locale;
  /** PowerX names boundaries the way its Count control does (GPU only, Whole system). */
  powerLabelStyle?: PowerBasisLabelStyle;
  /** The viewer is on a touch-primary device: the pinned hint says Tap, not Click. */
  touch?: boolean;
  /** Resolved series color, including the per-run color for unofficial points. */
  color?: string;
}

export interface OverlayTooltipConfig extends TooltipConfig {
  overlayData: OverlayData;
}

const asBool = (v: boolean | string | undefined): boolean | undefined =>
  typeof v === 'string' ? v === 'true' : v;

export const getPointLabel = (d: InferenceData): string => {
  const aggregateDcp = meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size);
  const aggregatePcp = meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size);
  const label = parallelismLabel({
    tp: d.decode_tp ?? d.tp,
    dp: d.dp,
    ep: d.ep,
    pp: d.pp,
    dcp: d.disagg ? (d.decode_dcp_size ?? d.prefill_dcp_size) : aggregateDcp,
    pcp: d.disagg ? (d.decode_pcp_size ?? d.prefill_pcp_size) : aggregatePcp,
    dpAttention: asBool(d.dp_attention),
    disagg: d.disagg,
    isMultinode: d.is_multinode,
    prefillTp: d.prefill_tp,
    prefillEp: d.prefill_ep,
    prefillPp: d.prefill_pp,
    prefillDcp: d.prefill_dcp_size,
    prefillPcp: d.prefill_pcp_size,
    prefillDwdp: d.prefill_dwdp_size,
    prefillDpAttention: asBool(d.prefill_dp_attention),
    prefillNumWorkers: d.prefill_num_workers,
    decodeTp: d.decode_tp,
    decodeEp: d.decode_ep,
    decodePp: d.decode_pp,
    decodeDcp: d.decode_dcp_size,
    decodePcp: d.decode_pcp_size,
    decodeDpAttention: asBool(d.decode_dp_attention),
    decodeNumWorkers: d.decode_num_workers,
  });
  return label;
};

const runLinkHTML = (runUrl: string | undefined, locale: Locale, hardware: string) =>
  runUrl && !hardware.startsWith('tpu')
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">${locale === 'zh' ? 'GitHub Actions 运行记录' : 'GitHub Actions Run'}</a>
      </div>`
    : '';

const labelColon = (label: string) => (/[\u4E00-\u9FFF]/u.test(label) ? '：' : ':');

const tooltipLine = (label: string, value: string | number) =>
  `<div class="tooltip-line" style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}${labelColon(label)}</strong> ${value}</div>`;

const formatPct = (v: number | undefined): string | null =>
  v === undefined || v === null || Number.isNaN(v) ? null : `${(v * 100).toFixed(1)}%`;

const formatTooltipDate = (value: string, locale: Locale): string => {
  if (locale !== 'zh') return value;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) return value;
  return `${Number(match.groups.year)}年${Number(match.groups.month)}月${Number(match.groups.day)}日`;
};

export const fmt = (v: number): string => {
  if (!Number.isFinite(v)) return String(v);
  const rounded = parseFloat(v.toFixed(3));
  if (Math.abs(rounded) >= 10000) return new Intl.NumberFormat('en-US').format(rounded);
  return String(rounded);
};

const TOOLTIP_STRINGS = {
  en: {
    dismiss: 'Click elsewhere to dismiss',
    dismissTouch: 'Tap elsewhere to dismiss',
    unofficialRun: '✕ UNOFFICIAL RUN',
    date: 'Date',
    dataFrom: (d: string) => `(data from ${d})`,
    image: 'Image',
    branch: 'Branch',
    chipConfig: 'Chip Config',
    totalChips: 'Total Chips',
    concurrency: 'Concurrency',
    precision: 'Precision',
    inputTputPerChip: 'Input Token Throughput per Chip',
    outputTputPerChip: 'Output Token Throughput per Chip',
    powerData: 'Power Measurement',
    powerCertified: 'Validated (current PowerX method)',
    powerLegacy: 'Historical (not validated under the current method)',
    powerWithheld: 'Measured power withheld',
    series: 'Series',
    roleEnergyShare: 'Share of request energy',
  },
  zh: {
    dismiss: '点击其他区域关闭',
    dismissTouch: '点按其他区域关闭',
    unofficialRun: '✕ 非官方运行',
    date: '日期',
    dataFrom: (d: string) => `（数据来自 ${d}）`,
    image: '镜像',
    branch: '分支',
    chipConfig: '芯片配置',
    totalChips: '芯片总数',
    concurrency: '并发数',
    precision: '精度',
    inputTputPerChip: '每芯片输入 token 吞吐量',
    outputTputPerChip: '每芯片输出 token 吞吐量',
    powerData: '功耗测量',
    powerCertified: '已验证（采用当前 PowerX 方法）',
    powerLegacy: '历史测量（尚未按当前方法验证）',
    powerWithheld: '实测功耗未采信',
    series: '系列',
    roleEnergyShare: '在请求能耗中的占比',
  },
} as const;

const powerVariantHTML = (
  d: InferenceData,
  selectedYAxisMetric: string,
  locale: Locale,
  labelStyle?: PowerBasisLabelStyle,
): string => {
  const variant = d.powerVariant;
  if (!variant) return '';
  const t = TOOLTIP_STRINGS[locale];
  let html = tooltipLine(t.series, powerVariantLabel(variant, locale, labelStyle));
  if (
    variant.kind === 'role' &&
    variant.id !== 'all' &&
    getMeasuredMetricConfig(selectedYAxisMetric)?.family === 'energy'
  ) {
    const energy = reconstructedRoleEnergy(d);
    if (energy) {
      const share = variant.id === 'prefill' ? energy.prefillShare : 100 - energy.prefillShare;
      html += tooltipLine(t.roleEnergyShare, `${share.toFixed(1)}%`);
    }
  }
  return html;
};

const powerTierHTML = (d: InferenceData, selectedYAxisMetric: string, locale: Locale): string => {
  if (!isMeasuredEnergyConfigKey(selectedYAxisMetric) || !d.power_tier) return '';
  const t = TOOLTIP_STRINGS[locale];
  return tooltipLine(t.powerData, d.power_tier === 'certified' ? t.powerCertified : t.powerLegacy);
};

const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const SYSTEM_POWER_STRINGS = {
  en: {
    heading: 'InferenceX Power Model (beta)',
    details: 'Deployment & model details',
    measuredGpu: 'Measured GPU power',
    itPerGpu: 'Measured IT power per GPU (no PUE)',
    facilityPerGpu: 'Measured facility power per GPU',
    deploymentIt: 'Measured deployment IT power',
    facility: 'Measured facility power',
    state: 'Operating state',
    workloads: {
      'fixed-seq-len': 'fixed sequence length',
      agentic: 'agentic',
      'agentic-cpu-offloading': 'agentic with KV cache offload',
    } satisfies Record<SystemPowerWorkload, string>,
    scaleOut: (on: boolean) => (on ? 'scale-out on' : 'scale-out off'),
    graceSocket: 'Measured Grace socket power',
    units: {
      chassis: {
        assumptions:
          'Host CPU, DRAM, and NIC power follow the operating state; fan power and PSU losses follow chassis load.',
        network:
          'IT power adds the chassis share of scale-out switches, at idle power when scale-out is off.',
        topology: (units: number, measured: number, modeled: number) =>
          measured === modeled
            ? `${units} full eight-GPU chassis · ${measured} GPUs`
            : `${units} eight-GPU chassis · ${measured} of ${modeled} GPUs measured, extrapolated to full chassis`,
        extrapolation:
          'Unmeasured chassis GPUs are assumed to run the same workload at the measured per-GPU power; deployment values are the measured GPUs’ share.',
        uniformHosts:
          'No per-host telemetry for this multinode deployment; every chassis is modeled at the deployment-mean GPU power.',
        normalization:
          'IT power is divided by all modeled chassis GPUs, including prefill and decode.',
        boundary: 'Includes GPU chassis CPUs; excludes separate CPU-only frontend/router hosts.',
      },
      'nvl72-tray': {
        assumptions:
          'Measured: GPU boards and whole Grace sockets (CPU, SysIO, LPDDR5X). Modeled: tray NICs, optics, drives, fans, and 48 V conversion; NVSwitch trays and power shelves.',
        modeledCpuAssumptions:
          'Measured: GPU boards. Modeled: Grace CPUs and LPDDR5X for the operating state (no validated Grace-socket telemetry for this run), tray NICs, optics, drives, fans, and 48 V conversion; NVSwitch trays and power shelves.',
        network:
          'IT power adds the rack share of scale-out switches, at idle power when scale-out is off.',
        topology: (units: number, measured: number, modeled: number) => {
          const noun = units === 1 ? 'tray' : 'trays';
          return measured === modeled
            ? `${units} full NVL72 compute ${noun} · ${measured} GPUs`
            : `${units} NVL72 compute ${noun} · ${measured} of ${modeled} GPUs measured, extrapolated to full ${noun}`;
        },
        extrapolation:
          'Unmeasured tray GPUs are assumed to run the same workload at the measured per-GPU power; deployment values are the measured GPUs’ share.',
        uniformHosts:
          'No per-host telemetry for this multinode deployment; every tray is modeled at the deployment-mean GPU power.',
        normalization:
          'The measured trays fold into an 18-tray rack at their mean GPU power (and measured Grace power, when available); each tray takes 1/18 of the rack, divided by its four GPUs.',
        boundary:
          'Includes the trays’ Grace CPUs; excludes separate CPU-only frontend/router hosts.',
      },
    } satisfies Record<SystemPowerUnit, unknown>,
    model: 'Power model source',
    unavailable: 'System-power estimate unavailable',
    reasons: {
      workload: 'The power model has no workload state for this benchmark type.',
      hardware: 'No matching chassis model is available for this hardware.',
      telemetry: 'Validated measured GPU power is required.',
      'gpu-count': 'A valid deployment GPU count is required.',
      topology: 'The available topology does not establish chassis placement.',
      'role-power': 'Valid measured power and topology are required for every GPU worker role.',
      'model-domain': 'The measured input is outside the source model’s supported range.',
    } satisfies Record<SystemPowerUnsupportedReason, string>,
  },
  zh: {
    heading: 'InferenceX 功耗模型（Beta）',
    details: '部署与模型详情',
    measuredGpu: 'GPU 实测功耗',
    itPerGpu: '每 GPU 实测 IT 功耗（不含 PUE）',
    facilityPerGpu: '每 GPU 实测数据中心功耗',
    deploymentIt: '整个部署的实测 IT 功耗',
    facility: '实测数据中心功耗',
    state: '运行状态',
    workloads: {
      'fixed-seq-len': '固定序列长度',
      agentic: '智能体',
      'agentic-cpu-offloading': '智能体（含 KV cache offload）',
    } satisfies Record<SystemPowerWorkload, string>,
    scaleOut: (on: boolean) => (on ? 'scale-out 开启' : 'scale-out 关闭'),
    graceSocket: 'Grace socket 实测功耗',
    units: {
      chassis: {
        assumptions:
          '主机 CPU、DRAM 和 NIC 功耗取决于运行状态；风扇功耗和 PSU 损耗随机箱负载变化。',
        network: 'IT 功耗包含该机箱分摊的 scale-out 交换机功耗；scale-out 关闭时按空闲功耗计。',
        topology: (units: number, measured: number, modeled: number) =>
          measured === modeled
            ? `${units} 个完整八卡机箱 · ${measured} 张 GPU`
            : `${units} 个八卡机箱 · 实测 ${measured}/${modeled} 张 GPU，按满机箱外推`,
        extrapolation:
          '假设机箱内未实测的 GPU 运行相同负载、功耗与实测每卡功耗相同；部署数值为实测 GPU 所占份额。',
        uniformHosts: '该多节点部署没有逐主机功耗数据；每个机箱按部署平均每卡功耗建模。',
        normalization: 'IT 功耗按所有建模机箱的 GPU 总数分摊，包括 Prefill 与 Decode。',
        boundary: '计入 GPU 机箱内的 CPU；不计入独立的纯 CPU 前端或路由主机。',
      },
      'nvl72-tray': {
        assumptions:
          '实测：GPU 板卡和整个 Grace socket（CPU、SysIO、LPDDR5X）。建模：tray 内的网卡、光模块、硬盘、风扇和 48 V 转换损耗，以及 NVSwitch tray 和电源架。',
        modeledCpuAssumptions:
          '实测：GPU 板卡。建模：按运行状态估算的 Grace CPU 和 LPDDR5X（该运行没有通过验证的 Grace socket 遥测），tray 内的网卡、光模块、硬盘、风扇和 48 V 转换损耗，以及 NVSwitch tray 和电源架。',
        network: 'IT 功耗包含机架分摊的 scale-out 交换机功耗；scale-out 关闭时按空闲功耗计。',
        topology: (units: number, measured: number, modeled: number) =>
          measured === modeled
            ? `${units} 个完整 NVL72 计算 tray · ${measured} 张 GPU`
            : `${units} 个 NVL72 计算 tray · 实测 ${measured}/${modeled} 张 GPU，按满 tray 外推`,
        extrapolation:
          '假设 tray 内未实测的 GPU 运行相同负载、功耗与实测每卡功耗相同；部署数值为实测 GPU 所占份额。',
        uniformHosts: '该多节点部署没有逐主机功耗数据；每个 tray 按部署平均每卡功耗建模。',
        normalization:
          '实测 tray 按 GPU 平均功耗（以及可用时的 Grace 实测功耗）合并为一个 18 tray 的机架；每个 tray 分摊机架的 1/18，再除以 tray 内 4 张 GPU。',
        boundary: '计入 tray 内的 Grace CPU；不计入独立的纯 CPU 前端或路由主机。',
      },
    } satisfies Record<SystemPowerUnit, unknown>,
    model: '功耗模型来源',
    unavailable: '无法估算系统功耗',
    reasons: {
      workload: '功耗模型没有适用于该基准测试类型的工作负载状态。',
      hardware: '该硬件没有匹配的机箱功耗模型。',
      telemetry: '需要通过验证的 GPU 实测功耗。',
      'gpu-count': '需要有效的部署 GPU 数量。',
      topology: '现有拓扑信息无法确认 GPU 所在的机箱。',
      'role-power': '每个 GPU worker 角色都需要有效的实测功耗和拓扑信息。',
      'model-domain': '实测输入超出功耗模型的支持范围。',
    } satisfies Record<SystemPowerUnsupportedReason, string>,
  },
} as const;

/** Power readings: whole watts with grouping — sub-watt digits are model noise. */
const fmtWatts = (value: number): string => Math.round(value).toLocaleString('en-US');

/** Y-axis metrics whose values are watts, shown rounded to whole watts. */
const WATT_METRICS = new Set([
  'y_measuredAvgPower',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_itModeledWatts',
  'y_utilityModeledWatts',
]);

const fmtY = (value: number, metric: string): string =>
  WATT_METRICS.has(metric) && Number.isFinite(value) ? fmtWatts(value) : fmt(value);

/** A point's y value as the tooltip prints it for the metric (watts get their own format). */
export const formatMetricValue = fmtY;

const modeledSystemPowerHTML = (
  d: InferenceData,
  selectedYAxisMetric: string,
  isPinned: boolean,
  locale: Locale,
): string => {
  const estimate = d.modeledSystemPower;
  if (
    !estimate ||
    (!isMeasuredEnergyConfigKey(selectedYAxisMetric) &&
      !isAllInMeasuredConfigKey(selectedYAxisMetric))
  ) {
    return '';
  }
  const t = SYSTEM_POWER_STRINGS[locale];
  if (estimate.status === 'unsupported') {
    if (!isPinned || estimate.reason === 'workload') return '';
    return tooltipLine(t.unavailable, t.reasons[estimate.reason]);
  }
  const u = t.units[estimate.unit];
  return `<div data-testid="tooltip-modeled-system-power" style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 6px; font-size: 11px;">
    <strong>${t.heading}</strong>
    ${tooltipLine(t.measuredGpu, `${fmtWatts(estimate.measuredGpuWattsPerGpu)} W/GPU${powerBasisPillHtml('gpu', locale)}`)}
    ${estimate.unit === 'nvl72-tray' && estimate.measuredGraceSocketWatts !== null ? tooltipLine(t.graceSocket, `${fmtWatts(estimate.measuredGraceSocketWatts)} W/socket`) : ''}
    ${tooltipLine(t.itPerGpu, `${fmtWatts(estimate.itWattsPerGpu)} W/GPU${powerBasisPillHtml('it', locale)}`)}
    ${tooltipLine(t.facilityPerGpu, `${fmtWatts(estimate.deploymentFacilityWatts / estimate.gpuCount)} W/GPU${powerBasisPillHtml('facility', locale)}`)}
    ${
      isPinned
        ? `
      <details data-testid="tooltip-power-model-details" style="margin-top: 2px;">
      <summary style="cursor: pointer; color: var(--muted-foreground);">${t.details}</summary>
      ${tooltipLine(t.state, `${t.workloads[estimate.operatingState.workload]} · ${t.scaleOut(estimate.operatingState.scaleOut)}`)}
      ${tooltipLine(t.deploymentIt, `${fmtWatts(estimate.deploymentItWatts)} W`)}
      ${tooltipLine(`${t.facility} (PUE ${fmt(estimate.pue)})`, `${fmtWatts(estimate.deploymentFacilityWatts)} W`)}
      <div style="color: var(--muted-foreground); margin-bottom: 4px;">${u.topology(estimate.chassisCount, estimate.gpuCount, estimate.modeledGpuCount)}${estimate.chassisBasis === 'extrapolated' ? `<br/>${u.extrapolation}` : ''}${estimate.topologyBasis === 'uniform-hosts' ? `<br/>${u.uniformHosts}` : ''}<br/>${estimate.unit === 'nvl72-tray' && estimate.cpuBasis === 'modeled' ? t.units['nvl72-tray'].modeledCpuAssumptions : u.assumptions}<br/>${u.network}<br/>${u.normalization}<br/>${u.boundary}</div>
      </details>
      ${tooltipLine(t.model, `<a href="${escapeHtml(SYSTEM_POWER_MODEL_SOURCE_URL)}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">${escapeHtml(estimate.hardware)} · ${escapeHtml(estimate.modelRevision.slice(0, 12))}</a>`)}
    `
        : ''
    }
  </div>`;
};

const WORKER_POWER_STRINGS = {
  en: {
    heading: 'Measured Worker Power',
    chips: 'chips',
    more: (n: number) => `+${n} more workers`,
  },
  zh: {
    heading: '各 Worker 实测功耗',
    chips: '芯片',
    more: (n: number) => `另有 ${n} 个 worker`,
  },
} as const;

const WORKER_ROWS_LIMIT = 8;

const generateWorkerPowerHTML = (d: InferenceData, isPinned: boolean, locale: Locale): string => {
  if (!isPinned || !Array.isArray(d.workers) || d.workers.length === 0) return '';
  const t = WORKER_POWER_STRINGS[locale];
  const rows = d.workers.slice(0, WORKER_ROWS_LIMIT).map((w) => {
    const parts = [
      `<strong>${escapeHtml(w.role)}[${w.worker_idx}]</strong>`,
      `${w.num_gpus} ${t.chips}`,
      `${fmt(w.avg_power_w)} W`,
    ];
    if (typeof w.avg_temp_c === 'number') {
      parts.push(
        typeof w.peak_temp_c === 'number'
          ? `${fmt(w.avg_temp_c)}/${fmt(w.peak_temp_c)}°C`
          : `${fmt(w.avg_temp_c)}°C`,
      );
    }
    if (typeof w.avg_util_pct === 'number') parts.push(`${fmt(w.avg_util_pct)}%`);
    if (typeof w.avg_mem_used_mb === 'number') parts.push(`${fmt(w.avg_mem_used_mb / 1024)} GiB`);
    if (Array.isArray(w.hosts) && w.hosts.length > 0) parts.push(escapeHtml(w.hosts.join(',')));
    return `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px; overflow-wrap: anywhere;">${parts.join(' · ')}</div>`;
  });
  const overflow = d.workers.length - WORKER_ROWS_LIMIT;
  return `<div data-testid="tooltip-worker-power" style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 6px;">
      <div style="color: var(--foreground); font-size: 11px; font-weight: 600; margin-bottom: 4px;">${t.heading}</div>
      ${rows.join('')}
      ${overflow > 0 ? `<div style="color: var(--muted-foreground); font-size: 11px;">${t.more(overflow)}</div>` : ''}
    </div>`;
};

const CACHE_STRINGS = {
  en: {
    offloadType: 'Offload Type',
    offloadBackend: 'KV Offload Engine',
    transferEngine: 'KV Transfer Engine',
    router: 'Router',
    gpuHitRate: 'Chip Cache Hit Rate',
    cpuHitRate: 'CPU Cache Hit Rate',
    combinedHitRate: 'Combined Chip + CPU Cache Hit Rate',
    theoreticalHitRate: 'Theoretical Cache Hit Rate',
    legacyEnabled: 'Enabled (legacy data)',
    legacyDisabled: 'Disabled (legacy data)',
  },
  zh: {
    offloadType: 'offload 类型',
    offloadBackend: 'KV offload 引擎',
    transferEngine: 'KV 传输引擎',
    router: '路由器',
    gpuHitRate: '芯片 Cache 命中率',
    cpuHitRate: 'CPU Cache 命中率',
    combinedHitRate: '芯片 + CPU 综合 Cache 命中率',
    theoreticalHitRate: '理论 Cache 命中率',
    legacyEnabled: '已启用（旧版数据）',
    legacyDisabled: '已禁用（旧版数据）',
  },
} as const;

const generateCacheMetadataHTML = (
  d: InferenceData,
  locale: Locale,
  isPinned = false,
  color = 'var(--foreground)',
): string => {
  const t = CACHE_STRINGS[locale];
  const parts: string[] = [];
  const offloadType = d.kv_offloading?.trim();
  if (offloadType && offloadType.toLowerCase() !== 'none') {
    parts.push(tooltipLine(t.offloadType, offloadTypeLabel(offloadType)));
  } else if (!offloadType && d.benchmark_type === 'agentic_traces' && d.offload_mode) {
    const enabled = d.offload_mode.toLowerCase() === 'on';
    parts.push(tooltipLine(t.offloadType, enabled ? t.legacyEnabled : t.legacyDisabled));
  }
  if (d.kv_offload_backend) {
    parts.push(
      tooltipLine(
        t.offloadBackend,
        versionedComponentLabel(d.kv_offload_backend, d.kv_offload_backend_version)!,
      ),
    );
  }
  if (d.kv_p2p_transfer) {
    parts.push(tooltipLine(t.transferEngine, cacheImplementationLabel(d.kv_p2p_transfer)));
  }
  if (d.router_name) {
    parts.push(tooltipLine(t.router, versionedComponentLabel(d.router_name, d.router_version)!));
  }

  // Keep partial metadata when a chip rate is absent; the bar cannot represent it.
  const cacheBar = isPinned ? hoverCacheHTML(d, color, locale) : '';
  if (cacheBar) {
    parts.unshift(`<div data-pinned-cache style="margin-bottom: 12px;">${cacheBar}</div>`);
    return parts.join('');
  }

  const gpuHit = formatPct(d.server_gpu_cache_hit_rate);
  const cpuHit = formatPct(d.server_cpu_cache_hit_rate);
  const theoreticalHit = formatPct(d.theoretical_cache_hit_rate);
  const offloadEnabled = isKvOffloadEnabled(d);
  const combinedHit = offloadEnabled && frameworkFamily(d.framework) === 'trt';
  if (gpuHit) parts.push(tooltipLine(combinedHit ? t.combinedHitRate : t.gpuHitRate, gpuHit));
  if (cpuHit && offloadEnabled && !combinedHit) parts.push(tooltipLine(t.cpuHitRate, cpuHit));
  if (theoreticalHit) parts.push(tooltipLine(t.theoreticalHitRate, theoreticalHit));
  return parts.join('');
};

const AGENTIC_STRINGS = {
  en: {
    speculativeDecoding: 'Speculative Decoding',
    off: 'Off',
    native: 'native',
    requests: 'Requests',
    promptTokens: 'Prompt Tokens',
    generatedTokens: 'Generated Tokens',
    tokens: 'Tokens',
  },
  zh: {
    speculativeDecoding: '投机解码',
    off: '关闭',
    native: '原生',
    requests: '请求',
    promptTokens: '提示 token',
    generatedTokens: '生成 token',
    tokens: 'Token 数',
  },
} as const;

const SPEC_ALGORITHM_LABELS: Record<string, string> = {
  mtp: 'MTP',
  dspark: 'DSpark',
  dflash: 'DFlash',
  eagle: 'EAGLE',
  eagle3: 'EAGLE3',
  nextn: 'NextN',
};

const speculativeDecodingLabel = (
  d: InferenceData,
  t: (typeof AGENTIC_STRINGS)[Locale],
): string => {
  const specMethod = d.spec_decoding ?? 'none';
  if (specMethod === 'none' || specMethod === '') return t.off;
  if (!d.spec_algorithm) return specMethodDisplayLabel(d.model, specMethod);
  const algorithm = SPEC_ALGORITHM_LABELS[d.spec_algorithm] ?? d.spec_algorithm.toUpperCase();
  const draft = d.spec_draft_model;
  return `${algorithm} (${!draft || draft === 'native' ? t.native : escapeHtml(draft)})`;
};

const tokenBreakdownHTML = (d: InferenceData, locale: Locale): string => {
  const prompt = d.total_prompt_tokens;
  const generated = d.total_generation_tokens;
  if (
    prompt === undefined ||
    generated === undefined ||
    !Number.isFinite(prompt) ||
    !Number.isFinite(generated) ||
    prompt < 0 ||
    generated < 0 ||
    !Number.isFinite(prompt + generated)
  )
    return '';
  const t = AGENTIC_STRINGS[locale];
  const total = prompt + generated;
  const promptWidth = total === 0 ? 0 : (prompt / total) * 100;
  const generatedWidth = total === 0 ? 0 : 100 - promptWidth;
  return `<div data-pinned-tokens class="pinned-token-breakdown">
    <div class="pinned-bar-heading"><span>${t.tokens}</span><strong>${formatHoverValue(total)}</strong></div>
    <div class="pinned-token-track" role="img" aria-label="${t.promptTokens}: ${formatNumber(prompt)}; ${t.generatedTokens}: ${formatNumber(generated)}">
      <span data-token-prompt style="width: ${promptWidth}%;"></span>
      <span data-token-generated style="width: ${generatedWidth}%;"></span>
    </div>
    <div class="pinned-token-legend">
      <div><span class="pinned-token-label"><i class="token-prompt-dot"></i>${t.promptTokens}</span><span class="pinned-token-count">${formatNumber(prompt)}</span></div>
      <div><span class="pinned-token-label"><i class="token-generated-dot"></i>${t.generatedTokens}</span><span class="pinned-token-count">${formatNumber(generated)}</span></div>
    </div>
  </div>`;
};

const generateAgenticHTML = (d: InferenceData, locale: Locale, isPinned = false): string => {
  if (d.benchmark_type !== 'agentic_traces') return '';

  const t = AGENTIC_STRINGS[locale];
  const parts: string[] = [tooltipLine(t.speculativeDecoding, speculativeDecodingLabel(d, t))];

  if (d.num_requests_total !== undefined && d.num_requests_successful !== undefined) {
    const successPct =
      d.num_requests_total > 0
        ? ` (${((d.num_requests_successful / d.num_requests_total) * 100).toFixed(0)}%)`
        : '';
    parts.push(
      tooltipLine(
        t.requests,
        `${d.num_requests_successful} / ${d.num_requests_total}${successPct}`,
      ),
    );
  }

  const tokenBar = isPinned ? tokenBreakdownHTML(d, locale) : '';
  if (tokenBar) {
    parts.push(tokenBar);
  } else if (d.total_prompt_tokens !== undefined) {
    parts.push(tooltipLine(t.promptTokens, formatNumber(d.total_prompt_tokens)));
  }
  if (!tokenBar && d.total_generation_tokens !== undefined) {
    parts.push(tooltipLine(t.generatedTokens, formatNumber(d.total_generation_tokens)));
  }

  return parts.join('');
};

const ACTION_STRINGS = {
  en: {
    charts: 'View charts',
    logs: 'View logs',
    powerTelemetry: 'View PowerX',
    powerTrace: 'View power trace',
  },
  zh: {
    charts: '查看图表',
    logs: '查看日志',
    powerTelemetry: '查看 PowerX',
    powerTrace: '查看功耗曲线',
  },
} as const;

type TooltipAction = 'view-charts' | 'view-logs' | 'view-power-trace';

const pointDetailActionLink = (action: TooltipAction, href: string, label: string) =>
  `<a data-action="${action}" href="${href}" style="
    display: block; width: 100%; padding: 4px 8px; font-size: 11px; font-weight: 500;
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    background: var(--accent); color: var(--accent-foreground); text-align: center; text-decoration: none;
  ">${label} &rarr;</a>`;

export const tooltipShellStyle = (opts: { isPinned: boolean; border?: string }): string => {
  const border = opts.border ?? '1px solid var(--border)';
  return [
    'background: var(--popover)',
    `border: ${border}`,
    'border-radius: 8px',
    'padding: 12px',
    'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)',
    `user-select: ${opts.isPinned ? 'text' : 'none'}`,
    'max-width: min(320px, calc(100vw - 16px))',
    'max-height: min(70vh, calc(100dvh - 16px))',
    'overflow-x: hidden',
    'overflow-y: auto',
    'overscroll-behavior: contain',
    'box-sizing: border-box',
  ].join('; ');
};

export const showsPowerTraceAction = (
  point: Pick<InferenceData, 'power_audit' | 'run_url'>,
  selectedYAxisMetric: string,
): boolean =>
  selectedYAxisMetric !== POWER_TIMELINE_METRIC_KEY &&
  getMeasuredMetricConfig(selectedYAxisMetric) !== undefined &&
  traceKeyForPoint(point) !== null;

const powerTraceHref = (): string =>
  typeof window === 'undefined' ? '#' : chartStateHref({ i_metric: POWER_TIMELINE_METRIC_KEY });

interface ViewActionsInput {
  isPinned: boolean;
  hasTraceData: boolean;
  hasLogData: boolean;
  point: InferenceData;
  powerTraceMetric?: string;
  showPowerTelemetry?: boolean;
  locale: Locale;
}

const viewActionsHTML = ({
  isPinned,
  hasTraceData,
  hasLogData,
  point,
  powerTraceMetric,
  showPowerTelemetry,
  locale,
}: ViewActionsInput): string => {
  if (!isPinned) return '';
  const t = ACTION_STRINGS[locale];
  const actions: string[] = [];
  const pointId = point.id;
  const isAgentic = point.benchmark_type === 'agentic_traces';
  const showCharts = isAgentic && hasTraceData;
  if (isPersistedBenchmarkId(pointId) && (showCharts || hasLogData)) {
    const prefix = locale === 'zh' ? '/zh' : '';
    const agenticHref = agenticDetailHref(pointId, locale);
    if (showCharts) {
      actions.push(pointDetailActionLink('view-charts', agenticHref, t.charts));
    }
    if (hasLogData) {
      const logHref = isAgentic
        ? `${agenticHref}${agenticHref.includes('?') ? '&' : '?'}view=logs`
        : `${prefix}/inference/logs/${pointId}`;
      actions.push(pointDetailActionLink('view-logs', logHref, t.logs));
    }
  }
  if (showPowerTelemetry && isPersistedBenchmarkId(pointId)) {
    actions.push(
      `<button type="button" data-action="view-power-telemetry" class="w-full rounded-md border border-border bg-accent px-2 py-1 text-xs font-medium text-accent-foreground cursor-pointer">${t.powerTelemetry} &rarr;</button>`,
    );
  }
  if (powerTraceMetric !== undefined && showsPowerTraceAction(point, powerTraceMetric)) {
    actions.push(pointDetailActionLink('view-power-trace', powerTraceHref(), t.powerTrace));
  }
  if (actions.length === 0) return '';
  return `<div style="display: grid; gap: 6px; margin-top: 8px;">${actions.join('')}</div>`;
};

const shortenSha = (image: string) =>
  image.replaceAll(/(?<shaPrefix>sha256:[a-f0-9]{7})[a-f0-9]+/giu, '$<shaPrefix>…');

const imageTooltipLine = (image: string, label: string, isPinned = false) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${label}${labelColon(label)}</strong> <span style="display: inline-block; vertical-align: top; overflow-wrap: anywhere;">${escapeHtml(isPinned ? image.trim() : shortenSha(image.trim())).replace(/\s+/u, '<br />')}</span>
      </div>`;

const PARALLELISM_STRINGS = {
  en: {
    strategy: 'Parallelism Strategy',
    deployment: 'Deployment',
    singleNode: 'Single-node aggregate',
    multiNode: 'Multi-node aggregate',
    disaggregated: 'Disaggregated',
    gpuCount: (n: number) => `${n} Chip${n > 1 ? 's' : ''}`,
    prefill: 'Prefill',
    decode: 'Decode',
    gpusUnit: 'Chips',
    tensorParallelism: 'Tensor Parallelism',
    dataParallelism: 'Data Parallelism',
    expertParallelism: 'Expert Parallelism',
    pipelineParallelism: 'Pipeline Parallelism',
    decodeContextParallelism: 'Decode Context Parallelism (DCP)',
    prefillContextParallelism: 'Prefill Context Parallelism (PCP)',
    dpAttention: 'DP Attention',
    yes: 'True',
    no: 'False',
    workers: 'Workers',
    configuration: 'Configuration',
    details: 'Configuration details',
  },
  zh: {
    strategy: '并行策略',
    deployment: '部署模式',
    singleNode: '单节点聚合',
    multiNode: '多节点聚合',
    disaggregated: '分离式',
    gpuCount: (n: number) => `${n} 个芯片`,
    prefill: '预填充',
    decode: '解码',
    gpusUnit: '个芯片',
    tensorParallelism: '张量并行 (TP)',
    dataParallelism: '数据并行 (DP)',
    expertParallelism: '专家并行 (EP)',
    pipelineParallelism: '流水线并行 (PP)',
    decodeContextParallelism: '解码上下文并行 (DCP)',
    prefillContextParallelism: '预填充上下文并行 (PCP)',
    dpAttention: '数据并行注意力 (DPA)',
    yes: '是',
    no: '否',
    workers: 'worker 数',
    configuration: '配置',
    details: '配置详情',
  },
} as const;

const contextParallelismParts = (dcp?: number, pcp?: number, dwdp?: number): string => {
  const parts: string[] = [];
  if (dcp !== undefined && dcp > 1) parts.push(`DCP: ${dcp}`);
  if (pcp !== undefined && pcp > 1) parts.push(`PCP: ${pcp}`);
  if (dwdp !== undefined && Number.isInteger(dwdp) && dwdp > 1) parts.push(`DWDP: ${dwdp}`);
  return parts.length > 0 ? `${parts.join(', ')}, ` : '';
};

const generateParallelismHTML = (d: InferenceData, locale: Locale = 'en'): string => {
  const t = PARALLELISM_STRINGS[locale];
  const deployment = d.disagg ? t.disaggregated : d.is_multinode ? t.multiNode : t.singleNode;
  const aggregateDcp = meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size);
  const aggregatePcp = meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size);
  if (
    (d.ep === null || d.ep === undefined) &&
    (d.prefill_ep === null || d.prefill_ep === undefined) &&
    !(d.prefill_dwdp_size && d.prefill_dwdp_size > 1)
  ) {
    return (
      tooltipLine(t.deployment, deployment) +
      tooltipLine(t.strategy, t.gpuCount(d.physicalChips ?? d.tp)) +
      (aggregateDcp ? tooltipLine(t.decodeContextParallelism, aggregateDcp) : '') +
      (aggregatePcp ? tooltipLine(t.prefillContextParallelism, aggregatePcp) : '')
    );
  }

  if (d.is_multinode && d.disagg) {
    const ptp = d.prefill_tp ?? d.tp;
    const pep = d.prefill_ep ?? d.ep ?? 0;
    const ppp = d.prefill_pp ?? d.pp ?? 1;
    const pdpa = d.prefill_dp_attention ?? d.dp_attention ?? false;
    const dtp = d.decode_tp ?? d.tp;
    const dep = d.decode_ep ?? d.ep ?? 0;
    const dpp = d.decode_pp ?? d.pp ?? 1;
    const ddpa = d.decode_dp_attention ?? d.dp_attention ?? false;
    const pw = d.prefill_num_workers ?? 1;
    const dw = d.decode_num_workers ?? 1;
    const prefillContext = contextParallelismParts(
      d.prefill_dcp_size,
      d.prefill_pcp_size,
      d.prefill_dwdp_size,
    );
    const decodeContext = contextParallelismParts(d.decode_dcp_size, d.decode_pcp_size);
    return `
      ${tooltipLine(t.deployment, deployment)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${t.prefill}${labelColon(t.prefill)}</strong> ${d.num_prefill_gpu ?? '?'} ${t.gpusUnit}, TP: ${ptp}, ${ppp > 1 ? `PP: ${ppp}, ` : ''}${prefillContext}EP: ${pep}, DPA: ${pdpa ? t.yes : t.no}, ${t.workers}: ${pw}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${t.decode}${labelColon(t.decode)}</strong> ${d.num_decode_gpu ?? '?'} ${t.gpusUnit}, TP: ${dtp}, ${dpp > 1 ? `PP: ${dpp}, ` : ''}${decodeContext}EP: ${dep}, DPA: ${ddpa ? t.yes : t.no}, ${t.workers}: ${dw}
      </div>`;
  }

  return `
    ${tooltipLine(t.deployment, deployment)}
    ${tooltipLine(t.tensorParallelism, d.decode_tp ?? d.tp)}
    ${d.prefill_dwdp_size && d.prefill_dwdp_size > 1 ? tooltipLine('DWDP', d.prefill_dwdp_size) + tooltipLine(t.workers, d.prefill_num_workers ?? 1) : ''}
    ${d.dp === undefined ? '' : tooltipLine(t.dataParallelism, d.dp)}
    ${d.pp !== null && d.pp !== undefined && d.pp > 1 ? tooltipLine(t.pipelineParallelism, d.pp) : ''}
    ${aggregateDcp ? tooltipLine(t.decodeContextParallelism, aggregateDcp) : ''}
    ${aggregatePcp ? tooltipLine(t.prefillContextParallelism, aggregatePcp) : ''}
    ${d.ep !== null && d.ep !== undefined ? tooltipLine(t.expertParallelism, d.ep) : ''}
    ${tooltipLine(t.dpAttention, d.dp_attention ? t.yes : t.no)}`;
};

const POWER_REASON_CODE_RE = /^[a-z][a-z0-9_]*$/u;

const powerWithheldHTML = (d: InferenceData, locale: Locale): string => {
  if (!Array.isArray(d.power_invalid_reasons) || d.power_invalid_reasons.length === 0) return '';
  const codes = d.power_invalid_reasons
    .filter(
      (code) => typeof code === 'string' && code.length <= 64 && POWER_REASON_CODE_RE.test(code),
    )
    .map((code) => code.replaceAll('_', ' '));
  if (codes.length === 0) return '';
  return tooltipLine(TOOLTIP_STRINGS[locale].powerWithheld, codes.join(', '));
};

const pinnedTopologyHTML = (d: InferenceData, locale: Locale): string => {
  // Legacy rows use tp as a chip count without identifying the parallelism strategy.
  if (
    !d.disagg &&
    (d.ep === null || d.ep === undefined) &&
    (d.prefill_ep === null || d.prefill_ep === undefined) &&
    !(d.prefill_dwdp_size && d.prefill_dwdp_size > 1)
  ) {
    return `<div data-pinned-parallelism class="pinned-section">${generateParallelismHTML(d, locale)}</div>`;
  }
  const t = PARALLELISM_STRINGS[locale];
  const bool = (v: boolean | string | undefined) =>
    v === undefined ? '?' : asBool(v) ? t.yes : t.no;
  type Cell = string | number | undefined;
  const role = (prefill: boolean): Record<string, Cell> => ({
    role: prefill ? t.prefill : t.decode,
    chips: prefill ? d.num_prefill_gpu : d.num_decode_gpu,
    TP: (prefill ? d.prefill_tp : d.decode_tp) ?? d.tp,
    PP: (prefill ? d.prefill_pp : d.decode_pp) ?? d.pp,
    EP: (prefill ? d.prefill_ep : d.decode_ep) ?? d.ep,
    DPA: bool((prefill ? d.prefill_dp_attention : d.decode_dp_attention) ?? d.dp_attention),
    workers: prefill ? d.prefill_num_workers : d.decode_num_workers,
    DCP: prefill ? d.prefill_dcp_size : d.decode_dcp_size,
    PCP: prefill ? d.prefill_pcp_size : d.decode_pcp_size,
    DWDP: prefill ? d.prefill_dwdp_size : undefined,
  });
  const rows: Record<string, Cell>[] = d.disagg
    ? [role(true), role(false)]
    : [
        {
          TP: d.decode_tp ?? d.tp,
          DP: d.dp,
          PP: d.pp,
          EP: d.ep,
          DPA: bool(d.dp_attention),
          DCP: meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size),
          PCP: meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size),
          DWDP: d.prefill_dwdp_size,
          workers:
            d.prefill_dwdp_size && d.prefill_dwdp_size > 1 ? d.prefill_num_workers : undefined,
        },
      ];
  const columns = [
    ...(d.disagg ? ['role', 'chips'] : []),
    'TP',
    'EP',
    'DPA',
    ...(d.disagg || rows.some((r) => r.workers !== undefined) ? ['workers'] : []),
    ...['DP', 'PP', 'DCP', 'PCP', 'DWDP'].filter((key) =>
      rows.some((r) => typeof r[key] === 'number' && Number(r[key]) >= (key === 'DP' ? 1 : 2)),
    ),
  ];
  const labels: Record<string, string> = { role: '', chips: t.gpusUnit, workers: t.workers };
  const titles: Record<string, string> = {
    TP: t.tensorParallelism,
    EP: t.expertParallelism,
    DPA: t.dpAttention,
    PP: t.pipelineParallelism,
    DP: t.dataParallelism,
    DCP: t.decodeContextParallelism,
    PCP: t.prefillContextParallelism,
  };
  const deployment = d.disagg ? t.disaggregated : d.is_multinode ? t.multiNode : t.singleNode;
  const compact = (row: Record<string, Cell>) => {
    // Unknown DPA cannot be labeled DEP/TEP without guessing.
    if (row.DPA === '?') return `TP${row.TP}${typeof row.EP === 'number' ? ` / EP${row.EP}` : ''}`;
    return configSegmentLabel(
      Number(row.TP),
      row.EP as number | undefined,
      row.DPA === t.yes,
      row.PP as number | undefined,
      row.DCP as number | undefined,
      row.PCP as number | undefined,
      row.DP as number | undefined,
      row.DWDP as number | undefined,
    );
  };
  const rawTable = `<div class="pinned-table-scroll"><table class="pinned-topology" aria-label="${t.strategy}">
    <thead><tr>${columns.map((key) => `<th scope="col" title="${titles[key] ?? labels[key] ?? key}">${labels[key] ?? key}</th>`).join(' ')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((key) => `<td>${escapeHtml(String(row[key] ?? '?'))}</td>`).join(' ')}</tr>`).join(' ')}</tbody>
  </table></div>`;
  return `<div data-pinned-parallelism class="pinned-section">
    <div class="pinned-metric-label" style="margin-bottom: 10px;">${deployment}</div>
    ${
      d.disagg
        ? `<table class="pinned-topology pinned-compact-topology" aria-label="${t.configuration}">
      <thead><tr><th></th><th>${t.gpusUnit}</th><th>${t.configuration}</th><th>${t.workers}</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${row.role}</td><td>${row.chips ?? '?'}</td><td><strong>${compact(row)}</strong></td><td>${row.workers ?? '?'}</td></tr>`).join(' ')}</tbody>
    </table>`
        : `<div class="pinned-config-summary"><span>${t.strategy}</span><strong>${compact(rows[0])}</strong></div>`
    }
    <details class="pinned-raw-topology"><summary>${t.details}</summary>${rawTable}</details>
  </div>`;
};

const pinnedTooltipHTML = (
  config: TooltipConfig,
  options: { overlay?: OverlayData; historical?: boolean } = {},
): string => {
  const { data: d, xLabel, yLabel, selectedYAxisMetric, color = 'var(--foreground)' } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];
  const hardware = (options.overlay?.hardwareConfig ?? config.hardwareConfig)[d.hwKey];
  const title = hardware ? getDisplayLabel(getPointHardwareConfig(d, hardware)) : d.hwKey;
  const date = options.historical ? d.date : (d.actualDate ?? d.date);
  const metric = (label: string, value: number, metricKey?: string) => `<div>
    <div class="pinned-metric-label">${escapeHtml(label)}</div>
    <div class="pinned-metric-value">${formatHoverValue(value, metricKey)}</div>
    <div class="pinned-exact">${metricKey ? fmtY(value, metricKey) : fmt(value)}</div>
  </div>`;
  const cache = generateCacheMetadataHTML(d, locale, true, color);
  const agentic = generateAgenticHTML(d, locale, true);
  const power =
    powerTierHTML(d, selectedYAxisMetric, locale) +
    powerVariantHTML(d, selectedYAxisMetric, locale, config.powerLabelStyle) +
    modeledSystemPowerHTML(d, selectedYAxisMetric, true, locale) +
    powerWithheldHTML(d, locale) +
    generateWorkerPowerHTML(d, true, locale);
  const branch = options.overlay?.getRunForRow?.(d)?.branch ?? options.overlay?.label;
  const stat = (label: string, value: string | number) =>
    `<div><span>${label}${labelColon(label)}</span> <strong>${escapeHtml(String(value))}</strong></div>`;
  return `<div class="inferencex-pinned-tooltip" style="user-select: text;">
    ${options.overlay ? `<div style="color: #dc2626; font-size: 11px; font-weight: 600; margin-bottom: 6px;">${t.unofficialRun}</div>` : ''}
    <div class="pinned-title"><span aria-hidden="true" style="width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: ${color};"></span>${escapeHtml(title)}</div>
    <div class="pinned-date">${formatTooltipDate(date, locale)}${options.historical && d.actualDate && d.actualDate !== d.date ? ` ${t.dataFrom(formatTooltipDate(d.actualDate, locale))}` : ''}</div>
    <div class="pinned-metrics">${metric(yLabel, d.y, selectedYAxisMetric)}${metric(xLabel, d.x)}</div>
    <div data-pinned-config>${stat(t.concurrency, d.conc.toLocaleString('en-US'))}${stat(t.precision, d.precision.toUpperCase())}${stat(t.totalChips, d.physicalChips ?? d.tp)}</div>
    ${pinnedTopologyHTML(d, locale)}
    ${cache ? `<div class="pinned-section">${cache}</div>` : ''}
    ${agentic ? `<div class="pinned-section">${agentic}</div>` : ''}
    ${selectedYAxisMetric === 'y_tpPerGpu' && d.inputTputPerGpu ? tooltipLine(t.inputTputPerChip, fmt(d.inputTputPerGpu.y)) : ''}
    ${selectedYAxisMetric === 'y_tpPerGpu' && d.outputTputPerGpu ? tooltipLine(t.outputTputPerChip, fmt(d.outputTputPerGpu.y)) : ''}
    ${power ? `<div class="pinned-section">${power}</div>` : ''}
    <div class="pinned-section">
      ${branch ? tooltipLine(t.branch, escapeHtml(branch)) : ''}
      ${d.image ? `<div class="pinned-image"><span>${t.image}</span><p>${escapeHtml(d.image)}</p></div>` : ''}
      ${runLinkHTML(config.runUrl, locale, d.hwKey)}
      <div class="pinned-actions">${viewActionsHTML({
        isPinned: true,
        hasTraceData: options.overlay ? false : Boolean(config.hasTrace),
        hasLogData: options.overlay ? false : Boolean(config.hasLog),
        point: d,
        showPowerTelemetry: options.overlay ? false : config.showPowerTelemetry,
        powerTraceMetric: selectedYAxisMetric,
        locale,
      })}</div>
    </div>
    <div class="pinned-dismiss">${config.touch ? t.dismissTouch : t.dismiss}</div>
  </div>`;
};

export const generateTooltipContent = (config: TooltipConfig): string => {
  if (config.isPinned) return pinnedTooltipHTML(config);
  const {
    data: d,
    isPinned,
    xLabel,
    yLabel,
    selectedYAxisMetric,
    hardwareConfig,
    runUrl,
    hasTrace,
  } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];

  return `
    <div style="${tooltipShellStyle({ isPinned })}">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${config.touch ? t.dismissTouch : t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hardwareConfig[d.hwKey] ? getDisplayLabel(getPointHardwareConfig(d, hardwareConfig[d.hwKey])) : d.hwKey}
      </div>
      ${tooltipLine(t.date, formatTooltipDate(d.actualDate ?? d.date, locale))}
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image, t.image, isPinned)}`
          : ''
      }
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmtY(d.y, selectedYAxisMetric))}
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          ${tooltipLine(t.inputTputPerChip, `${fmt(d['inputTputPerGpu'].y)}`)}`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          ${tooltipLine(t.outputTputPerChip, `${fmt(d['outputTputPerGpu'].y)}`)}`
          : ''
      }
      ${powerTierHTML(d, selectedYAxisMetric, locale)}
      ${powerVariantHTML(d, selectedYAxisMetric, locale, config.powerLabelStyle)}
      ${modeledSystemPowerHTML(d, selectedYAxisMetric, isPinned, locale)}
      ${tooltipLine(t.totalChips, d.physicalChips ?? d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, d.precision.toUpperCase())}
      ${generateCacheMetadataHTML(d, locale, isPinned, config.color)}
      ${powerWithheldHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
      ${runLinkHTML(runUrl, locale, d.hwKey)}
      ${viewActionsHTML({
        isPinned,
        hasTraceData: Boolean(hasTrace),
        hasLogData: Boolean(config.hasLog),
        point: d,
        showPowerTelemetry: config.showPowerTelemetry,
        powerTraceMetric: selectedYAxisMetric,
        locale,
      })}
    </div>
  `;
};

export const generateOverlayTooltipContent = (config: OverlayTooltipConfig): string => {
  if (config.isPinned) return pinnedTooltipHTML(config, { overlay: config.overlayData });
  const { data: d, isPinned, xLabel, yLabel, selectedYAxisMetric, overlayData } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];
  const hwConfig = overlayData.hardwareConfig[d.hwKey];
  const perRow = overlayData.getRunForRow?.(d);
  const branch = perRow?.branch ?? overlayData.label;

  return `
    <div style="${tooltipShellStyle({ isPinned, border: '2px solid #dc2626' })}">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${config.touch ? t.dismissTouch : t.dismiss}</div>` : ''}
      <div style="color: #dc2626; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">
        ${t.unofficialRun}
      </div>
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hwConfig ? getDisplayLabel(getPointHardwareConfig(d, hwConfig)) : d.hwKey}
      </div>
      ${tooltipLine(t.branch, `${branch}`)}
      ${tooltipLine(t.date, formatTooltipDate(d.actualDate ?? d.date, locale))}
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmtY(d.y, selectedYAxisMetric))}
      ${powerTierHTML(d, selectedYAxisMetric, locale)}
      ${powerVariantHTML(d, selectedYAxisMetric, locale, config.powerLabelStyle)}
      ${modeledSystemPowerHTML(d, selectedYAxisMetric, isPinned, locale)}
      ${tooltipLine(t.totalChips, d.physicalChips ?? d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, d.precision.toUpperCase())}
      ${generateCacheMetadataHTML(d, locale, isPinned, config.color)}
      ${powerWithheldHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
      ${viewActionsHTML({
        isPinned,
        hasTraceData: false,
        hasLogData: false,
        point: d,
        powerTraceMetric: selectedYAxisMetric,
        locale,
      })}
    </div>
  `;
};

export const generateGPUGraphTooltipContent = (config: TooltipConfig): string => {
  if (config.isPinned) return pinnedTooltipHTML(config, { historical: true });
  const {
    data: d,
    isPinned,
    xLabel,
    yLabel,
    selectedYAxisMetric,
    hardwareConfig,
    runUrl,
    hasTrace,
    hasLog,
  } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];

  return `
    <div style="${tooltipShellStyle({ isPinned })}">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${config.touch ? t.dismissTouch : t.dismiss}</div>` : ''}
      ${tooltipLine(t.date, `${formatTooltipDate(d.date, locale)}${d.actualDate && d.actualDate !== d.date ? ` <span style="opacity: 0.7">${t.dataFrom(formatTooltipDate(d.actualDate, locale))}</span>` : ''}`)}
      ${tooltipLine(t.chipConfig, `${hardwareConfig[d.hwKey] ? getDisplayLabel(getPointHardwareConfig(d, hardwareConfig[d.hwKey])) : d.hwKey}`)}
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image, t.image, isPinned)}`
          : ''
      }
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmtY(d.y, selectedYAxisMetric))}
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          ${tooltipLine(t.inputTputPerChip, `${fmt(d['inputTputPerGpu'].y)}`)}`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          ${tooltipLine(t.outputTputPerChip, `${fmt(d['outputTputPerGpu'].y)}`)}`
          : ''
      }
      ${powerTierHTML(d, selectedYAxisMetric, locale)}
      ${powerVariantHTML(d, selectedYAxisMetric, locale, config.powerLabelStyle)}
      ${modeledSystemPowerHTML(d, selectedYAxisMetric, isPinned, locale)}
      ${tooltipLine(t.totalChips, d.physicalChips ?? d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, d.precision.toUpperCase())}
      ${generateCacheMetadataHTML(d, locale, isPinned, config.color)}
      ${powerWithheldHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
      ${runLinkHTML(runUrl, locale, d.hwKey)}
      ${viewActionsHTML({
        isPinned,
        hasTraceData: Boolean(hasTrace),
        hasLogData: Boolean(hasLog),
        point: d,
        showPowerTelemetry: config.showPowerTelemetry,
        powerTraceMetric: selectedYAxisMetric,
        locale,
      })}
    </div>
  `;
};

const HOVER_STRINGS = {
  en: {
    conc: (n: number) => `conc ${n}`,
    chips: (n: number) => `${n} ${n === 1 ? 'chip' : 'chips'}`,
    cacheHit: 'KV cache hit',
    chip: 'Chip',
    chipCpu: 'Chip + CPU',
    cpu: 'CPU',
    theoretical: (v: string) => `theoretical ${v}`,
    details: 'Click for full details',
  },
  zh: {
    conc: (n: number) => `并发 ${n}`,
    chips: (n: number) => `${n} 芯片`,
    cacheHit: 'KV cache 命中率',
    chip: '芯片',
    chipCpu: '芯片 + CPU',
    cpu: 'CPU',
    theoretical: (v: string) => `理论 ${v}`,
    details: '点击查看完整信息',
  },
} as const;

/** Compact value for the hover card: 31,264,799 → 31.26M, 39.308 → 39.3. */
export const formatHoverValue = (value: number, metric?: string): string => {
  if (!Number.isFinite(value)) return String(value);
  if (metric && WATT_METRICS.has(metric)) return fmtWatts(value);
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return String(parseFloat(value.toFixed(2)));
};

/**
 * Short axis label for the hover card: the unit in parentheses, keeping a leading
 * percentile/statistic qualifier. "P90 Interactivity (tok/s/user)" → "P90 tok/s/user".
 */
export const shortAxisLabel = (label: string): string => {
  const unit = /[(（](?<unit>[^()（）]+)[)）]\s*$/u.exec(label.trim())?.groups?.unit;
  if (!unit) return label;
  const qualifier = /^(?<q>[Pp]\d{1,3}(?:\.\d+)?|Median|Mean|中位数|平均)(?![A-Za-z0-9.])/u.exec(
    label.trim(),
  )?.groups?.q;
  return qualifier ? `${qualifier} ${unit}` : unit;
};

const hoverSpecLabel = (d: InferenceData): string | null => {
  const method = d.spec_decoding ?? 'none';
  if (method === 'none' || method === '') return null;
  if (d.spec_algorithm)
    return SPEC_ALGORITHM_LABELS[d.spec_algorithm] ?? d.spec_algorithm.toUpperCase();
  return specMethodDisplayLabel(d.model, method);
};

const hoverOffloadLabel = (d: InferenceData): string | null => {
  if (!isKvOffloadEnabled(d)) return null;
  const type = d.kv_offloading?.trim();
  const parts = [
    d.kv_offload_backend ? cacheImplementationLabel(d.kv_offload_backend) : null,
    type && type.toLowerCase() !== 'none' ? offloadTypeLabel(type) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' → ') : null;
};

const hoverClampPct = (v: number) => Math.max(0, Math.min(100, v * 100));
const hoverPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const hoverSwatch = (color: string, size: number, opacity = 1) =>
  `<span style="display: inline-block; flex: none; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}; opacity: ${opacity}; margin-right: 5px;"></span>`;

const hoverCacheHTML = (d: InferenceData, color: string, locale: Locale): string => {
  const chip = d.server_gpu_cache_hit_rate;
  if (chip === undefined || chip === null || !Number.isFinite(chip)) return '';
  const t = HOVER_STRINGS[locale];
  const offloadEnabled = isKvOffloadEnabled(d);
  // TRT-LLM reports one combined chip + CPU rate when offload is on.
  const combined = offloadEnabled && frameworkFamily(d.framework) === 'trt';
  const rawCpu = d.server_cpu_cache_hit_rate;
  const cpu =
    offloadEnabled &&
    !combined &&
    rawCpu !== undefined &&
    rawCpu !== null &&
    Number.isFinite(rawCpu)
      ? rawCpu
      : null;
  const theoretical = d.theoretical_cache_hit_rate;
  const hasTheoretical =
    theoretical !== undefined && theoretical !== null && Number.isFinite(theoretical);
  const chipPct = hoverClampPct(chip);
  const cpuPct = cpu === null ? 0 : Math.min(hoverClampPct(cpu), 100 - chipPct);
  const offload = hoverOffloadLabel(d);
  return `
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; margin-bottom: 4px; font-size: 11px;">
        <span style="color: var(--muted-foreground);">${t.cacheHit}${offload ? ` · ${escapeHtml(offload)}` : ''}</span>
        <span style="color: var(--foreground); font-weight: 600;">${hoverPct(chip + (cpu ?? 0))}</span>
      </div>
      <div data-hover-cache-bar style="position: relative; display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--border);">
        <div style="width: ${chipPct}%; background: ${color};"></div>
        ${cpu === null ? '' : `<div style="width: ${cpuPct}%; background: ${color}; opacity: 0.45;"></div>`}
        ${hasTheoretical ? `<div style="position: absolute; top: 0; bottom: 0; left: calc(${hoverClampPct(theoretical)}% - 1px); width: 2px; background: var(--foreground); opacity: 0.6;"></div>` : ''}
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 5px; font-size: 10.5px; color: var(--muted-foreground);">
        <span style="display: inline-flex; align-items: center;">${hoverSwatch(color, 6)}${combined ? t.chipCpu : t.chip} ${hoverPct(chip)}</span>
        ${cpu === null ? '' : `<span style="display: inline-flex; align-items: center;">${hoverSwatch(color, 6, 0.45)}${t.cpu} ${hoverPct(cpu)}</span>`}
        ${hasTheoretical ? `<span style="opacity: 0.8;">${t.theoretical(hoverPct(theoretical))}</span>` : ''}
      </div>`;
};

export interface HoverTooltipConfig {
  data: InferenceData;
  xLabel: string;
  yLabel: string;
  selectedYAxisMetric: string;
  hardwareConfig: HardwareConfig;
  /** Series color of the hovered point (resolved CSS color). */
  color: string;
  locale?: Locale;
}

/**
 * Compact hover card. The pinned (clicked) tooltip from `generateTooltipContent`
 * keeps every field, so hover only shows what you need to read a point at a glance.
 */
export const generateHoverTooltipContent = (config: HoverTooltipConfig): string => {
  const { data: d, xLabel, yLabel, selectedYAxisMetric, hardwareConfig, color } = config;
  const locale = config.locale ?? 'en';
  const t = HOVER_STRINGS[locale];
  const system = hardwareConfig[d.hwKey]
    ? getDisplayLabel(getPointHardwareConfig(d, hardwareConfig[d.hwKey]))
    : d.hwKey;
  const config_ = [
    t.chips(d.physicalChips ?? d.tp),
    getPointLabel(d) || `TP${d.tp}`,
    hoverSpecLabel(d),
  ].filter(Boolean) as string[];
  const value = (v: string, label: string) =>
    `<span style="white-space: nowrap;"><span style="color: var(--foreground); font-weight: 600;">${v}</span> <span style="color: var(--muted-foreground);">${escapeHtml(shortAxisLabel(label))}</span></span>`;

  return `
    <div data-hover-tooltip style="${tooltipShellStyle({ isPinned: false })}; min-width: 240px; font-variant-numeric: tabular-nums; line-height: 1.35;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px;">
        <span style="display: inline-flex; align-items: center; min-width: 0; color: var(--foreground); font-size: 12px; font-weight: 600;">${hoverSwatch(color, 8)}<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(String(system))}</span></span>
        <span style="flex: none; color: var(--muted-foreground); font-size: 11px;">${escapeHtml(d.precision.toUpperCase())} · ${t.conc(d.conc)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 16px; font-size: 12px;">
        ${value(formatHoverValue(d.y, selectedYAxisMetric), yLabel)}
        ${value(formatHoverValue(d.x), xLabel)}
      </div>
      <div style="margin-top: 2px; color: var(--muted-foreground); font-size: 11px;">${escapeHtml(config_.join(' · '))}</div>
      ${hoverCacheHTML(d, color, locale)}
      <div style="margin-top: 8px; color: var(--muted-foreground); font-size: 10px; opacity: 0.75;">${t.details}</div>
    </div>
  `;
};
