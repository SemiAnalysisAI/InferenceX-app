import { formatNumber, getDisplayLabel } from '@/lib/utils';
import { specMethodDisplayLabel } from '@/lib/compare-variant-slug';
import { agenticDetailHref } from '@/lib/agentic-detail-link';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import type { Locale } from '@/lib/i18n';
import { isKvOffloadEnabled } from '@/lib/kv-offload';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import { isMeasuredEnergyConfigKey } from '@/components/inference/metric-registry';
import {
  meaningfulParallelismSize,
  parallelismLabel,
} from '@/components/inference/utils/parallelism-label';
import {
  cacheImplementationLabel,
  offloadTypeLabel,
  versionedComponentLabel,
} from '@/components/inference/utils/runtime-metadata-labels';

export interface TooltipConfig {
  /** The data point to display */
  data: InferenceData;
  /** Whether the tooltip is pinned (enables text selection) */
  isPinned: boolean;
  /** X-axis label for the chart */
  xLabel: string;
  /** Y-axis label for the chart */
  yLabel: string;
  /** Currently selected Y-axis metric */
  selectedYAxisMetric: string;
  /** Hardware configuration for looking up labels */
  hardwareConfig: HardwareConfig;
  /** URL to the GitHub Actions workflow run */
  runUrl?: string;
  /**
   * Whether this agentic point has a stored trace_replay blob. Controls
   * visibility of the "View charts" button — the actual distributions are
   * rendered on the detail page, not inline, so all the tooltip needs is a
   * presence boolean (sourced from the bulk `/api/v1/trace-availability`
   * call so we don't ship megabytes of profile JSONL just for this check).
   */
  hasTrace?: boolean;
  /** Whether this official DB-backed point has a linked `server_logs` row. */
  hasLog?: boolean;
  /** Page locale for tooltip metadata labels. Defaults to English. */
  locale?: Locale;
}

export interface OverlayTooltipConfig extends TooltipConfig {
  /** Overlay data containing label and run URL */
  overlayData: OverlayData;
}

// `dp_attention` is `boolean | string` on InferenceData (DB sends raw, the
// transform narrows "true"/"false" → boolean). Coerce to a plain boolean for
// the shared labeler, treating the legacy string form correctly.
const asBool = (v: boolean | string | undefined): boolean | undefined =>
  typeof v === 'string' ? v === 'true' : v;

/**
 * Returns the short label for a data point on the chart.
 * - Non-multinode: e.g. "TP8", "EP8", "TEP8", "DEP8", "DPAEP8"
 * - Multinode disagg: e.g. "2xEP4+1xDPAEP32"
 * - Old data (no ep field): falls back to tp value
 *
 * Delegates to the shared {@link parallelismLabel} so the chart points and the
 * agentic sibling navigator describe a config identically.
 */
