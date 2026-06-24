/**
 * SVG renderer for known-issue warning annotations on the inference scatter
 * chart: a stacked column of warning boxes at the top of the plot, each with
 * an arrow pointing at its affected series. Drawn inside the chart SVG so PNG
 * exports carry the warnings; colors are passed in resolved because CSS
 * variables don't survive html-to-image.
 */

import type * as d3 from 'd3';

import type { KnownConfigIssue } from '@/lib/known-issues';

export interface KnownIssueAnnotation {
  issue: KnownConfigIssue;
  /** Display label of the affected series, e.g. "GB300 NVL72 (Dynamo TRTLLM, MTP)" */
  label: string;
  /** Resolved stroke color of the affected series */
  color: string;
  /** Data-space coordinates of the series' visible points (arrow targets) */
  points: { x: number; y: number }[];
}

export interface AnnotationRenderOptions {
  chartId: string;
  width: number;
  height: number;
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  annotations: KnownIssueAnnotation[];
  background: string;
  foreground: string;
  mutedForeground: string;
  /**
   * Horizontal space reserved at the plot's right edge (e.g. for a legend
   * panel floating over the SVG). Boxes right-align against it.
   */
  rightInset?: number;
  onLinkClick?: (annotation: KnownIssueAnnotation) => void;
}

const BOX_TOP = 8;
const BOX_GAP = 8;
const BOX_RIGHT_GAP = 10;
const PAD_X = 10;
const PAD_Y = 7;
const LINE1_SIZE = 11;
const LINE2_SIZE = 10;
const LINE1_H = 14;
const LINE2_H = 13;
const SWATCH_R = 4;
const SWATCH_SPACE = 14;
const ARROW_STANDOFF = 9;
const MIN_ARROW_LEN = 24;

