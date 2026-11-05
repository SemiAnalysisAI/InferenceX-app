import { escapeHtml } from '@/lib/shared/utils';

export interface ChartTooltipShellOptions {
  /** Pinned tooltips allow text selection. Omit for tooltips that never pin. */
  pinned?: boolean;
  /** CSS border shorthand. Defaults to the theme hairline. */
  border?: string;
  minWidth?: number;
  /** Caps the width, and never wider than the viewport minus a gutter. */
  maxWidth?: number;
  /** Lets links and buttons inside the tooltip take the pointer. */
  interactive?: boolean;
  /** Caps the height and scrolls long content inside the card. */
  scrollable?: boolean;
}

/**
 * Inline style for the opaque card around D3 chart tooltip HTML. The chart tooltip element itself
 * is transparent, so content without this surface shows the chart through it. The mobile sheet
 * strips it.
 */
export function chartTooltipShellStyle(options: ChartTooltipShellOptions = {}): string {
  const {
    pinned,
    border = '1px solid var(--border)',
    minWidth,
    maxWidth,
    interactive,
    scrollable,
  } = options;
  const styles = [
    'background: var(--popover)',
    'color: var(--popover-foreground)',
    `border: ${border}`,
    'border-radius: 8px',
    'padding: 12px',
    'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)',
    'box-sizing: border-box',
  ];
  if (minWidth !== undefined) styles.push(`min-width: ${minWidth}px`);
  if (maxWidth !== undefined) styles.push(`max-width: min(${maxWidth}px, calc(100vw - 16px))`);
  if (scrollable) {
    styles.push(
      'max-height: min(70vh, calc(100dvh - 16px))',
      'overflow-x: hidden',
      'overflow-y: auto',
      'overscroll-behavior: contain',
    );
  }
  if (interactive) styles.push('pointer-events: auto');
  if (pinned !== undefined) styles.push(`user-select: ${pinned ? 'text' : 'none'}`);
  return styles.join('; ');
}

/** Wraps D3 chart tooltip HTML in the shared card. */
export function chartTooltipShell(body: string, options?: ChartTooltipShellOptions): string {
  return `<div style="${chartTooltipShellStyle(options)}">${body}</div>`;
}

/**
 * Tooltip heading in the foreground color, with an optional series dot. `label` must already be
 * escaped by the caller.
 */
export function chartTooltipTitle(label: string, color?: string): string {
  const dot = color
    ? `<span style="width: 8px; height: 8px; border-radius: 9999px; background: ${color}; flex-shrink: 0;"></span>`
    : '';
  return `<div style="display: flex; align-items: center; gap: 6px; color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">${dot}${label}</div>`;
}

/** The muted hint at the top of a pinned tooltip, such as "Click elsewhere to dismiss". */
export function chartTooltipDismiss(text: string): string {
  return `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px;">${text}</div>`;
}

export interface ChartHoverCardMetric {
  value: string;
  label: string;
}

export interface ChartHoverCardContent {
  title: string;
  subtitle?: string;
  color?: string;
  metrics: ChartHoverCardMetric[];
  summary?: string;
  warning?: string;
  body?: string;
}

/** Compact hover card. Title, subtitle, labels, summary and warning are escaped here. Metric values and body are inserted raw. */
export function chartHoverCard(
  { title, subtitle, color, metrics, summary, warning, body }: ChartHoverCardContent,
  options: ChartTooltipShellOptions = {},
): string {
  const values = metrics
    .map(
      (m) =>
        `<div style="min-width: 0;"><div style="font-size: 16px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--foreground);">${m.value}</div><div style="font-size: 11px; line-height: 14px; color: var(--muted-foreground);">${escapeHtml(m.label)}</div></div>`,
    )
    .join('');
  const heading = subtitle
    ? `<span style="min-width: 0;">${escapeHtml(title)} <span style="font-weight: 400; color: var(--muted-foreground);">${escapeHtml(subtitle)}</span></span>`
    : escapeHtml(title);
  return chartTooltipShell(
    `${warning ? `<div style="color: #dc2626; font-size: 11px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(warning)}</div>` : ''}${chartTooltipTitle(heading, color)}${values ? `<div style="display: flex; flex-wrap: wrap; gap: 4px 20px;">${values}</div>` : ''}${body ? `<div style="margin-top: 6px;">${body}</div>` : ''}${summary ? `<div style="margin-top: 6px; font-size: 11px; line-height: 14px; color: var(--muted-foreground); font-variant-numeric: tabular-nums;">${escapeHtml(summary)}</div>` : ''}`,
    { maxWidth: 280, ...options },
  );
}

export const axisLabelUnit = (label: string): string => {
  const unit = /[(（](?<unit>[^()（）]+)[)）]\s*$/u.exec(label)?.groups?.unit;
  if (!unit) return label;
  const qualifier = /^\s*(?<q>[Pp]\d{1,3}(?:\.\d+)?|Median|Mean|中位数|平均)(?![A-Za-z0-9.])/u.exec(
    label,
  )?.groups?.q;
  return qualifier ? `${qualifier} ${unit}` : unit;
};