export const getPointLabel = (d: InferenceData): string => {
  const aggregateDcp = meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size);
  const aggregatePcp = meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size);
  return parallelismLabel({
    // InferenceData.tp is the TOTAL GPU count (createChartDataPoint folds pp
    // into it for aggregated rows) — the label wants the actual TP width, so
    // prefer the raw decode_tp and keep d.tp only as a legacy fallback.
    tp: d.decode_tp ?? d.tp,
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
};

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

const labelColon = (label: string) => (/[\u4E00-\u9FFF]/u.test(label) ? '：' : ':');

const tooltipLine = (label: string, value: string | number) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}${labelColon(label)}</strong> ${value}</div>`;

const formatPct = (v: number | undefined): string | null =>
  v === undefined || v === null || Number.isNaN(v) ? null : `${(v * 100).toFixed(1)}%`;

/** Tooltip numeric values are capped at 3 decimal places (trailing zeros stripped).
 *  Exported so the legend points table shows exactly the numbers the tooltip shows. */
export const fmt = (v: number): string => {
  if (!Number.isFinite(v)) return String(v);
  const rounded = parseFloat(v.toFixed(3));
  if (Math.abs(rounded) >= 10000) return new Intl.NumberFormat('en-US').format(rounded);
  return String(rounded);
};

const TOOLTIP_STRINGS = {
  en: {
    dismiss: 'Click elsewhere to dismiss',
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
    powerData: 'Power Data',
    powerCertified: 'Certified (validated measurement)',
    powerLegacy: 'Legacy (no validation verdict)',
  },
  zh: {
    dismiss: '点击其他区域关闭',
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
    powerData: '功耗数据',
    powerCertified: '已认证（通过验证的测量）',
    powerLegacy: '旧版（无验证结论）',
  },
} as const;

/**
 * Measured-power certification tier line. Rendered only while a Measured
 * Energy y-axis is selected and the point carries a tier — non-measured axes
 * and telemetry-free points stay unchanged.
 */
const powerTierHTML = (d: InferenceData, selectedYAxisMetric: string, locale: Locale): string => {
  if (!isMeasuredEnergyConfigKey(selectedYAxisMetric) || !d.power_tier) return '';
  const t = TOOLTIP_STRINGS[locale];
  return tooltipLine(t.powerData, d.power_tier === 'certified' ? t.powerCertified : t.powerLegacy);
};

/** Escape strings that arrive from artifact JSONB (worker role / hosts)
 *  before interpolating them into tooltip HTML. */
const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

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

/** Pinned tooltips list at most this many workers before the "+N more" line. */
const WORKER_ROWS_LIMIT = 8;

/**
 * Per-worker measured power drilldown. Rendered only while the tooltip is
 * pinned (same rule as the point-detail actions) so hover tooltips stay lean;
 * nothing renders when `workers` is absent or empty — production AgentX rows
 * currently ship without it.
 */
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
    // avg_mem_used_mb follows the nvidia-smi/telemetry convention (MiB despite
    // the _mb suffix), hence /1024 → GiB. Revisit if PLAN-09's producer differs.
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
    theoreticalHitRate: '理论 Cache 命中率',
    legacyEnabled: '已启用（旧版数据）',
    legacyDisabled: '已禁用（旧版数据）',
  },
} as const;

/**
 * Cache configuration and hit-rate rows shared by fixed-sequence, agentic,
 * official, comparison, and unofficial-run tooltips.
 */
const generateCacheMetadataHTML = (d: InferenceData, locale: Locale): string => {
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

  const gpuHit = formatPct(d.server_gpu_cache_hit_rate);
  const cpuHit = formatPct(d.server_cpu_cache_hit_rate);
  const theoreticalHit = formatPct(d.theoretical_cache_hit_rate);
  if (gpuHit) parts.push(tooltipLine(t.gpuHitRate, gpuHit));
  if (cpuHit && isKvOffloadEnabled(d)) parts.push(tooltipLine(t.cpuHitRate, cpuHit));
  if (theoreticalHit) parts.push(tooltipLine(t.theoreticalHitRate, theoreticalHit));
  return parts.join('');
};

/**
 * Agentic-only request success and token totals. Cache metadata is rendered
 * separately because fixed-sequence rows can carry it too.
 */
const AGENTIC_STRINGS = {
  en: { speculativeDecoding: 'Speculative Decoding', off: 'Off' },
  zh: { speculativeDecoding: '投机解码', off: '关闭' },
} as const;

const generateAgenticHTML = (d: InferenceData, locale: Locale): string => {
  if (d.benchmark_type !== 'agentic_traces') return '';

  const t = AGENTIC_STRINGS[locale];
  const parts: string[] = [];
  const specMethod = d.spec_decoding ?? 'none';
  parts.push(
    tooltipLine(
      t.speculativeDecoding,
      specMethod === 'none' || specMethod === ''
        ? t.off
        : specMethodDisplayLabel(d.model, specMethod),
    ),
  );

  if (d.num_requests_total !== undefined && d.num_requests_successful !== undefined) {
    const successPct =
      d.num_requests_total > 0
        ? ` (${((d.num_requests_successful / d.num_requests_total) * 100).toFixed(0)}%)`
        : '';
    parts.push(
      tooltipLine(
        'Requests',
        `${d.num_requests_successful} / ${d.num_requests_total}${successPct}`,
      ),
    );
  }

  if (d.total_prompt_tokens !== undefined) {
    parts.push(tooltipLine('Prompt Tokens', formatNumber(d.total_prompt_tokens)));
  }
  if (d.total_generation_tokens !== undefined) {
    parts.push(tooltipLine('Generated Tokens', formatNumber(d.total_generation_tokens)));
  }

  // Histograms + time-series live on the dedicated detail page now; the
  // "View charts" button (rendered by the wrapper when pinned + has trace
  // data) takes the user there.

  return parts.join('');
};

const ACTION_STRINGS = {
  en: { charts: 'View charts', logs: 'View logs' },
  zh: { charts: '查看图表', logs: '查看日志' },
} as const;

const pointDetailActionLink = (action: 'view-charts' | 'view-logs', href: string, label: string) =>
  `<a data-action="${action}" href="${href}" style="
    display: block; width: 100%; padding: 4px 8px; font-size: 11px; font-weight: 500;
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    background: var(--accent); color: var(--accent-foreground); text-align: center; text-decoration: none;
  ">${label} &rarr;</a>`;

