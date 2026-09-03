// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import {
  avoidPointLabelCollisions,
  keepPointLabelsInPlot,
  placePointLabels,
  plotAreaBounds,
} from './line-label-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLOT = { width: 400, height: 300 };
const CLIP_ID = 'clip-test-chart';

/**
 * A chart skeleton shaped like `setupChartStructure` builds it: a clipPath
 * in <defs> sized to the plot and a `.zoom-group` that references it.
 */
function renderChart(clip = true) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);
  if (clip) {
    const clipPath = document.createElementNS(SVG_NS, 'clipPath');
    clipPath.setAttribute('id', CLIP_ID);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(PLOT.width));
    rect.setAttribute('height', String(PLOT.height));
    clipPath.append(rect);
    defs.append(clipPath);
  }
  const root = document.createElementNS(SVG_NS, 'g');
  root.setAttribute('class', 'chart-root');
  svg.append(root);
  const zoomGroupEl = document.createElementNS(SVG_NS, 'g');
  zoomGroupEl.setAttribute('class', 'zoom-group');
  if (clip) zoomGroupEl.setAttribute('clip-path', `url(#${CLIP_ID})`);
  root.append(zoomGroupEl);
  return { svg, zoomGroup: d3.select(zoomGroupEl) };
}

interface PointSpec {
  x: number;
  y: number;
  /** Label lines; each becomes a tspan. */
  lines?: string[];
  /** Stubbed text width so the test controls the collision box. */
  width?: number;
}

/** Add a `.dot-group` with a `.point-label`, mirroring `renderScatterPoints`. */
function addPoint(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  { x, y, lines = ['TP8'], width = 30 }: PointSpec,
) {
  const group = zoomGroup
    .append('g')
    .attr('class', 'dot-group')
    .attr('transform', `translate(${x},${y})`);
  const text = group.append('text').attr('class', 'point-label');
  text
    .selectAll('tspan')
    .data(lines)
    .join('tspan')
    .attr('x', 0)
    .attr('dy', (_line, index) => (index === 0 ? '-0.8em' : '1.1em'))
    .text((line) => line);
  // jsdom has no layout engine; give the label a deterministic box.
  Object.defineProperty(text.node()!, 'getBBox', {
    value: () => new DOMRect(-width / 2, -20, width, 12),
  });
  return text;
}

const firstDy = (text: d3.Selection<SVGTextElement, unknown, null, undefined>) =>
  Number.parseFloat(text.select('tspan').attr('dy'));
const tspanXs = (text: d3.Selection<SVGTextElement, unknown, null, undefined>) =>
  text
    .selectAll('tspan')
    .nodes()
    .map((node) => Number((node as SVGTSpanElement).getAttribute('x')));

describe('plotAreaBounds', () => {
  it('reads the plot rect the zoom group is clipped to', () => {
    const { zoomGroup } = renderChart();
    expect(plotAreaBounds(zoomGroup)).toEqual({ left: 0, top: 0, right: 400, bottom: 300 });
  });

  it('is null when the chart clips nothing', () => {
    const { zoomGroup } = renderChart(false);
    expect(plotAreaBounds(zoomGroup)).toBeNull();
  });
});

