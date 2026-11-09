import { getPointHardwareConfig } from '@/lib/benchmarks/inference-labels';
import {
  speculativeDecodingLabel,
  speculativeDecodingName,
} from '@/lib/benchmarks/speculative-decoding';
import { comparisonEntryDate } from '@/components/inference/utils/comparisonEntry';
import { agenticDetailHref } from '@/lib/agentx/agentic-detail-link';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import type { Locale } from '@/lib/i18n/i18n';
import type { PowerBasisLabelStyle } from '@/lib/power/power-basis';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';
import { chartStateHref } from '@/lib/routing/url-state';
import { axisLabelUnit, chartTooltipShellStyle } from '@/lib/d3-chart/tooltip-shell';
import { formatNumber, getDisplayLabel } from '@/lib/shared/utils';
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
  X_AXIS_EXPLANATIONS,
  type XAxisKind,
} from '@/components/inference/axis-metric-explanations';
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
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

export interface TooltipConfig {
  data: InferenceData;
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
  overlayData?: OverlayData;
  comparisonDate?: boolean;
  color?: string;
  /** Human-readable comparison date/run label, matching the history legend. */
  comparisonLabel?: string;
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

const labelColon = (label: string) => (/[\u4E00-\u9FFF]/u.test(label) ? '：' : ':');

const tooltipLine = (label: string, value: string | number) =>
  `<div class="tooltip-line"><strong>${label}${labelColon(label)}</strong> ${value}</div>`;

const formatPct = (v: number | undefined): string | null =>
  v === undefined || v === null || !Number.isFinite(v) ? null : `${(v * 100).toFixed(1)}%`;

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
    unofficialRun: 'Unofficial run',
    dataFrom: (d: string) => `(data from ${d})`,
    date: 'Date',
    image: 'Image',
    inputTputPerChip: 'Input Token Throughput per Chip',
    outputTputPerChip: 'Output Token Throughput per Chip',
    powerData: 'Power measurement',
    powerCertified: 'Validated (current PowerX method)',
    powerLegacy: 'Historical (not validated under the current method)',
    powerWithheld: 'Measured power withheld',
    series: 'Series',
    roleEnergyShare: 'Share of request energy',
    run: 'GitHub Actions run',
  },
  zh: {
    unofficialRun: '非官方运行',
    dataFrom: (d: string) => `（数据来自 ${d}）`,
    date: '日期',
    image: '镜像',
    inputTputPerChip: '每芯片输入 token 吞吐量',
    outputTputPerChip: '每芯片输出 token 吞吐量',
    powerData: '功耗测量',
    powerCertified: '已验证（采用当前 PowerX 方法）',
    powerLegacy: '历史测量（尚未按当前方法验证）',
    powerWithheld: '实测功耗未采信',
    series: '系列',
    roleEnergyShare: '在请求能耗中的占比',
    run: 'GitHub Actions 运行记录',
  },
} as const;

const overlayNotice = (d: InferenceData, overlayData: OverlayData, locale: Locale): string => {
  const run = overlayData.getRunForRow?.(d);
  const branch = run ? run.branch : overlayData.label;
  const runId = (run?.url ?? d.run_url ?? overlayData.runUrl)?.match(/\/runs\/(?<id>\d+)/u)?.groups
    ?.id;
  return `✕ ${branch || (runId ? `#${runId}` : TOOLTIP_STRINGS[locale].unofficialRun)}`;
};

interface PointDetailRow {
  label: string;
  value: string;
}

const row = (label: string, value: string | number): PointDetailRow => ({
  label,
  value: String(value),
});

const rowsHTML = (rows: PointDetailRow[]): string =>
  rows.map((r) => tooltipLine(escapeHtml(r.label), escapeHtml(r.value))).join('');

const powerVariantRows = (
  d: InferenceData,
  selectedYAxisMetric: string,
  locale: Locale,
  labelStyle?: PowerBasisLabelStyle,
): PointDetailRow[] => {
  const variant = d.powerVariant;
  if (!variant) return [];
  const t = TOOLTIP_STRINGS[locale];
  const rows = [row(t.series, powerVariantLabel(variant, locale, labelStyle))];
  if (
    variant.kind === 'role' &&
    variant.id !== 'all' &&
    getMeasuredMetricConfig(selectedYAxisMetric)?.family === 'energy'
  ) {
    const energy = reconstructedRoleEnergy(d);
    if (energy) {
      const share = variant.id === 'prefill' ? energy.prefillShare : 100 - energy.prefillShare;
      rows.push(row(t.roleEnergyShare, `${share.toFixed(1)}%`));
    }
  }
  return rows;
};

