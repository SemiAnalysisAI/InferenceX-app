// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  pillShiftIntoBounds,
  rectsStrictlyOverlap,
  renderLineLabels,
  updateRenderedLineLabels,
  verticalShiftIntoBounds,
  type LineLabelPlacement,
  type RectBounds,
} from './line-label-layer';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLOT = { width: 400, height: 300 };
const CLIP_ID = 'clip-test-chart';

/** Stubbed text metrics: 6px per character, 12px tall, centred on the baseline. */
const CHAR_WIDTH = 6;
const TEXT_HEIGHT = 12;

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

const placement = (
  key: string,
  x: number,
  y: number,
  label = key,
  visible = true,
): LineLabelPlacement => ({
  key,
  seriesId: key,
  label,
  color: '#0f0',
  x,
  y,
  visible,
});

/** The pill's `.ll-bg` box in zoom-group coordinates, as the clip path sees it. */
function pillBox(zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, key: string) {
  const node = zoomGroup.select<SVGGElement>(`.line-label[data-line-key="${key}"]`).node()!;
  const match = /translate\((?<tx>[^,]+),(?<ty>[^)]+)\)/u.exec(
    node.getAttribute('transform') ?? '',
  );
  const tx = Number(match!.groups!.tx);
  const ty = Number(match!.groups!.ty);
  const bg = node.querySelector('.ll-bg')!;
  const x = Number(bg.getAttribute('x'));
  const y = Number(bg.getAttribute('y'));
  const width = Number(bg.getAttribute('width'));
  const height = Number(bg.getAttribute('height'));
  return { left: tx + x, top: ty + y, right: tx + x + width, bottom: ty + y + height, tx, ty };
}

const overlaps = (a: RectBounds, b: RectBounds) => rectsStrictlyOverlap(a, b);

/** Add a parallelism chip the way the roofline layer draws one, centred on (x, y). */
function addParallelismChip(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  x: number,
  y: number,
  width = 40,
  height = 16,
) {
  const chip = zoomGroup
    .append('g')
    .attr('class', 'parallelism-label')
    .attr('transform', `translate(${x},${y})`);
  chip
    .append('rect')
    .attr('class', 'pl-bg')
    .attr('x', -width / 2)
    .attr('y', -height / 2)
    .attr('width', width)
    .attr('height', height);
  return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
}

const expectInsidePlot = (box: ReturnType<typeof pillBox>) => {
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(PLOT.width);
  expect(box.bottom).toBeLessThanOrEqual(PLOT.height);
};

// jsdom has no layout engine; give every text a deterministic box derived
// from its content so the pill width tracks the label the way it does in a
// browser.
let originalGetBBox: PropertyDescriptor | undefined;
beforeEach(() => {
  originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value(this: SVGElement) {
      const x = Number(this.getAttribute('x') ?? 0);
      const width = (this.textContent ?? '').length * CHAR_WIDTH;
      return new DOMRect(x, -TEXT_HEIGHT / 2, width, TEXT_HEIGHT);
    },
  });
});
afterEach(() => {
  if (originalGetBBox) Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  else delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
});

describe('pill bounding box primitives', () => {
  const bounds = { left: 0, top: 0, right: 400, bottom: 300 };

  it('needs no vertical shift when the rect already sits inside the plot', () => {
    expect(verticalShiftIntoBounds({ left: 0, right: 10, top: 40, bottom: 60 }, bounds)).toBe(0);
  });

  it('slides a rect that spills past the top edge back down', () => {
    expect(verticalShiftIntoBounds({ left: 0, right: 10, top: -8, bottom: 12 }, bounds)).toBe(8);
  });

  it('slides a rect that spills past the bottom edge back up', () => {
    expect(verticalShiftIntoBounds({ left: 0, right: 10, top: 290, bottom: 310 }, bounds)).toBe(
      -10,
    );
  });

  it('gives up on a rect taller than the plot', () => {
    expect(verticalShiftIntoBounds({ left: 0, right: 10, top: 0, bottom: 301 }, bounds)).toBeNull();
  });

  it('pins an oversized pill to the plot origin instead of leaving it half clipped', () => {
    expect(pillShiftIntoBounds({ left: 20, right: 520, top: 30, bottom: 50 }, bounds)).toEqual({
      x: -20,
      y: 0,
    });
  });

  it('does not count a shared edge as an overlap', () => {
    const upper = { left: 0, right: 80, top: 0, bottom: 18 };
    expect(rectsStrictlyOverlap(upper, { left: 0, right: 80, top: 18, bottom: 36 })).toBe(false);
    expect(rectsStrictlyOverlap(upper, { left: 0, right: 80, top: 17, bottom: 35 })).toBe(true);
  });
});

