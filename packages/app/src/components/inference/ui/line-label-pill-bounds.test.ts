// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  leastOverlapping,
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
  it('uses nearby rows when a dense cluster fills both mirrored positions', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      ['a', 'b', 'c', 'd', 'e'].map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );
    const boxes = ['a', 'b', 'c', 'd', 'e'].map((key) => pillBox(zoomGroup, key));
    for (const [index, box] of boxes.entries()) {
      expectInsidePlot(box);
      for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
    }
  });

  it('clears a cluster too dense for the nearest rows instead of stacking pills', () => {
    // Sixteen run names ending on the same spot, as at the bottom-right of a
    // dense agentic chart on a phone: the nearest three rows cannot hold them.
    const keys = Array.from({ length: 16 }, (_, index) => `series-${index}`);
    const { zoomGroup } = renderChart();
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );
    const boxes = keys.map((key) => pillBox(zoomGroup, key));
    for (const [index, box] of boxes.entries()) {
      expectInsidePlot(box);
      for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
    }
  });

  it('renders larger text and measures its pill before clamping on render and zoom', () => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value(this: SVGElement) {
        const fontSize = Number.parseFloat(this.getAttribute('font-size') ?? '0');
        return new DOMRect(
          0,
          -fontSize / 2,
          (this.textContent ?? '').length * fontSize * 0.6,
          fontSize,
        );
      },
    });
    const { zoomGroup } = renderChart();
    const label = placement('gpu', 395, 4, 'MI355X');
    renderLineLabels(zoomGroup, [label], { seriesAttribute: 'data-hw-key' });

    expect(zoomGroup.select('.ll-text').attr('font-size')).toBe('13px');
    expect(Number(zoomGroup.select('.ll-bg').attr('height'))).toBe(19);
    expect(Number(zoomGroup.select('.ll-bg').attr('width'))).toBeCloseTo(56.8);
    expectInsidePlot(pillBox(zoomGroup, 'gpu'));

    updateRenderedLineLabels(zoomGroup, [{ ...label, x: 398, y: 298 }]);
    expect(zoomGroup.select('.ll-text').attr('font-size')).toBe('13px');
    expectInsidePlot(pillBox(zoomGroup, 'gpu'));
  });

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

const leaderOf = (
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  key: string,
): SVGLineElement | null =>
  zoomGroup.select<SVGLineElement>(`.line-label[data-line-key="${key}"] .ll-leader`).node();
const isShown = (leader: SVGLineElement | null) =>
  leader !== null && leader.getAttribute('display') !== 'none';

/** The leader's two ends in zoom-group coordinates. */
function leaderEnds(zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, key: string) {
  const box = pillBox(zoomGroup, key);
  const leader = leaderOf(zoomGroup, key)!;
  const num = (name: string) => Number(leader.getAttribute(name));
  return {
    anchor: { x: box.tx + num('x1'), y: box.ty + num('y1') },
    edge: { x: box.tx + num('x2'), y: box.ty + num('y2') },
    box,
  };
}

describe('displaced pills keep a leader line to their anchor', () => {
  it('draws no leader for a pill sitting at its default spot', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('solo', 200, 150, 'B300 (vLLM)')], {
      seriesAttribute: 'data-hw-key',
    });
    expect(isShown(leaderOf(zoomGroup, 'solo'))).toBe(false);
  });

  it('ties a pill pushed off a crowded anchor back to the point it names', () => {
    const { zoomGroup } = renderChart();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );

    const led = keys.filter((key) => isShown(leaderOf(zoomGroup, key)));
    // The first pill keeps its default spot; the ones moved rows away do not.
    expect(led).not.toContain('a');
    expect(led.length).toBeGreaterThan(0);
    for (const key of led) {
      const { anchor, edge, box } = leaderEnds(zoomGroup, key);
      expect(anchor).toEqual({ x: 200, y: 150 });
      // The pill end lands on the pill's edge, not across its text.
      expect(edge.x).toBeGreaterThanOrEqual(box.left);
      expect(edge.x).toBeLessThanOrEqual(box.right);
      expect([box.top, box.bottom]).toContain(edge.y);
      expect(leaderOf(zoomGroup, key)!.getAttribute('stroke')).toBe('#0f0');
      // Drawn behind the pill background.
      expect(leaderOf(zoomGroup, key)!.nextElementSibling?.getAttribute('class')).toBe('ll-bg');
    }
  });

  it('hides the leader again once a zoom gives the pill its default spot back', () => {
    const { zoomGroup } = renderChart();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );
    expect(keys.some((key) => isShown(leaderOf(zoomGroup, key)))).toBe(true);

    // Zooming in spreads the anchors far enough apart that every pill fits
    // at its default spot again.
    updateRenderedLineLabels(
      zoomGroup,
      keys.map((key, index) => placement(key, 40 + index * 10, 30 + index * 50, 'MI355X (SGLang)')),
    );
    expect(keys.filter((key) => isShown(leaderOf(zoomGroup, key)))).toEqual([]);
  });

  it('hides the leader of a hidden pill', () => {
    const { zoomGroup } = renderChart();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );
    const led = keys.filter((key) => isShown(leaderOf(zoomGroup, key)));
    expect(led.length).toBeGreaterThan(0);

    updateRenderedLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)', !led.includes(key))),
    );
    for (const key of led) expect(isShown(leaderOf(zoomGroup, key))).toBe(false);
  });
});

const box = (left: number, top: number, width = 20, height = 10): RectBounds => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('leastOverlapping', () => {
  it('picks the slot that covers the least of the placed pills, not the first', () => {
    const placed = [box(0, 0), box(100, 0)];
    const onTop = { box: box(0, 0), id: 'default' };
    const grazing = { box: box(18, 0), id: 'grazing' };
    const half = { box: box(10, 0), id: 'half' };
    expect(leastOverlapping([onTop, half, grazing], placed).id).toBe('grazing');
  });

  it('keeps the earlier candidate on a tie', () => {
    const placed = [box(0, 0)];
    const first = { box: box(10, 0), id: 'first' };
    const second = { box: box(-10, 0), id: 'second' };
    expect(leastOverlapping([first, second], placed).id).toBe('first');
  });
});

describe("appearance: 'text'", () => {
  it('draws the run name in the series colour with a halo and no filled box or logo', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b200', 200, 150, 'B200 (SGLang)')], {
      seriesAttribute: 'data-hw-key',
      appearance: 'text',
      halo: '#131416',
      iconFor: () => ({ href: 'data:image/svg+xml,', width: 12, height: 12 }),
    });
    const group = zoomGroup.select('.line-label[data-line-key="b200"]');
    expect(group.select('.ll-bg').attr('fill')).toBe('transparent');
    const text = group.select<SVGTextElement>('.ll-text').node()!;
    expect(text.style.fill).toBe('rgb(0, 255, 0)');
    expect(text.style.stroke).toBe('rgb(19, 20, 22)');
    expect(text.style.paintOrder).toBe('stroke');
    expect(group.selectAll('.ll-logo').size()).toBe(0);
    // The transparent box is still the label's footprint for layout.
    expect(Number(group.select('.ll-bg').attr('width'))).toBeGreaterThan(0);
  });

  it('keeps the filled pill by default', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b200', 200, 150, 'B200 (SGLang)')], {
      seriesAttribute: 'data-hw-key',
    });
    expect(zoomGroup.select('.line-label .ll-bg').attr('fill')).toBe('#0f0');
  });
});