const powerTierRows = (d: InferenceData, locale: Locale): PointDetailRow[] => {
  if (!d.power_tier) return [];
  const t = TOOLTIP_STRINGS[locale];
  return [row(t.powerData, d.power_tier === 'certified' ? t.powerCertified : t.powerLegacy)];
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
    details: 'Model assumptions',
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
    if (estimate.reason === 'workload') return '';
    return tooltipLine(t.unavailable, t.reasons[estimate.reason]);
  }
  const u = t.units[estimate.unit];
  const reading = (watts: number, basis: 'gpu' | 'it' | 'facility') =>
    `<span data-power-reading>${fmtWatts(watts)} W/GPU${powerBasisPillHtml(basis, locale)}</span>`;
  return `<div data-testid="tooltip-modeled-system-power" class="pinned-subsection">
    <strong>${t.heading}</strong>
    ${tooltipLine(t.measuredGpu, reading(estimate.measuredGpuWattsPerGpu, 'gpu'))}
    ${estimate.unit === 'nvl72-tray' && estimate.measuredGraceSocketWatts !== null ? tooltipLine(t.graceSocket, `${fmtWatts(estimate.measuredGraceSocketWatts)} W/socket`) : ''}
    ${tooltipLine(t.itPerGpu, reading(estimate.itWattsPerGpu, 'it'))}
    ${tooltipLine(t.facilityPerGpu, reading(estimate.deploymentFacilityWatts / estimate.gpuCount, 'facility'))}
    ${tooltipLine(t.state, `${t.workloads[estimate.operatingState.workload]} · ${t.scaleOut(estimate.operatingState.scaleOut)}`)}
    ${tooltipLine(t.deploymentIt, `${fmtWatts(estimate.deploymentItWatts)} W`)}
    ${tooltipLine(`${t.facility} (PUE ${fmt(estimate.pue)})`, `${fmtWatts(estimate.deploymentFacilityWatts)} W`)}
    <div style="color: var(--muted-foreground);">${u.topology(estimate.chassisCount, estimate.gpuCount, estimate.modeledGpuCount)}${estimate.chassisBasis === 'extrapolated' ? `<br/>${u.extrapolation}` : ''}${estimate.topologyBasis === 'uniform-hosts' ? `<br/>${u.uniformHosts}` : ''}</div>
    <details data-testid="tooltip-power-model-details" style="margin-top: 2px;">
    <summary style="cursor: pointer; color: var(--muted-foreground);">${t.details}</summary>
    <div style="color: var(--muted-foreground); margin-bottom: 4px;">${estimate.unit === 'nvl72-tray' && estimate.cpuBasis === 'modeled' ? t.units['nvl72-tray'].modeledCpuAssumptions : u.assumptions}<br/>${u.network}<br/>${u.normalization}<br/>${u.boundary}</div>
    </details>
    ${tooltipLine(t.model, `<a href="${escapeHtml(SYSTEM_POWER_MODEL_SOURCE_URL)}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">${escapeHtml(estimate.hardware)} · ${escapeHtml(estimate.modelRevision)}</a>`)}
  </div>`;
};

const WORKER_POWER_STRINGS = {
  en: {
    heading: 'Measured worker power',
    chips: 'chips',
  },
  zh: {
    heading: '各 Worker 实测功耗',
    chips: '芯片',
  },
} as const;

const workerPowerHTML = (d: InferenceData, locale: Locale): string => {
  if (!Array.isArray(d.workers) || d.workers.length === 0) return '';
  const t = WORKER_POWER_STRINGS[locale];
  const rows = d.workers.map((w) => {
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
    return `<div style="color: var(--muted-foreground); overflow-wrap: anywhere;">${parts.join(' · ')}</div>`;
  });
  return `<div data-testid="tooltip-worker-power" class="pinned-subsection">
      <div style="color: var(--foreground); font-weight: 600;">${t.heading}</div>
      ${rows.join('')}
    </div>`;
};

const MEASURED_POWER_STRINGS = {
  en: {
    power: 'Measured chip power',
    energy: 'Measured energy',
    telemetry: 'Chip telemetry',
    avg: 'avg',
    prefill: 'prefill',
    decode: 'decode',
    outputToken: 'J/output token',
    totalToken: 'J/total token',
    inputToken: 'J/input token',
    query: 'J/query',
    avgTemp: (v: string) => `${v} °C avg`,
    peakTemp: (v: string) => `${v} °C peak`,
    util: (v: string) => `${v}% util`,
    memory: (v: string) => `${v} GiB memory`,
  },
  zh: {
    power: '芯片实测功耗',
    energy: '实测能耗',
    telemetry: '芯片遥测',
    avg: '平均',
    prefill: '预填充',
    decode: '解码',
    outputToken: 'J/输出 token',
    totalToken: 'J/总 token',
    inputToken: 'J/输入 token',
    query: 'J/请求',
    avgTemp: (v: string) => `平均 ${v} °C`,
    peakTemp: (v: string) => `峰值 ${v} °C`,
    util: (v: string) => `利用率 ${v}%`,
    memory: (v: string) => `显存 ${v} GiB`,
  },
} as const;

const factsLineHTML = (label: string, facts: (string | false | undefined)[]): string => {
  const shown = facts.filter(Boolean);
  if (shown.length === 0) return '';
  return `<div class="pinned-facts">${label ? `<span class="pinned-facts-label">${escapeHtml(label)}</span> ` : ''}${shown.join(' · ')}</div>`;
};

const wattsFact = (label: string, v: number | undefined) =>
  isRate(v) && `${label} ${fmtWatts(v)} W`;

const joulesFact = (v: number | undefined, unit: string, label = '') =>
  isRate(v) && `${label ? `${label} ` : ''}${fmt(v)} ${unit}`;