/** Point-detail links rendered only for persisted, pinned official points. */
const viewActionsHTML = (
  isPinned: boolean,
  hasTraceData: boolean,
  hasLogData: boolean,
  pointId: number | undefined,
  benchmarkType: string | undefined,
  locale: Locale,
): string => {
  const isAgentic = benchmarkType === 'agentic_traces';
  const showCharts = isAgentic && hasTraceData;
  if (!isPinned || !isPersistedBenchmarkId(pointId) || (!showCharts && !hasLogData)) return '';
  const prefix = locale === 'zh' ? '/zh' : '';
  const agenticHref = agenticDetailHref(pointId, locale);
  const logHref = isAgentic
    ? `${agenticHref}${agenticHref.includes('?') ? '&' : '?'}view=logs`
    : `${prefix}/inference/logs/${pointId}`;
  const t = ACTION_STRINGS[locale];
  const actions = [
    showCharts ? pointDetailActionLink('view-charts', agenticHref, t.charts) : '',
    hasLogData ? pointDetailActionLink('view-logs', logHref, t.logs) : '',
  ].filter(Boolean);
  return `<div style="display: grid; gap: 6px; margin-top: 8px;">${actions.join('')}</div>`;
};

const shortenSha = (image: string) =>
  image.replaceAll(/(?<shaPrefix>sha256:[a-f0-9]{7})[a-f0-9]+/giu, '$<shaPrefix>…');

const imageTooltipLine = (image: string, label: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${label}${labelColon(label)}</strong> <span style="display: inline-block; vertical-align: top; overflow-wrap: anywhere;">${shortenSha(image.trim()).replace(/\s+/u, '<br />')}</span>
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
    expertParallelism: 'Expert Parallelism',
    pipelineParallelism: 'Pipeline Parallelism',
    decodeContextParallelism: 'Decode Context Parallelism (DCP)',
    prefillContextParallelism: 'Prefill Context Parallelism (PCP)',
    dpAttention: 'DP Attention',
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
    expertParallelism: '专家并行 (EP)',
    pipelineParallelism: '流水线并行 (PP)',
    decodeContextParallelism: '解码上下文并行 (DCP)',
    prefillContextParallelism: '预填充上下文并行 (PCP)',
    dpAttention: 'DP Attention',
  },
} as const;

const contextParallelismParts = (dcp?: number, pcp?: number): string => {
  const parts: string[] = [];
  if (dcp !== undefined && dcp > 1) parts.push(`DCP: ${dcp}`);
  if (pcp !== undefined && pcp > 1) parts.push(`PCP: ${pcp}`);
  return parts.length > 0 ? `${parts.join(', ')}, ` : '';
};

/**
 * Generates HTML for the parallelism configuration section of a tooltip.
 * Falls back to GPU count for old data without parallelism fields.
 * Pipeline parallelism is only rendered when > 1 (pp of 0/1 means "no PP",
 * matching the point-label rule in {@link parallelismLabel}).
 */