describe('point labels stay inside the plot bounding box', () => {
  it('keeps the default above-the-point slot for a label with room', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: 150 });

    placePointLabels(zoomGroup);

    expect(firstDy(label)).toBe(-8);
    expect(label.style('opacity')).toBe('1');
  });

  it('flips a label below its point when the default slot would cross the top edge', () => {
    // The regression: a Pareto-frontier point pinned at the very top of the
    // y-range put its label above itself, where the clip path sliced the
    // text in half.
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: 6, lines: ['5xDEP8+1xDEP16'], width: 90 });

    placePointLabels(zoomGroup);

    expect(firstDy(label)).toBe(14);
    expect(label.style('opacity')).toBe('1');
  });

  it('flips a label above its point when the below slot would cross the bottom edge', () => {
    const { zoomGroup } = renderChart();
    // A neighbour whose own label occupies this label's default (above)
    // slot, so the ladder has to move on to the next candidate.
    const blocker = addPoint(zoomGroup, { x: 200, y: 296 });
    const label = addPoint(zoomGroup, { x: 202, y: 292 });

    avoidPointLabelCollisions(zoomGroup);

    // The first-placed label keeps "above"; the second cannot use "above"
    // (collision) or "below" (its box would end at y=311, past the 300px
    // plot), so it takes the "further above" slot instead of spilling out.
    expect(firstDy(blocker)).toBe(-8);
    expect(firstDy(label)).toBe(-22);
    expect(label.style('opacity')).toBe('1');
  });

  it('slides a label at the right edge inward instead of letting it spill past', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 395, y: 150, lines: ['TP8', 'C=64'], width: 40 });

    placePointLabels(zoomGroup);

    // Box right = 395 + 20 + 2 padding = 417 → shift left by 17 so every
    // tspan (text-anchor: middle) is re-centred inside the plot.
    expect(tspanXs(label)).toEqual([-17, -17]);
    expect(label.style('opacity')).toBe('1');
  });

  it('slides a label at the left edge inward', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 4, y: 150, width: 40 });

    placePointLabels(zoomGroup);

    expect(tspanXs(label)).toEqual([18]);
  });

  it('hides a label that cannot fit inside the plot at any slot', () => {
    const { zoomGroup } = renderChart();
    // Wider than the whole plot: no horizontal shift can rescue it.
    const label = addPoint(zoomGroup, { x: 200, y: 150, width: 500 });

    placePointLabels(zoomGroup);

    expect(label.style('opacity')).toBe('0');
  });

  it('hides the label of a point zoomed outside the plot', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: -40 });

    placePointLabels(zoomGroup);

    expect(label.style('opacity')).toBe('0');
  });

  it('shows the label again once its point zooms back into the plot', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: -40 });
    const group = zoomGroup.select<SVGGElement>('.dot-group');

    placePointLabels(zoomGroup);
    expect(label.style('opacity')).toBe('0');

    group.attr('transform', 'translate(200,150)');
    placePointLabels(zoomGroup);

    expect(label.style('opacity')).toBe('1');
    expect(firstDy(label)).toBe(-8);
  });

  it('leaves labels hidden for other reasons alone', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: 150 });
    label.style('opacity', 0);

    placePointLabels(zoomGroup);

    expect(label.style('opacity')).toBe('0');
  });

  it('resets a previous horizontal shift before laying out again', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 395, y: 150, width: 40 });
    const group = zoomGroup.select<SVGGElement>('.dot-group');

    keepPointLabelsInPlot(zoomGroup);
    expect(tspanXs(label)).toEqual([-17]);

    // Zoom moves the point back to the middle: the shift must not linger.
    group.attr('transform', 'translate(200,150)');
    keepPointLabelsInPlot(zoomGroup);
    expect(tspanXs(label)).toEqual([0]);
  });

  it('applies no constraint to charts that clip nothing', () => {
    const { zoomGroup } = renderChart(false);
    const label = addPoint(zoomGroup, { x: 200, y: 6 });

    placePointLabels(zoomGroup);

    expect(firstDy(label)).toBe(-8);
    expect(label.style('opacity')).toBe('1');
  });

  it('honours explicit bounds over the clip rect', () => {
    const { zoomGroup } = renderChart();
    const label = addPoint(zoomGroup, { x: 200, y: 150 });

    placePointLabels(zoomGroup, { bounds: { left: 0, top: 140, right: 400, bottom: 300 } });

    // Above (top = 150 - 8 - 9 - 2 = 131) breaches the tightened top edge.
    expect(firstDy(label)).toBe(14);
  });

  it('skips collision avoidance for keepPointLabelsInPlot', () => {
    const { zoomGroup } = renderChart();
    const first = addPoint(zoomGroup, { x: 200, y: 150 });
    const second = addPoint(zoomGroup, { x: 202, y: 150 });

    keepPointLabelsInPlot(zoomGroup);

    expect(firstDy(first)).toBe(-8);
    expect(firstDy(second)).toBe(-8);
  });
});