const measuredPowerHTML = (d: InferenceData, locale: Locale): string => {
  const t = MEASURED_POWER_STRINGS[locale];
  return (
    factsLineHTML(t.power, [
      wattsFact(t.avg, d.avg_power_w),
      wattsFact('P75', d.p75_power_w),
      wattsFact('P90', d.p90_power_w),
      wattsFact(t.prefill, d.prefill_avg_power_w),
      wattsFact(t.decode, d.decode_avg_power_w),
    ]) +
    factsLineHTML(t.energy, [
      joulesFact(d.joules_per_output_token, t.outputToken),
      joulesFact(d.joules_per_total_token, t.totalToken),
      joulesFact(d.joules_per_input_token, t.inputToken),
      joulesFact(d.joules_per_successful_query, t.query),
      joulesFact(d.prefill_joules_per_input_token, t.inputToken, t.prefill),
      joulesFact(d.decode_joules_per_output_token, t.outputToken, t.decode),
    ]) +
    factsLineHTML(t.telemetry, [
      isRate(d.avg_temp_c) && t.avgTemp(fmt(d.avg_temp_c)),
      isRate(d.peak_temp_c) && t.peakTemp(fmt(d.peak_temp_c)),
      isRate(d.avg_util_pct) && t.util(fmt(d.avg_util_pct)),
      isRate(d.avg_mem_used_mb) && t.memory(fmt(d.avg_mem_used_mb / 1024)),
    ])
  );
};

const CACHE_STRINGS = {
  en: {
    offloadType: 'Offload type',
    offloadBackend: 'KV offload engine',
    transferEngine: 'KV transfer engine',
    router: 'Router',
    gpuHitRate: 'Chip cache hit rate',
    cpuHitRate: 'CPU cache hit rate',
    combinedHitRate: 'Combined chip + CPU cache hit rate',
    theoreticalHitRate: 'Theoretical cache hit rate',
    externalHitRate: 'External cache hit rate',
    legacyEnabled: 'Enabled (legacy data)',
    legacyDisabled: 'Disabled (legacy data)',
    hit: 'KV cache hit',
    chip: (v: string) => `Chip ${v}`,
    chipCpu: (v: string) => `Chip + CPU ${v}`,
    cpu: (v: string) => `CPU ${v}`,
    theoretical: (v: string) => `theoretical ${v}`,
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
    externalHitRate: '外部 Cache 命中率',
    legacyEnabled: '已启用（旧版数据）',
    legacyDisabled: '已禁用（旧版数据）',
    hit: 'KV cache 命中率',
    chip: (v: string) => `芯片 ${v}`,
    chipCpu: (v: string) => `芯片 + CPU ${v}`,
    cpu: (v: string) => `CPU ${v}`,
    theoretical: (v: string) => `理论 ${v}`,
  },
} as const;

const cacheHTML = (d: InferenceData, locale: Locale, color: string): string => {
  const t = CACHE_STRINGS[locale];
  const rows: PointDetailRow[] = [];
  const offloadType = d.kv_offloading?.trim();
  if (offloadType && offloadType.toLowerCase() !== 'none') {
    rows.push(row(t.offloadType, offloadTypeLabel(offloadType)));
  } else if (!offloadType && d.benchmark_type === 'agentic_traces' && d.offload_mode) {
    const enabled = d.offload_mode.toLowerCase() === 'on';
    rows.push(row(t.offloadType, enabled ? t.legacyEnabled : t.legacyDisabled));
  }
  if (d.kv_offload_backend) {
    rows.push(
      row(
        t.offloadBackend,
        versionedComponentLabel(d.kv_offload_backend, d.kv_offload_backend_version)!,
      ),
    );
  }
  if (d.kv_p2p_transfer) {
    rows.push(row(t.transferEngine, cacheImplementationLabel(d.kv_p2p_transfer)));
  }
  if (d.router_name) {
    rows.push(row(t.router, versionedComponentLabel(d.router_name, d.router_version)!));
  }
  const externalHit = formatPct(d.server_external_cache_hit_rate);
  if (externalHit) rows.push(row(t.externalHitRate, externalHit));

  const cache = pointCacheHit(d, locale);
  if (cache) {
    return `<div data-pinned-cache class="pinned-bar"><div class="pinned-bar-row"><span>${escapeHtml(cache.label)}</span>${cacheBarHTML(cache, color, 4)}<strong>${cache.total}</strong></div>
      <div class="pinned-bar-legend">${cacheLegendHTML(cache, color)}</div></div>${rowsHTML(rows)}`;
  }
  const gpuHit = formatPct(d.server_gpu_cache_hit_rate);
  const cpuHit = formatPct(d.server_cpu_cache_hit_rate);
  const theoreticalHit = formatPct(d.theoretical_cache_hit_rate);
  const offloadEnabled = isKvOffloadEnabled(d);
  const combinedHit = offloadEnabled && frameworkFamily(d.framework) === 'trt';
  if (gpuHit) rows.push(row(combinedHit ? t.combinedHitRate : t.gpuHitRate, gpuHit));
  if (cpuHit && offloadEnabled && !combinedHit) rows.push(row(t.cpuHitRate, cpuHit));
  if (theoreticalHit) rows.push(row(t.theoreticalHitRate, theoreticalHit));
  return rowsHTML(rows);
};