const generateParallelismHTML = (d: InferenceData, locale: Locale = 'en'): string => {
  const t = PARALLELISM_STRINGS[locale];
  const deployment = d.disagg ? t.disaggregated : d.is_multinode ? t.multiNode : t.singleNode;
  const aggregateDcp = meaningfulParallelismSize(d.prefill_dcp_size, d.decode_dcp_size);
  const aggregatePcp = meaningfulParallelismSize(d.prefill_pcp_size, d.decode_pcp_size);
  if (
    (d.ep === null || d.ep === undefined) &&
    (d.prefill_ep === null || d.prefill_ep === undefined)
  ) {
    return (
      tooltipLine(t.deployment, deployment) +
      tooltipLine(t.strategy, t.gpuCount(d.tp)) +
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
    const prefillContext = contextParallelismParts(d.prefill_dcp_size, d.prefill_pcp_size);
    const decodeContext = contextParallelismParts(d.decode_dcp_size, d.decode_pcp_size);
    return `
      ${tooltipLine(t.deployment, deployment)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${t.prefill}${labelColon(t.prefill)}</strong> ${d.num_prefill_gpu ?? '?'} ${t.gpusUnit}, TP: ${ptp}, ${ppp > 1 ? `PP: ${ppp}, ` : ''}${prefillContext}EP: ${pep}, DPA: ${pdpa ? 'True' : 'False'}, Workers: ${pw}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${t.decode}${labelColon(t.decode)}</strong> ${d.num_decode_gpu ?? '?'} ${t.gpusUnit}, TP: ${dtp}, ${dpp > 1 ? `PP: ${dpp}, ` : ''}${decodeContext}EP: ${dep}, DPA: ${ddpa ? 'True' : 'False'}, Workers: ${dw}
      </div>`;
  }

  return `
    ${tooltipLine(t.deployment, deployment)}
    ${tooltipLine(t.tensorParallelism, d.decode_tp ?? d.tp)}
    ${d.pp !== null && d.pp !== undefined && d.pp > 1 ? tooltipLine(t.pipelineParallelism, d.pp) : ''}
    ${aggregateDcp ? tooltipLine(t.decodeContextParallelism, aggregateDcp) : ''}
    ${aggregatePcp ? tooltipLine(t.prefillContextParallelism, aggregatePcp) : ''}
    ${d.ep !== null && d.ep !== undefined ? tooltipLine(t.expertParallelism, d.ep) : ''}
    ${tooltipLine(t.dpAttention, d.dp_attention ? 'True' : 'False')}`;
};

/**
 * Generates HTML content for official data point tooltips.
 *
 * @param config - Configuration for the tooltip
 * @returns HTML string for the tooltip content
 */
export const generateTooltipContent = (config: TooltipConfig): string => {
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
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hardwareConfig[d.hwKey] ? getDisplayLabel(hardwareConfig[d.hwKey]) : d.hwKey}
      </div>
      ${tooltipLine(t.date, `${d.actualDate ?? d.date}`)}
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image, t.image)}`
          : ''
      }
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmt(d.y))}
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
      ${tooltipLine(t.totalChips, d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, `${d.precision.toUpperCase()}`)}
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
      ${runLinkHTML(runUrl)}
      ${viewActionsHTML(isPinned, Boolean(hasTrace), Boolean(config.hasLog), d.id, d.benchmark_type, locale)}
    </div>
  `;
};

/**
 * Generates HTML content for overlay (unofficial run) data point tooltips.
 * These tooltips have a distinct red border and "UNOFFICIAL" label.
 *
 * @param config - Configuration for the overlay tooltip
 * @returns HTML string for the tooltip content
 */
export const generateOverlayTooltipContent = (config: OverlayTooltipConfig): string => {
  const { data: d, isPinned, xLabel, yLabel, selectedYAxisMetric, overlayData } = config;
  const locale = config.locale ?? 'en';
  const t = TOOLTIP_STRINGS[locale];
  const hwConfig = overlayData.hardwareConfig[d.hwKey];
  const perRow = overlayData.getRunForRow?.(d);
  const branch = perRow?.branch ?? overlayData.label;

  return `
    <div style="background: var(--popover); border: 2px solid #dc2626; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="color: #dc2626; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">
        ${t.unofficialRun}
      </div>
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hwConfig ? getDisplayLabel(hwConfig) : d.hwKey}
      </div>
      ${tooltipLine(t.branch, `${branch}`)}
      ${tooltipLine(t.date, `${d.actualDate ?? d.date}`)}
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmt(d.y))}
      ${powerTierHTML(d, selectedYAxisMetric, locale)}
      ${tooltipLine(t.totalChips, d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, `${d.precision.toUpperCase()}`)}
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
    </div>
  `;
};

/**
 * Generates HTML content for GPU graph tooltips (date comparison view).
 * Similar to regular tooltips but shows "GPU Config" instead of hardware label at top.
 *
 * @param config - Configuration for the tooltip
 * @returns HTML string for the tooltip content
 */
export const generateGPUGraphTooltipContent = (config: TooltipConfig): string => {
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
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      ${tooltipLine(t.date, `${d.date}${d.actualDate && d.actualDate !== d.date ? ` <span style="opacity: 0.7">${t.dataFrom(d.actualDate)}</span>` : ''}`)}
      ${tooltipLine(t.chipConfig, `${hardwareConfig[d.hwKey] ? getDisplayLabel(hardwareConfig[d.hwKey]) : d.hwKey}`)}
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image, t.image)}`
          : ''
      }
      ${tooltipLine(xLabel, fmt(d.x))}
      ${tooltipLine(yLabel, fmt(d.y))}
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
      ${tooltipLine(t.totalChips, d.tp)}
      ${generateParallelismHTML(d, locale)}
      ${tooltipLine(t.concurrency, `${d.conc}`)}
      ${tooltipLine(t.precision, `${d.precision.toUpperCase()}`)}
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d, locale)}
      ${generateWorkerPowerHTML(d, isPinned, locale)}
      ${runLinkHTML(runUrl)}
      ${viewActionsHTML(isPinned, Boolean(hasTrace), Boolean(hasLog), d.id, d.benchmark_type, locale)}
    </div>
  `;
};