describe('clamped pills do not stack on their neighbours', () => {
  it('flips a pill below its anchor when the neighbour above was slid down onto it', () => {
    // Bugbot's case: `placeLineLabels` cleared these two anchors (they are
    // 26px apart, more than one collision height), but the top pill has to
    // slide 19px down to stay in the plot, which puts it on the second one.
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      [placement('top', 200, 4, 'GB200 (Dynamo)'), placement('next', 210, 30, 'B300 (vLLM)')],
      { seriesAttribute: 'data-hw-key' },
    );

    const top = pillBox(zoomGroup, 'top');
    const next = pillBox(zoomGroup, 'next');
    expect(top.top).toBe(0);
    expect(overlaps(top, next)).toBe(false);
    // The second pill kept its x and moved to the mirror slot below its anchor.
    expect(next.tx).toBe(218);
    expect(next.top).toBeGreaterThan(30);
    expectInsidePlot(top);
    expectInsidePlot(next);
  });

  it('moves a pill to the other side of its anchor when the row above and below are taken', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      [
        placement('a', 300, 4, 'GB200 (Dynamo)'),
        placement('b', 310, 30, 'B300 (vLLM)'),
        placement('c', 320, 56, 'MI355X (SGLang)'),
      ],
      { seriesAttribute: 'data-hw-key' },
    );

    const boxes = ['a', 'b', 'c'].map((key) => pillBox(zoomGroup, key));
    for (const box of boxes) expectInsidePlot(box);
    expect(overlaps(boxes[0], boxes[1])).toBe(false);
    expect(overlaps(boxes[1], boxes[2])).toBe(false);
    expect(overlaps(boxes[0], boxes[2])).toBe(false);
  });

  it('keeps pills off a parallelism chip that the clamp would slide them onto', () => {
    const { zoomGroup } = renderChart();
    const chip = addParallelismChip(zoomGroup, 240, 12);
    renderLineLabels(zoomGroup, [placement('top', 200, 4, 'GB200 (Dynamo)')], {
      seriesAttribute: 'data-hw-key',
    });

    const top = pillBox(zoomGroup, 'top');
    expect(overlaps(top, chip)).toBe(false);
    expectInsidePlot(top);
  });

  it('resolves the same stacking on the zoom path', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      [placement('top', 200, 150, 'GB200 (Dynamo)'), placement('next', 210, 176, 'B300 (vLLM)')],
      { seriesAttribute: 'data-hw-key' },
    );
    // Zoom drags both anchors to the top edge.
    updateRenderedLineLabels(zoomGroup, [
      placement('top', 200, 4, 'GB200 (Dynamo)'),
      placement('next', 210, 30, 'B300 (vLLM)'),
    ]);

    const top = pillBox(zoomGroup, 'top');
    const next = pillBox(zoomGroup, 'next');
    expect(top.top).toBe(0);
    expect(overlaps(top, next)).toBe(false);
    expectInsidePlot(top);
    expectInsidePlot(next);
  });

  it('leaves a hidden pill out of the collision pass', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      [
        placement('top', 200, 4, 'GB200 (Dynamo)', false),
        placement('next', 210, 30, 'B300 (vLLM)'),
      ],
      { seriesAttribute: 'data-hw-key' },
    );

    // Nothing visible sits above it, so the second pill keeps its default slot.
    const next = pillBox(zoomGroup, 'next');
    expect(next.tx).toBe(218);
    expect(next.ty).toBe(16);
  });
});

describe('line-label pills stay inside the plot bounding box', () => {
  it('leaves a pill with room at its anchor offset', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('mi355x', 200, 150, 'MI355X (SGLang)')], {
      seriesAttribute: 'data-hw-key',
    });

    const box = pillBox(zoomGroup, 'mi355x');
    expect(box.tx).toBe(208);
    expect(box.ty).toBe(136);
    expectInsidePlot(box);
  });

  it('slides a pill anchored on the last point of a line back from the right edge', () => {
    // The regression: a run whose label landed on its final point was drawn
    // with the pill's right half past the plot, where the clip path cut it to
    // "B300 (v".
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 390, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
    });

    const box = pillBox(zoomGroup, 'b300');
    expect(box.right).toBe(PLOT.width);
    expect(box.tx).toBeLessThan(398);
    expectInsidePlot(box);
  });

  it('slides a pill anchored near the top of the plot back down', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('gb200', 200, 4, 'GB200 (Dynamo)')], {
      seriesAttribute: 'data-hw-key',
    });

    const box = pillBox(zoomGroup, 'gb200');
    expect(box.top).toBe(0);
    expectInsidePlot(box);
  });

  it('accounts for the vendor icon chip when sizing the pill against the edge', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 390, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
      iconFor: () => ({ href: 'nvidia.svg', width: 14, height: 10 }),
    });

    const box = pillBox(zoomGroup, 'b300');
    expect(box.right).toBe(PLOT.width);
    expectInsidePlot(box);
  });

  it('keeps a pill inside the plot while a zoom drags its anchor past the edge', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
    });
    // A zoomed-in scale can push the anchor itself past the plot edge.
    updateRenderedLineLabels(zoomGroup, [placement('b300', 395, 310, 'B300 (vLLM)')]);

    const box = pillBox(zoomGroup, 'b300');
    expect(box.right).toBe(PLOT.width);
    expect(box.bottom).toBe(PLOT.height);
    expectInsidePlot(box);
  });

  it('uses the anchor offset unchanged when the chart clips nothing', () => {
    const { zoomGroup } = renderChart(false);
    renderLineLabels(zoomGroup, [placement('b300', 390, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
    });

    const box = pillBox(zoomGroup, 'b300');
    expect(box.tx).toBe(398);
    expect(box.ty).toBe(136);
  });

  it('honours an explicit bounds override', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 190, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
      bounds: { left: 0, top: 0, right: 200, bottom: 300 },
    });

    expect(pillBox(zoomGroup, 'b300').right).toBe(200);
  });
});