const isRate = (v: number | null | undefined): v is number =>
  v !== undefined && v !== null && Number.isFinite(v);

const sharePct = (v: number) => Math.max(0, Math.min(100, v * 100));

const pointCacheHit = (d: InferenceData, locale: Locale): PointCacheHit | undefined => {
  const chip = d.server_gpu_cache_hit_rate;
  if (!isRate(chip)) return undefined;
  const t = CACHE_STRINGS[locale];
  const offloadEnabled = isKvOffloadEnabled(d);
  const combined = offloadEnabled && frameworkFamily(d.framework) === 'trt';
  const cpu =
    offloadEnabled && !combined && isRate(d.server_cpu_cache_hit_rate)
      ? d.server_cpu_cache_hit_rate
      : null;
  const offloadType = d.kv_offloading?.trim();
  const offload = offloadEnabled
    ? [
        d.kv_offload_backend ? cacheImplementationLabel(d.kv_offload_backend) : null,
        offloadType && offloadType.toLowerCase() !== 'none' ? offloadTypeLabel(offloadType) : null,
      ]
        .filter(Boolean)
        .join(' → ')
    : '';
  const theoretical = d.theoretical_cache_hit_rate;
  return {
    label: offload ? `${t.hit} · ${offload}` : t.hit,
    total: formatPct(chip + (cpu ?? 0))!,
    segments: [
      {
        label: (combined ? t.chipCpu : t.chip)(formatPct(chip)!),
        share: sharePct(chip),
        opacity: 1,
      },
      ...(cpu === null
        ? []
        : [
            {
              label: t.cpu(formatPct(cpu)!),
              share: Math.min(sharePct(cpu), 100 - sharePct(chip)),
              opacity: 0.45,
            },
          ]),
    ],
    theoretical: isRate(theoretical)
      ? { label: t.theoretical(formatPct(theoretical)!), share: sharePct(theoretical) }
      : undefined,
  };
};

const AGENTIC_STRINGS = {
  en: {
    speculativeDecoding: 'Speculative decoding',
    off: 'Off',
    requests: 'Requests',
    promptTokens: 'Prompt tokens',
    generatedTokens: 'Generated tokens',
    tokens: 'Tokens',
  },
  zh: {
    speculativeDecoding: '投机解码',
    off: '关闭',
    requests: '请求',
    promptTokens: '提示 token',
    generatedTokens: '生成 token',
    tokens: 'Token 数',
  },
} as const;

const speculativeRows = (d: InferenceData, locale: Locale): PointDetailRow[] => {
  const t = AGENTIC_STRINGS[locale];
  const label = speculativeDecodingLabel(
    { method: d.spec_decoding, algorithm: d.spec_algorithm, draftModel: d.spec_draft_model },
    d.model,
    locale,
  );
  return label || d.benchmark_type === 'agentic_traces'
    ? [row(t.speculativeDecoding, label ?? t.off)]
    : [];
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
  return `<div data-pinned-tokens class="pinned-bar">
    <div class="pinned-bar-row"><span>${t.tokens}</span><div class="pinned-token-track" role="img" aria-label="${t.promptTokens}: ${formatNumber(prompt)}; ${t.generatedTokens}: ${formatNumber(generated)}">
      <span data-token-prompt style="width: ${promptWidth}%;"></span>
      <span data-token-generated style="width: ${generatedWidth}%;"></span>
    </div><strong>${formatHoverValue(total)}</strong></div>
    <div class="pinned-bar-legend">
      <span class="pinned-token-label"><i class="token-prompt-dot"></i>${t.promptTokens} <span class="pinned-token-count">${formatNumber(prompt)}</span></span>
      <span class="pinned-token-label"><i class="token-generated-dot"></i>${t.generatedTokens} <span class="pinned-token-count">${formatNumber(generated)}</span></span>
    </div>
  </div>`;
};

