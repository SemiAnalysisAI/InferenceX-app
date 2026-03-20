import { formatNumber, getDisplayLabel } from '@/lib/utils';

import { HardwareConfig, InferenceData, OverlayData } from '@/components/inference/types';

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
}

export interface OverlayTooltipConfig extends TooltipConfig {
  /** Overlay data containing label and run URL */
  overlayData: OverlayData;
}

/**
 * Generates a short config segment label from parallelism params.
 * - tp == ep and dp-attn false: "TEP{N}"
 * - tp == ep and dp-attn true: "DEP{N}"
 * - ep > 1 (tp != ep): "EP{ep}" or "DPAEP{ep}"
 * - ep <= 1 (or no EP): "TP{tp}" or "DPATP{tp}"
 */
const configSegmentLabel = (
  tp: number,
  ep: number | undefined,
  dpAttention: boolean | undefined,
): string => {
  if (ep != null && ep > 1 && tp === ep) {
    return dpAttention ? `DEP${tp}` : `TEP${tp}`;
  }
  const dpaPrefix = dpAttention ? 'DPA' : '';
  if (ep == null || ep <= 1) return `${dpaPrefix}TP${tp}`;
  return `${dpaPrefix}EP${ep}`;
};

/**
 * Returns the short label for a data point on the chart.
 * - Non-multinode: e.g. "TP8", "EP8", "TEP8", "DEP8", "DPAEP8"
 * - Multinode disagg: e.g. "2xEP4+1xDPAEP32"
 * - Old data (no ep field): falls back to tp value
 */
export const getPointLabel = (d: InferenceData): string => {
  if (d.ep == null && d.prefill_ep == null) return String(d.tp);

  if (d.is_multinode && d.disagg) {
    const prefillLabel = configSegmentLabel(
      d.prefill_tp ?? d.tp,
      d.prefill_ep ?? d.ep,
      d.prefill_dp_attention ?? d.dp_attention,
    );
    const decodeLabel = configSegmentLabel(
      d.decode_tp ?? d.tp,
      d.decode_ep ?? d.ep,
      d.decode_dp_attention ?? d.dp_attention,
    );
    const pw = d.prefill_num_workers ?? 1;
    const dw = d.decode_num_workers ?? 1;
    return `${pw}x${prefillLabel}+${dw}x${decodeLabel}`;
  }

  return configSegmentLabel(d.tp, d.ep, d.dp_attention);
};

const tooltipLine = (label: string, value: string | number) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

/**
 * Generates HTML for the parallelism configuration section of a tooltip.
 * Falls back to GPU count for old data without parallelism fields.
 */
const generateParallelismHTML = (d: InferenceData): string => {
  if (d.ep == null && d.prefill_ep == null) {
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
    ${d.ep != null ? tooltipLine('Expert Parallelism', d.ep) : ''}
    ${tooltipLine('DP Attention', d.dp_attention ? 'True' : 'False')}`;
};

/**
 * Generates HTML content for official data point tooltips.
 *
 * @param config - Configuration for the tooltip
 * @returns HTML string for the tooltip content
 */
export const generateTooltipContent = (config: TooltipConfig): string => {
  const { data: d, isPinned, xLabel, yLabel, selectedYAxisMetric, hardwareConfig } = config;

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
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Image:</strong> ${d?.image}
      </div>`
          : ''
      }
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${formatNumber(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${formatNumber(d.y)}
      </div>
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Input Token Throughput per GPU:</strong> ${formatNumber(d['inputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Output Token Throughput per GPU:</strong> ${formatNumber(d['outputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
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
  const hwConfig = overlayData.hardwareConfig[d.hwKey];

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
        <strong>Branch:</strong> ${overlayData.label}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Date:</strong> ${d.actualDate ?? d.date}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${formatNumber(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${formatNumber(d.y)}
      </div>
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
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
  const { data: d, isPinned, xLabel, yLabel, selectedYAxisMetric, hardwareConfig } = config;

  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? '<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">Click elsewhere to dismiss</div>' : ''}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Date:</strong> ${d.date}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>GPU Config:</strong> ${hardwareConfig[d.hwKey] ? getDisplayLabel(hardwareConfig[d.hwKey]) : d.hwKey}
      </div>
      ${
        d?.image
          ? `
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Image:</strong> ${d?.image}
      </div>`
          : ''
      }
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${xLabel}:</strong> ${formatNumber(d.x)}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>${yLabel}:</strong> ${formatNumber(d.y)}
      </div>
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['inputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Input Token Throughput per GPU:</strong> ${formatNumber(d['inputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${
        selectedYAxisMetric === 'y_tpPerGpu' && d['outputTputPerGpu']
          ? `
          <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
            <strong>Output Token Throughput per GPU:</strong> ${formatNumber(d['outputTputPerGpu'].y)}
          </div>`
          : ''
      }
      ${tooltipLine('Total GPUs', d.tp)}
      ${generateParallelismHTML(d)}
      <div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;">
        <strong>Concurrency:</strong> ${d.conc}
      </div>
      <div style="color: var(--muted-foreground); font-size: 11px;">
        <strong>Precision:</strong> ${d.precision.toUpperCase()}
      </div>
    </div>
  `;
};
