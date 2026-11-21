import * as d3 from 'd3';

import { track } from '@/lib/analytics/analytics';
import { CHART_TYPE, px } from '@/lib/d3-chart/typography';

import { clampPowerXCompareAt } from './powerx-compare-at';

/**
 * The Compare-at reading line on the Energy and Power scatter: a thin orange rule at the
 * Compare at interactivity with a small grip at the top. Dragging the grip (or the rule)
 * moves the line live and sets Compare at (`i_at`) on release.
 */

type Scale = d3.ScaleContinuousNumeric<number, number>;

export interface PowerXReading {
  at: number;
  set: ((value: number | null) => void) | null;
}

export interface PowerXReadingLineOptions {
  xScale: Scale;
  width: number;
  height: number;
  reading: { readonly current: PowerXReading };
  /** The tag shown while hovering or dragging, e.g. "80 tok/s/user". */
  tag: (at: number) => string;
}

interface ReadingLineNode extends SVGGElement {
  __powerxAt?: { xScale: Scale; width: number; dragAt: number | null; hover: boolean };
}

const AT_COLOR = 'var(--color-powerx-at, #e8900c)';

export function drawPowerXReadingLine(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  { xScale, width, height, reading, tag }: PowerXReadingLineOptions,
): void {
  let root = zoomGroup.select<SVGGElement>('g.powerx-at-line');
  if (root.empty()) root = createReadingLine(zoomGroup, reading, tag);
  const node = root.node() as ReadingLineNode;
  const state = node.__powerxAt ?? { xScale, width, dragAt: null, hover: false };
  state.xScale = xScale;
  state.width = width;
  node.__powerxAt = state;
  root.select('line.powerx-at-rule').attr('y1', 0).attr('y2', height);
  root.select('rect.powerx-at-hit').attr('y', 0).attr('height', height);
  if (state.dragAt === null) placeReadingLine(root, xScale, width, reading.current.at, tag);
  root.raise();
}

function placeReadingLine(
  root: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: Scale,
  width: number,
  at: number,
  tag: (at: number) => string,
) {
  const x = xScale(at);
  const inside = Number.isFinite(x) && x >= 0 && x <= width;
  root
    .attr('transform', `translate(${inside ? x : 0},0)`)
    .attr('display', inside ? null : 'none')
    .attr('data-at', at);
  const label = root.select<SVGTextElement>('text.powerx-at-tag').text(tag(at));
  // Keep the tag inside the plot: flip it to the left of the line near the right edge.
  const flip = x + 8 + (label.node()?.getComputedTextLength?.() ?? 0) > width;
  label.attr('x', flip ? -8 : 8).attr('text-anchor', flip ? 'end' : 'start');
}

function createReadingLine(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  reading: { readonly current: PowerXReading },
  tag: (at: number) => string,
) {
  const root = zoomGroup
    .append('g')
    .attr('class', 'powerx-at-line')
    .attr('data-testid', 'powerx-at-line')
    .style('cursor', 'ew-resize');
  root
    .append('rect')
    .attr('class', 'powerx-at-hit')
    .attr('x', -10)
    .attr('width', 20)
    .attr('fill', 'transparent');
  root
    .append('line')
    .attr('class', 'powerx-at-rule')
    .attr('stroke', AT_COLOR)
    .attr('stroke-width', 1.25)
    .attr('pointer-events', 'none');
  const grip = root
    .append('g')
    .attr('class', 'powerx-at-grip')
    .attr('data-testid', 'powerx-at-grip');
  grip
    .append('rect')
    .attr('x', -5)
    .attr('y', 0)
    .attr('width', 10)
    .attr('height', 18)
    .attr('rx', 3)
    .attr('fill', AT_COLOR);
  for (const x of [-1.5, 1.5]) {
    grip
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', 5)
      .attr('y2', 13)
      .attr('stroke', 'rgb(255 255 255 / 0.85)')
      .attr('stroke-width', 1);
  }
  root
    .append('text')
    .attr('class', 'powerx-at-tag')
    .attr('data-testid', 'powerx-at-tag')
    .attr('y', 13)
    .attr('fill', 'var(--foreground)')
    .attr('stroke', 'var(--background)')
    .attr('stroke-width', 4)
    .attr('stroke-linejoin', 'round')
    .attr('paint-order', 'stroke')
    .attr('pointer-events', 'none')
    .attr('opacity', 0)
    .style('font-size', px(CHART_TYPE.annotation))
    .style('font-weight', 600);

  const node = root.node() as ReadingLineNode;
  const showTag = (shown: boolean) =>
    root.select('text.powerx-at-tag').attr('opacity', shown ? 1 : 0);
  root
    .on('mouseenter.powerxAt', () => {
      if (node.__powerxAt) node.__powerxAt.hover = true;
      showTag(true);
    })
    .on('mouseleave.powerxAt', () => {
      if (!node.__powerxAt) return;
      node.__powerxAt.hover = false;
      if (node.__powerxAt.dragAt === null) showTag(false);
    })
    // A finger on the line drags it; it must not also start the touch scrub.
    .on('pointerdown.powerxAt', (event: PointerEvent) => event.stopPropagation());

  const atFor = (eventX: number) => {
    const state = node.__powerxAt!;
    const x = Math.max(0, Math.min(state.width, eventX));
    return clampPowerXCompareAt(state.xScale.invert(x));
  };
  root.call(
    d3
      .drag<SVGGElement, unknown>()
      .on('start', (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
        const state = node.__powerxAt;
        if (!state) return;
        state.dragAt = atFor(event.x);
        showTag(true);
      })
      .on('drag', (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
        const state = node.__powerxAt;
        if (!state) return;
        state.dragAt = atFor(event.x);
        placeReadingLine(root, state.xScale, state.width, state.dragAt, tag);
      })
      .on('end', () => {
        const state = node.__powerxAt;
        if (!state) return;
        const at = state.dragAt;
        state.dragAt = null;
        if (!state.hover) showTag(false);
        if (at === null || at === reading.current.at) {
          placeReadingLine(root, state.xScale, state.width, reading.current.at, tag);
          return;
        }
        reading.current.set?.(at);
        track('powerx_compare_at_changed', { at, how: 'drag', source: 'chart' });
      }),
  );
  return root;
}