const runtimeHTML = (d: InferenceData, locale: Locale): string => {
  const rows = speculativeRows(d, locale);
  const t = AGENTIC_STRINGS[locale];
  const total = d.num_requests_total;
  const successful = d.num_requests_successful;
  if (total !== undefined || successful !== undefined) {
    const successPct =
      total && successful !== undefined ? ` (${((successful / total) * 100).toFixed(0)}%)` : '';
    rows.push(row(t.requests, `${successful ?? '?'} / ${total ?? '?'}${successPct}`));
  }

  const tokens = tokenBreakdownHTML(d, locale);
  if (!tokens && d.total_prompt_tokens !== undefined) {
    rows.push(row(t.promptTokens, formatNumber(d.total_prompt_tokens)));
  }
  if (!tokens && d.total_generation_tokens !== undefined) {
    rows.push(row(t.generatedTokens, formatNumber(d.total_generation_tokens)));
  }

  return rowsHTML(rows) + tokens;
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

export type PointDetailAction =
  | 'run'
  | 'view-charts'
  | 'view-logs'
  | 'view-power-telemetry'
  | 'view-power-trace';

export interface PointDetailLink {
  action: PointDetailAction;
  label: string;
  href?: string;
}

export const showsPowerTraceAction = (
  point: Pick<InferenceData, 'power_audit' | 'run_url'>,
  selectedYAxisMetric: string,
): boolean =>
  selectedYAxisMetric !== POWER_TIMELINE_METRIC_KEY &&
  getMeasuredMetricConfig(selectedYAxisMetric) !== undefined &&
  traceKeyForPoint(point) !== null;

interface PointLinksInput {
  point: InferenceData;
  runUrl?: string;
  hasTraceData: boolean;
  hasLogData: boolean;
  powerTraceMetric: string;
  showPowerTelemetry?: boolean;
  locale: Locale;
}

const pointLinks = ({
  point,
  runUrl,
  hasTraceData,
  hasLogData,
  powerTraceMetric,
  showPowerTelemetry,
  locale,
}: PointLinksInput): PointDetailLink[] => {
  const t = ACTION_STRINGS[locale];
  const links: PointDetailLink[] = [];
  if (runUrl && !String(point.hwKey).startsWith('tpu')) {
    links.push({ action: 'run', label: TOOLTIP_STRINGS[locale].run, href: runUrl });
  }
  const pointId = point.id;
  const isAgentic = point.benchmark_type === 'agentic_traces';
  const showCharts = isAgentic && hasTraceData;
  if (isPersistedBenchmarkId(pointId) && (showCharts || hasLogData)) {
    const prefix = locale === 'zh' ? '/zh' : '';
    const agenticHref = agenticDetailHref(pointId, locale);
    if (showCharts) {
      links.push({ action: 'view-charts', label: t.charts, href: agenticHref });
    }
    if (hasLogData) {
      const logHref = isAgentic
        ? `${agenticHref}${agenticHref.includes('?') ? '&' : '?'}view=logs`
        : `${prefix}${getDashboardRoute('inference').path}/logs/${pointId}`;
      links.push({ action: 'view-logs', label: t.logs, href: logHref });
    }
  }
  if (showPowerTelemetry && isPersistedBenchmarkId(pointId)) {
    links.push({ action: 'view-power-telemetry', label: t.powerTelemetry });
  }
  if (showsPowerTraceAction(point, powerTraceMetric)) {
    links.push({
      action: 'view-power-trace',
      label: t.powerTrace,
      href:
        typeof window === 'undefined'
          ? '#'
          : chartStateHref({ i_metric: POWER_TIMELINE_METRIC_KEY }),
    });
  }
  return links;
};

const PARALLELISM_STRINGS = {
  en: {
    singleNode: 'Single-node aggregate',
    multiNode: 'Multi-node aggregate',
    disaggregated: 'Disaggregated',
    singleNodeDisagg: 'Single-node disaggregated',
    multiNodeDisagg: 'Multi-node disaggregated',
    prefill: 'Prefill',
    decode: 'Decode',
    gpusUnit: 'Chips',
    tensorParallelism: 'Tensor parallelism',
    dataParallelism: 'Data parallelism',
    expertParallelism: 'Expert parallelism',
    pipelineParallelism: 'Pipeline parallelism',
    dpAttention: 'DP attention',
    yes: 'True',
    no: 'False',
    on: 'on',
    off: 'off',
    workers: 'Workers',
    configuration: 'Configuration',
  },
  zh: {
    singleNode: '单节点聚合',
    multiNode: '多节点聚合',
    disaggregated: '分离式',
    singleNodeDisagg: '单节点分离式',
    multiNodeDisagg: '多节点分离式',
    prefill: '预填充',
    decode: '解码',
    gpusUnit: '个芯片',
    tensorParallelism: '张量并行 (TP)',
    dataParallelism: '数据并行 (DP)',
    expertParallelism: '专家并行 (EP)',
    pipelineParallelism: '流水线并行 (PP)',
    dpAttention: '数据并行注意力 (DPA)',
    yes: '是',
    no: '否',
    on: '开启',
    off: '关闭',
    workers: 'worker 数',
    configuration: '配置',
  },
} as const;

const known = (v: number | null | undefined) => (v === null || v === undefined ? '?' : v);

const configLinesHTML = (d: InferenceData, locale: Locale): string => {
  const t = PARALLELISM_STRINGS[locale];
  const dpa = (v: boolean | string | undefined) =>
    `DPA ${v === undefined ? '?' : asBool(v) ? t.on : t.off}`;
  if (!d.disagg) {
    const dwdp = d.prefill_dwdp_size ?? 1;
    return factsLineHTML('', [
      `TP ${known(d.decode_tp)}`,
      `EP ${known(d.ep)}`,
      `DP ${known(d.dp)}`,
      dpa(d.dp_attention),
      `PP ${known(d.pp)}`,
      `DCP ${known(meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size) ?? d.decode_dcp_size ?? d.prefill_dcp_size)}`,
      `PCP ${known(meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size) ?? d.prefill_pcp_size ?? d.decode_pcp_size)}`,
      `DWDP ${dwdp}`,
      dwdp > 1 && `${t.workers} ${known(d.prefill_num_workers)}`,
    ]);
  }
  return [true, false]
    .map((prefill) =>
      factsLineHTML(prefill ? t.prefill : t.decode, [
        `TP ${known(prefill ? d.prefill_tp : d.decode_tp)}`,
        `EP ${known((prefill ? d.prefill_ep : d.decode_ep) ?? d.ep)}`,
        dpa((prefill ? d.prefill_dp_attention : d.decode_dp_attention) ?? d.dp_attention),
        `PP ${known((prefill ? d.prefill_pp : d.decode_pp) ?? d.pp)}`,
        `DCP ${known(prefill ? d.prefill_dcp_size : d.decode_dcp_size)}`,
        `PCP ${known(prefill ? d.prefill_pcp_size : d.decode_pcp_size)}`,
        prefill && `DWDP ${d.prefill_dwdp_size ?? 1}`,
      ]),
    )
    .join('');
};

const pinnedFactsHTML = (d: InferenceData, locale: Locale, deployment: string, config = '') => {
  const t = HOVER_STRINGS[locale];
  const facts = [
    deployment,
    t.chips(d.physicalChips ?? d.tp),
    config,
    t.conc(d.conc.toLocaleString('en-US')),
  ];
  return `<div data-pinned-config class="pinned-facts">${facts.filter(Boolean).join(' · ')}</div>`;
};

const topologyHTML = (d: InferenceData, locale: Locale): string => {
  const t = PARALLELISM_STRINGS[locale];
  if (
    !d.disagg &&
    (d.ep === null || d.ep === undefined) &&
    (d.prefill_ep === null || d.prefill_ep === undefined) &&
    !(d.prefill_dwdp_size && d.prefill_dwdp_size > 1)
  ) {
    return `<div data-pinned-parallelism>${pinnedFactsHTML(d, locale, d.is_multinode ? t.multiNode : t.singleNode)}<div data-pinned-widths>${configLinesHTML(d, locale)}</div></div>`;
  }
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
  const deployment = d.disagg
    ? d.is_multinode === undefined
      ? t.disaggregated
      : d.is_multinode
        ? t.multiNodeDisagg
        : t.singleNodeDisagg
    : d.is_multinode
      ? t.multiNode
      : t.singleNode;
  const compact = (r: Record<string, Cell>) => {
    if (r.DPA === '?') return `TP${r.TP}${typeof r.EP === 'number' ? ` / EP${r.EP}` : ''}`;
    return configSegmentLabel(
      Number(r.TP),
      r.EP as number | undefined,
      r.DPA === t.yes,
      r.PP as number | undefined,
      r.DCP as number | undefined,
      r.PCP as number | undefined,
      r.DP as number | undefined,
      r.DWDP as number | undefined,
    );
  };

  return `<div data-pinned-parallelism>
    ${
      d.disagg
        ? `${pinnedFactsHTML(d, locale, deployment)}<div class="pinned-table-scroll"><table class="pinned-topology pinned-compact-topology" aria-label="${t.configuration}">
      <thead><tr><th></th><th>${t.gpusUnit}</th><th>${t.configuration}</th><th>${t.workers}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.role}</td><td>${r.chips ?? '?'}</td><td><strong>${compact(r)}</strong></td><td>${r.workers ?? '?'}</td></tr>`).join(' ')}</tbody>
    </table></div>`
        : pinnedFactsHTML(d, locale, deployment, `<strong>${compact(rows[0])}</strong>`)
    }
    <div data-pinned-widths>${configLinesHTML(d, locale)}</div>
  </div>`;
};

const POWER_REASON_CODE_RE = /^[a-z][a-z0-9_]*$/u;

const powerWithheldRows = (d: InferenceData, locale: Locale): PointDetailRow[] => {
  if (!Array.isArray(d.power_invalid_reasons) || d.power_invalid_reasons.length === 0) return [];
  const codes = d.power_invalid_reasons
    .filter(
      (code) => typeof code === 'string' && code.length <= 64 && POWER_REASON_CODE_RE.test(code),
    )
    .map((code) => code.replaceAll('_', ' '));
  if (codes.length === 0) return [];
  return [row(TOOLTIP_STRINGS[locale].powerWithheld, codes.join(', '))];
};

export interface PointCacheHit {
  label: string;
  total: string;
  segments: { label: string; share: number; opacity: number }[];
  theoretical?: { label: string; share: number };
}

export interface PointDetails {
  title: string;
  subtitle: string;
  unofficial?: string;
  date: string;
  html: string;
  links: PointDetailLink[];
}

const pinnedMetricHTML = (label: string, value: number, metricKey?: string) => `<div>
  <div class="pinned-metric-label">${escapeHtml(label)}</div>
  <div class="pinned-metric-value">${formatHoverValue(value, metricKey)}</div>
  <div class="pinned-exact">${metricKey ? fmtY(value, metricKey) : fmt(value)}</div>