/** getComputedTextLength with an estimate fallback for jsdom/test environments. */
function measureTextWidth(node: SVGTextElement | null, chars: number, fontSize: number): number {
  if (node && typeof node.getComputedTextLength === 'function') {
    try {
      const len = node.getComputedTextLength();
      if (Number.isFinite(len) && len > 0) return len;
    } catch {
      // fall through to estimate
    }
  }
  return chars * fontSize * 0.58;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Live overlap of the floating legend panel over the SVG's right edge, used
 * as `rightInset` so warning boxes sit beside the legend instead of under it.
 * Returns 0 when no legend is present (or outside the browser).
 */
export function measureLegendRightInset(
  chartId: string,
  svgNode: SVGSVGElement | null,
  marginLeft: number,
  width: number,
): number {
  if (!svgNode || typeof document === 'undefined') return 0;
  const legend = document.querySelector(`#${chartId} .legend-container`);
  if (!legend) return 0;
  const innerRight = svgNode.getBoundingClientRect().left + marginLeft + width;
  const overlap = innerRight - legend.getBoundingClientRect().left;
  return clamp(overlap, 0, width * 0.4);
}

export function renderKnownIssueAnnotations(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  opts: AnnotationRenderOptions,
): void {
  const { chartId, width, height, xScale, yScale, annotations } = opts;

  g.selectAll('.known-issue-annotations').remove();
  defs.selectAll(`[id^="known-issue-arrowhead-${chartId}"]`).remove();
  if (annotations.length === 0) return;

  const layer = g.append('g').attr('class', 'known-issue-annotations');
  const arrowGroup = layer.append('g').attr('class', 'known-issue-arrows');

  let yCursor = BOX_TOP;
  annotations.forEach((annotation, index) => {
    const { issue, label, color, points } = annotation;

    const markerId = `known-issue-arrowhead-${chartId}-${index}`;
    defs
      .append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8)
      .attr('refY', 5)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', color);

    const anchor = layer
      .append('a')
      .attr('href', issue.url)
      .attr('target', '_blank')
      .attr('rel', 'noopener noreferrer')
      .attr('class', 'known-issue-annotation')
      .attr('data-testid', 'known-issue-annotation')
      .attr('cursor', 'pointer')
      .on('click', () => opts.onLinkClick?.(annotation));

    const detail = `${issue.summary} — filed since ${issue.filed} · `;
    const text1 = anchor
      .append('text')
      .attr('font-size', LINE1_SIZE)
      .attr('font-weight', 600)
      .attr('fill', opts.foreground)
      .text(label);
    const text2 = anchor.append('text').attr('font-size', LINE2_SIZE);
    text2.append('tspan').attr('fill', opts.mutedForeground).text(detail);
    text2
      .append('tspan')
      .attr('fill', opts.foreground)
      .attr('text-decoration', 'underline')
      .text(issue.issueRef);

    const w1 = measureTextWidth(text1.node(), label.length, LINE1_SIZE) + SWATCH_SPACE;
    const w2 = measureTextWidth(text2.node(), detail.length + issue.issueRef.length, LINE2_SIZE);
    const boxW = Math.max(w1, w2) + PAD_X * 2;
    const boxH = PAD_Y * 2 + LINE1_H + LINE2_H;
    const boxRight = width - BOX_RIGHT_GAP - (opts.rightInset ?? 0);
    const bx = Math.max(2, boxRight - boxW);
    const by = yCursor;

    anchor
      .insert('rect', 'text')
      .attr('x', bx)
      .attr('y', by)
      .attr('width', boxW)
      .attr('height', boxH)
      .attr('rx', 6)
      .attr('fill', opts.background)
      .attr('fill-opacity', 0.95)
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 1.5);

    anchor
      .append('circle')
      .attr('cx', bx + PAD_X + SWATCH_R)
      .attr('cy', by + PAD_Y + LINE1_H / 2)
      .attr('r', SWATCH_R)
      .attr('fill', color);
    text1.attr('x', bx + PAD_X + SWATCH_SPACE).attr('y', by + PAD_Y + LINE1_H - 4);
    text2.attr('x', bx + PAD_X).attr('y', by + PAD_Y + LINE1_H + LINE2_H - 4);

    // Arrow from the box's bottom edge to the nearest on-screen point of the
    // affected series. Skipped when the series is panned/zoomed out of view or
    // the target sits right under the box.
    const bottomY = by + boxH;
    const onScreen = points
      .map((p) => ({ px: xScale(p.x), py: yScale(p.y) }))
      .filter((p) => p.px >= 0 && p.px <= width && p.py >= 0 && p.py <= height);
    if (onScreen.length > 0) {
      const target = onScreen.reduce((best, p) => {
        const startX = clamp(p.px, bx + 12, bx + boxW - 12);
        const bestStartX = clamp(best.px, bx + 12, bx + boxW - 12);
        const dist = Math.hypot(p.px - startX, p.py - bottomY);
        const bestDist = Math.hypot(best.px - bestStartX, best.py - bottomY);
        return dist < bestDist ? p : best;
      });
      const startX = clamp(target.px, bx + 12, bx + boxW - 12);
      const dx = target.px - startX;
      const dy = target.py - bottomY;
      const len = Math.hypot(dx, dy);
      if (len >= MIN_ARROW_LEN) {
        const endX = target.px - (dx / len) * ARROW_STANDOFF;
        const endY = target.py - (dy / len) * ARROW_STANDOFF;
        // Slight quadratic bend so stacked arrows don't read as one straight rule
        const midX = (startX + endX) / 2 + (dy > 0 ? -dx * 0.12 : dx * 0.12);
        const midY = (bottomY + endY) / 2;
        arrowGroup
          .append('path')
          .attr('class', 'known-issue-arrow')
          .attr('d', `M ${startX} ${bottomY + 2} Q ${midX} ${midY} ${endX} ${endY}`)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1.75)
          .attr('marker-end', `url(#${markerId})`)
          .attr('pointer-events', 'none');
      }
    }

    yCursor += boxH + BOX_GAP;
  });
}
