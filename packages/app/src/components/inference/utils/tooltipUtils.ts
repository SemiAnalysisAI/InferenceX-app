import { formatNumber, getDisplayLabel } from '@/lib/utils';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import type { Locale } from '@/lib/i18n';
import { isKvOffloadEnabled } from '@/lib/kv-offload';

import type { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';
import { parallelismLabel } from '@/components/inference/utils/parallelism-label';
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
  /** Whether this config is already being tracked */
  isTracked?: boolean;
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
export const getPointLabel = (d: InferenceData): string =>
  parallelismLabel({
    tp: d.tp,
    ep: d.ep,
    dpAttention: asBool(d.dp_attention),
    disagg: d.disagg,
    isMultinode: d.is_multinode,
    prefillTp: d.prefill_tp,
    prefillEp: d.prefill_ep,
    prefillDpAttention: asBool(d.prefill_dp_attention),
    prefillNumWorkers: d.prefill_num_workers,
    decodeTp: d.decode_tp,
    decodeEp: d.decode_ep,
    decodeDpAttention: asBool(d.decode_dp_attention),
    decodeNumWorkers: d.decode_num_workers,
  });

const runLinkHTML = (runUrl?: string) =>
  runUrl
    ? `<div style="font-size: 11px; margin-top: 4px;">
        <a href="${runUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--muted-foreground); text-decoration: underline; cursor: pointer;">GitHub Actions Run</a>
      </div>`
    : '';

const tooltipLine = (label: string, value: string | number) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

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

const CACHE_STRINGS = {
  en: {
    offloadType: 'Offload Type',
    offloadBackend: 'KV Offload Engine',
    transferEngine: 'KV Transfer Engine',
    router: 'Router',
    gpuHitRate: 'GPU Cache Hit Rate',
    cpuHitRate: 'CPU Cache Hit Rate',
    theoreticalHitRate: 'Theoretical Cache Hit Rate',
    legacyEnabled: 'Enabled (legacy data)',
    legacyDisabled: 'Disabled (legacy data)',
  },
  zh: {
    offloadType: '卸载类型',
    offloadBackend: 'KV 卸载引擎',
    transferEngine: 'KV 传输引擎',
    router: '路由器',
    gpuHitRate: 'GPU Cache 命中率',
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
const generateAgenticHTML = (d: InferenceData): string => {
  if (d.benchmark_type !== 'agentic_traces') return '';

  const parts: string[] = [];

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

/** "View charts" link — only visible when the tooltip is pinned and the
 *  point has stored trace data. Wired up by the scatter/GPU graph click handlers. */
const viewChartsButtonHTML = (
  isPinned: boolean,
  hasTraceData: boolean,
  pointId: number | undefined,
): string => {
  if (!isPinned || !hasTraceData || !isPersistedBenchmarkId(pointId)) return '';
  return `<a data-action="view-charts" href="/inference/agentic/${pointId}" style="
    display: block; margin-top: 8px; width: 100%; padding: 4px 8px; font-size: 11px; font-weight: 500;
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    background: var(--accent); color: var(--accent-foreground); text-align: center; text-decoration: none;
  ">View charts &rarr;</a>`;
};

const shortenSha = (image: string) =>
  image.replaceAll(/(?<shaPrefix>sha256:[a-f0-9]{7})[a-f0-9]+/giu, '$<shaPrefix>…');

const imageTooltipLine = (image: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Image:</strong> <span style="display: inline-block; vertical-align: top; overflow-wrap: anywhere;">${shortenSha(image.trim()).replace(/\s+/u, '<br />')}</span>
      </div>`;

/**
 * Generates HTML for the parallelism configuration section of a tooltip.
 * Falls back to GPU count for old data without parallelism fields.
 */
const generateParallelismHTML = (d: InferenceData): string => {
  if (
    (d.ep === null || d.ep === undefined) &&
    (d.prefill_ep === null || d.prefill_ep === undefined)
  ) {
    return tooltipLine('Parallelism Strategy', `${d.tp} GPU${d.tp > 1 ? 's' : ''}`);
  }

  if (d.is_multinode && d.disagg) {
    const ptp = d.prefill_tp ?? d.tp;
    const pep = d.prefill_ep ?? d.ep ?? 0;
    const pdpa = d.prefill_dp_attention ?? d.dp_attention ?? false;
    const dtp = d.decode_tp ?? d.tp;
    const dep = d.decode_ep ?? d.ep ?? 0;
    const ddpa = d.decode_dp_attention ?? d.dp_attention ?? false;
    const pw = d.prefill_num_workers ?? 1;
    const dw = d.decode_num_workers ?? 1;
    return `
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Prefill:</strong> ${d.num_prefill_gpu ?? '?'} GPUs, TP: ${ptp}, EP: ${pep}, DPA: ${pdpa ? 'True' : 'False'}, Workers: ${pw}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Decode:</strong> ${d.num_decode_gpu ?? '?'} GPUs, TP: ${dtp}, EP: ${dep}, DPA: ${ddpa ? 'True' : 'False'}, Workers: ${dw}
      </div>`;
  }

  return `
    ${tooltipLine('Tensor Parallelism', d.tp)}
    ${d.ep !== null && d.ep !== undefined ? tooltipLine('Expert Parallelism', d.ep) : ''}
    ${tooltipLine('DP Attention', d.dp_attention ? 'True' : 'False')}`;
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

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hardwareConfig[d.hwKey] ? getDisplayLabel(hardwareConfig[d.hwKey]) : d.hwKey}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Date:</strong> ${d.actualDate ?? d.date}
      </div>
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image)}`
          : ''
      }
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${fmt(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${fmt(d.y)}
      </div>
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Input Token Throughput per GPU:</strong> ${fmt(d['inputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Output Token Throughput per GPU:</strong> ${fmt(d['outputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d)}
      ${runLinkHTML(runUrl)}
      ${viewChartsButtonHTML(isPinned, Boolean(hasTrace), d.id)}
      ${
        isPinned
          ? `<button data-action="track-over-time" style="
              margin-top: 8px; width: 100%; padding: 4px 8px; font-size: 11px; font-weight: 500;
              border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
              background: var(--accent); color: var(--accent-foreground);
            ">${config.isTracked ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:4px;"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>Untrack Over Time' : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-1px;margin-right:4px;"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>Track Over Time'}</button>`
          : ''
      }
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
  const { data: d, isPinned, xLabel, yLabel, overlayData } = config;
  const locale = config.locale ?? 'en';
  const hwConfig = overlayData.hardwareConfig[d.hwKey];
  const perRow = overlayData.getRunForRow?.(d);
  const branch = perRow?.branch ?? overlayData.label;

  return `
    <div style="background: var(--popover); border: 2px solid #dc2626; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: #dc2626; font-size: 10px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;">
        ✕ UNOFFICIAL RUN
      </div>
      <div style="color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        ${hwConfig ? getDisplayLabel(hwConfig) : d.hwKey}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Branch:</strong> ${branch}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Date:</strong> ${d.actualDate ?? d.date}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${fmt(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${fmt(d.y)}
      </div>
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d)}
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
  } = config;
  const locale = config.locale ?? 'en';

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Date:</strong> ${d.date}${d.actualDate && d.actualDate !== d.date ? ` <span style="opacity: 0.7">(data from ${d.actualDate})</span>` : ''}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>GPU Config:</strong> ${hardwareConfig[d.hwKey] ? getDisplayLabel(hardwareConfig[d.hwKey]) : d.hwKey}
      </div>
      ${
        d?.image
          ? `
      ${imageTooltipLine(d.image)}`
          : ''
      }
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${fmt(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${fmt(d.y)}
      </div>
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Input Token Throughput per GPU:</strong> ${fmt(d['inputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Output Token Throughput per GPU:</strong> ${fmt(d['outputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
      ${generateCacheMetadataHTML(d, locale)}
      ${generateAgenticHTML(d)}
      ${runLinkHTML(runUrl)}
      ${viewChartsButtonHTML(isPinned, Boolean(hasTrace), d.id)}
    </div>
  `;
};