</div>`;

const pinnedSectionHTML = (html: string) =>
  html ? `<div class="pinned-section">${html}</div>` : '';

const LATENCY_STRINGS = {
  en: {
    caption: 'Latency',
    median: 'Med',
    ttft: 'TTFT',
    e2eLatency: 'E2EL',
    interactivity: 'Interactivity',
    e2eNormalizedInteractivity: 'Norm. interactivity',
  },
  zh: {
    caption: '延迟',
    median: '中位',
    ttft: 'TTFT',
    e2eLatency: '端到端延迟',
    interactivity: '交互性',
    e2eNormalizedInteractivity: '归一化交互性',
  },
} as const satisfies Record<Locale, Record<XAxisKind | 'caption' | 'median', string>>;

const latencyValue = (v: number | undefined): string => {
  if (v === undefined || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 999.5) return `${(v / 1000).toPrecision(3)}K`;
  return v.toPrecision(v < 1 ? 2 : 3);
};

const latencyHTML = (d: InferenceData, locale: Locale): string => {
  const t = LATENCY_STRINGS[locale];
  const rows = (
    [
      ['ttft', [d.median_ttft, d.p90_ttft]],
      ['e2eLatency', [d.median_e2el, d.p90_e2el]],
      ['interactivity', [d.median_intvty, d.p90_intvty]],
      ['e2eNormalizedInteractivity', [undefined, d.p90_e2e_norm_intvty]],
    ] satisfies [XAxisKind, (number | undefined)[]][]
  )
    .map(([kind, values]) => [kind, values.map(latencyValue)] as const)
    .filter(([, cells]) => cells.some((cell) => cell !== '—'));
  if (rows.length === 0) return '';
  return `<table data-pinned-latency class="pinned-topology pinned-latency" aria-label="${t.caption}">
      <thead><tr><th></th><th>${t.median}</th><th>P90</th></tr></thead>
      <tbody>${rows
        .map(([kind, cells]) => {
          const axis = X_AXIS_EXPLANATIONS[kind].name;
          return `<tr><td title="${escapeHtml(axis[locale](null))}">${t[kind]} <span class="pinned-latency-unit">${escapeHtml(axisLabelUnit(axis.en(null)))}</span></td>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
        })
        .join('')}</tbody>
    </table>`;
};

export const buildPointDetails = (config: TooltipConfig): PointDetails => {
  const { data: d, xLabel, yLabel, selectedYAxisMetric, overlayData } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];
  const hwEntry = (overlayData?.hardwareConfig ?? config.hardwareConfig)[d.hwKey];
  const hw = hwEntry ? getPointHardwareConfig(d, hwEntry) : null;
  const engines = hw?.suffix?.replace(/^\((?<inner>.*)\)$/u, '$<inner>').replaceAll(', ', ' · ');
  const ownDate = formatTooltipDate(d.actualDate ?? d.date, locale);
  const tputRows =
    selectedYAxisMetric === 'y_tpPerGpu'
      ? [
          ...(d['inputTputPerGpu'] ? [row(t.inputTputPerChip, fmt(d['inputTputPerGpu'].y))] : []),
          ...(d['outputTputPerGpu']
            ? [row(t.outputTputPerChip, fmt(d['outputTputPerGpu'].y))]
            : []),
        ]
      : [];
  const power =
    rowsHTML([
      ...powerTierRows(d, locale),
      ...powerVariantRows(d, selectedYAxisMetric, locale, config.powerLabelStyle),
    ]) +
    measuredPowerHTML(d, locale) +
    modeledSystemPowerHTML(d, selectedYAxisMetric, locale) +
    rowsHTML(powerWithheldRows(d, locale)) +
    workerPowerHTML(d, locale);
  const footer = d.image
    ? `<div class="pinned-image"><span>${t.image}</span><p>${escapeHtml(d.image.trim())}</p></div>`
    : '';
  const entryDate = comparisonEntryDate(d.date);
  const comparisonDate = config.comparisonLabel ?? formatTooltipDate(entryDate, locale);
  return {
    title: hw?.label ?? String(d.hwKey),
    subtitle: [engines, d.precision.toUpperCase()].filter(Boolean).join(' · '),
    unofficial: overlayData ? overlayNotice(d, overlayData, locale) : undefined,
    date: config.comparisonDate
      ? `${comparisonDate}${d.actualDate && d.actualDate !== entryDate ? ` ${t.dataFrom(ownDate)}` : ''}`
      : (config.comparisonLabel ?? ownDate),
    html: `<div class="pinned-metrics">${pinnedMetricHTML(yLabel, d.y, selectedYAxisMetric)}${pinnedMetricHTML(xLabel, d.x)}</div>
    ${topologyHTML(d, locale)}
    ${rowsHTML(tputRows)}
    ${pinnedSectionHTML(latencyHTML(d, locale))}
    ${pinnedSectionHTML(cacheHTML(d, locale, config.color ?? 'var(--foreground)') + runtimeHTML(d, locale))}
    ${pinnedSectionHTML(power)}
    ${pinnedSectionHTML(footer)}`,
    links: pointLinks({
      point: d,
      runUrl: config.runUrl,
      hasTraceData: Boolean(config.hasTrace),
      hasLogData: Boolean(config.hasLog),
      powerTraceMetric: selectedYAxisMetric,
      showPowerTelemetry: config.showPowerTelemetry,
      locale,
    }),
  };
};

const HOVER_STRINGS = {
  en: {
    conc: (n: number | string) => `conc ${n}`,
    chips: (n: number) => `${n} ${n === 1 ? 'chip' : 'chips'}`,
    details: 'Click for full details',
  },
  zh: {
    conc: (n: number | string) => `并发 ${n}`,
    chips: (n: number) => `${n} 芯片`,
    details: '点击查看完整信息',
  },
} as const;

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

const hoverSwatch = (color: string, size: number, opacity = 1) =>
  `<span style="display: inline-block; flex: none; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}; opacity: ${opacity}; margin-right: 5px;"></span>`;

const cacheBarHTML = (cache: PointCacheHit, color: string, height: number): string => `
      <div data-hover-cache-bar style="position: relative; display: flex; height: ${height}px; border-radius: ${height / 2}px; overflow: hidden; background: var(--border);">
        ${cache.segments.map((s) => `<div style="width: ${s.share}%; background: ${color}; opacity: ${s.opacity};"></div>`).join('')}
        ${cache.theoretical ? `<div style="position: absolute; top: 0; bottom: 0; left: calc(${cache.theoretical.share}% - 1px); width: 2px; background: var(--foreground); opacity: 0.6;"></div>` : ''}
      </div>`;

const cacheLegendHTML = (cache: PointCacheHit, color: string): string => `
        ${cache.segments.map((s) => `<span style="display: inline-flex; align-items: center;">${hoverSwatch(color, 6, s.opacity)}${escapeHtml(s.label)}</span>`).join('')}
        ${cache.theoretical ? `<span style="opacity: 0.8;">${escapeHtml(cache.theoretical.label)}</span>` : ''}`;

const hoverCacheHTML = (cache: PointCacheHit, color: string): string => `
      <div style="display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; margin-bottom: 4px; font-size: 11px;">
        <span style="color: var(--muted-foreground);">${escapeHtml(cache.label)}</span>
        <span style="color: var(--foreground); font-weight: 600;">${cache.total}</span>
      </div>${cacheBarHTML(cache, color, 6)}
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 5px; font-size: 11px; color: var(--muted-foreground);">${cacheLegendHTML(cache, color)}
      </div>`;

export interface HoverTooltipConfig extends Pick<
  TooltipConfig,
  | 'data'
  | 'xLabel'
  | 'yLabel'
  | 'selectedYAxisMetric'
  | 'hardwareConfig'
  | 'locale'
  | 'overlayData'
  | 'comparisonLabel'
> {
  color: string;
}

export const generateHoverTooltipContent = (config: HoverTooltipConfig): string => {
  const { data: d, xLabel, yLabel, selectedYAxisMetric, overlayData, color } = config;
  const locale = config.locale ?? 'en';
  const t = HOVER_STRINGS[locale];
  const detailStrings = TOOLTIP_STRINGS[locale];
  const hwEntry = (overlayData?.hardwareConfig ?? config.hardwareConfig)[d.hwKey];
  const system = hwEntry ? getDisplayLabel(getPointHardwareConfig(d, hwEntry)) : String(d.hwKey);
  const setup = [
    t.chips(d.physicalChips ?? d.tp),
    getPointLabel(d) || `TP${d.tp}`,
    speculativeDecodingName({ method: d.spec_decoding, algorithm: d.spec_algorithm }, d.model),
  ].filter(Boolean);
  const cache = pointCacheHit(d, locale);
  const notice = overlayData ? overlayNotice(d, overlayData, locale) : '';
  const sourceDate =
    d.actualDate && d.actualDate !== comparisonEntryDate(d.date)
      ? ` ${detailStrings.dataFrom(formatTooltipDate(d.actualDate, locale))}`
      : '';
  const context = config.comparisonLabel
    ? `${detailStrings.date}${labelColon(detailStrings.date)} ${config.comparisonLabel}${sourceDate}`
    : '';
  const value = (v: string, label: string) =>
    `<span style="white-space: nowrap;"><span style="color: var(--foreground); font-weight: 600;">${v}</span> <span style="color: var(--muted-foreground);">${escapeHtml(axisLabelUnit(label))}</span></span>`;
  const shell = chartTooltipShellStyle({
    pinned: false,
    minWidth: 240,
    maxWidth: 320,
  });

  return `
    <div data-hover-tooltip style="${shell}; font-variant-numeric: tabular-nums; line-height: 1.35;">
      ${notice ? `<div data-hover-notice style="color: #dc2626; font-size: 11px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(notice)}</div>` : ''}
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px;">
        <span style="display: inline-flex; align-items: center; min-width: 0; color: var(--foreground); font-size: 12px; font-weight: 600;">${hoverSwatch(color, 8)}<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(system)}</span></span>
        <span style="flex: none; color: var(--muted-foreground); font-size: 11px;">${escapeHtml(d.precision.toUpperCase())} · ${t.conc(d.conc)}</span>
      </div>
      ${context ? `<div data-hover-context style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 6px;">${escapeHtml(context)}</div>` : ''}
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 16px; font-size: 12px;">
        ${value(formatHoverValue(d.y, selectedYAxisMetric), yLabel)}
        ${value(formatHoverValue(d.x), xLabel)}
      </div>
      <div style="margin-top: 2px; color: var(--muted-foreground); font-size: 11px;">${escapeHtml(setup.join(' · '))}</div>
      ${cache ? hoverCacheHTML(cache, color) : ''}
      <div style="margin-top: 8px; color: var(--muted-foreground); font-size: 10px; opacity: 0.75;">${t.details}</div>
    </div>
  `;
};
