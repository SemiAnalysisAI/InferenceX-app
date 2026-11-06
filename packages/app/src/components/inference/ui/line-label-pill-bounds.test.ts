// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  fitPillSegments,
  pillShiftIntoBounds,
  pillWidthBudget,
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

const CHAR_WIDTH = 6;
const TEXT_HEIGHT = 12;

function renderChart(clip = true, plot = PLOT) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);
  if (clip) {
    const clipPath = document.createElementNS(SVG_NS, 'clipPath');
    clipPath.setAttribute('id', CLIP_ID);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(plot.width));
    rect.setAttribute('height', String(plot.height));
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

  it('hides lower-priority pills that still collide after every nudge', () => {
    const { zoomGroup } = renderChart();
    const keys = Array.from({ length: 80 }, (_, index) => `s${index}`);
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'MI355X (SGLang)')),
      { seriesAttribute: 'data-hw-key' },
    );
    const nodes = keys.map((key) =>
      zoomGroup.select<SVGGElement>(`.line-label[data-line-key="${key}"]`).node()!,
    );
    const shown = keys.filter((_, index) => nodes[index].style.opacity !== '0');
    expect(shown.length).toBeLessThan(keys.length);
    expect(nodes[0].style.opacity).not.toBe('0');
    expect(nodes.at(-1)!.dataset.visible).toBe('0');
    const boxes = shown.map((key) => pillBox(zoomGroup, key));
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false);
    }
  });

  it('keeps only the top few pills on a narrow plot and all of them on a wider one', () => {
    const labels = ['a', 'b', 'c', 'd', 'e'].map((key, index) =>
      placement(key, 20, 20 + index * 70, 'B200'),
    );
    const visibleKeys = (plot: { width: number; height: number }) => {
      const { zoomGroup } = renderChart(true, plot);
      renderLineLabels(zoomGroup, labels, { seriesAttribute: 'data-hw-key' });
      return zoomGroup
        .selectAll<SVGGElement, unknown>('.line-label')
        .nodes()
        .filter((node) => node.style.opacity !== '0')
        .map((node) => node.dataset.lineKey);
    };
    expect(visibleKeys({ width: 280, height: 400 })).toEqual(['a', 'b', 'c']);
    expect(visibleKeys({ width: 400, height: 400 })).toEqual(['a', 'b', 'c', 'd', 'e']);
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

    const next = pillBox(zoomGroup, 'next');
    expect(next.tx).toBe(218);
    expect(next.ty).toBe(16);
  });

  it('draws a series-coloured leader only for a pill moved away from its anchor', () => {
    const { zoomGroup } = renderChart();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    renderLineLabels(
      zoomGroup,
      keys.map((key) => placement(key, 200, 150, 'B300 (vLLM)')),
      { seriesAttribute: 'data-hw-key' },
    );

    const leader = (key: string) =>
      zoomGroup.select<SVGLineElement>(`.line-label[data-line-key="${key}"] .ll-leader`);
    for (const key of keys.slice(0, 4)) expect(leader(key).attr('display')).toBe('none');
    const moved = leader('e');
    expect(moved.attr('display')).toBeNull();
    expect(moved.attr('stroke')).toBe('#0f0');
    const box = pillBox(zoomGroup, 'e');
    expect(box.tx + Number(moved.attr('x1'))).toBe(200);
    expect(box.ty + Number(moved.attr('y1'))).toBe(150);
    const endX = box.tx + Number(moved.attr('x2'));
    const endY = box.ty + Number(moved.attr('y2'));
    expect(endX).toBeGreaterThanOrEqual(box.left);
    expect(endX).toBeLessThanOrEqual(box.right);
    expect([box.top, box.bottom]).toContain(endY);

    updateRenderedLineLabels(zoomGroup, [placement('e', 200, 150, 'B300 (vLLM)')]);
    expect(leader('e').attr('display')).toBe('none');
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

const stripes = (top: number, bottom: number) =>
  Array.from({ length: Math.floor((bottom - top) / 10) + 1 }, (_, index) => ({
    key: `stripe-${index}`,
    points: [
      { x: 0, y: top + index * 10 },
      { x: 400, y: top + index * 10 },
    ],
  }));

describe('pills keep clear of other series', () => {
  const crossing = {
    key: 'other',
    points: [
      { x: 0, y: 136 },
      { x: 400, y: 136 },
    ],
  };

  it('moves off a line that its default slot would cover', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      seriesAttribute: 'data-hw-key',
      occluders: [crossing],
    });

    const box = pillBox(zoomGroup, 'b300');
    expect(box.ty).toBe(164);
    expect(box.top).toBeGreaterThan(136);
  });

  it('ignores its own series line', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      seriesAttribute: 'data-hw-key',
      occluders: [{ ...crossing, key: 'b300' }],
    });

    expect(pillBox(zoomGroup, 'b300').ty).toBe(136);
  });

  it('re-places on zoom with the projected lines', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      seriesAttribute: 'data-hw-key',
    });
    updateRenderedLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      occluders: [crossing],
    });

    expect(pillBox(zoomGroup, 'b300').ty).toBe(164);
  });

  it('moves into empty plot space with a leader when every nearby slot covers a line', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      seriesAttribute: 'data-hw-key',
      occluders: stripes(60, 240),
    });

    const box = pillBox(zoomGroup, 'b300');
    expect(box.bottom < 60 || box.top > 240).toBe(true);
    expect(zoomGroup.select('.line-label .ll-leader').attr('display')).toBeNull();
  });

  it('hides a pill when every slot covers another series', () => {
    const { zoomGroup } = renderChart();
    renderLineLabels(zoomGroup, [placement('b300', 200, 150, 'B300')], {
      seriesAttribute: 'data-hw-key',
      occluders: stripes(0, 300),
    });

    const node = zoomGroup.select<SVGGElement>('.line-label').node()!;
    expect(node.style.opacity).toBe('0');
    expect(node.dataset.visible).toBe('0');
  });
});

describe('phone pill width budget', () => {
  const measure = (text: string) => text.length * CHAR_WIDTH;
  const segments = [
    { className: 'll-gpu', text: 'GB300 NVL72', weight: '700' },
    { className: 'll-engine', text: ' (Dynamo vLLM)', weight: '400' },
  ];

  it('gives narrow plots a share of their width and wide plots no cap', () => {
    expect(pillWidthBudget(240)).toBeCloseTo(108);
    expect(pillWidthBudget(800)).toBe(Infinity);
  });

  it('keeps the chip name and ellipsizes the framework inside its bracket', () => {
    expect(fitPillSegments(segments, 120, measure).map((segment) => segment.text)).toEqual([
      'GB300 NVL72',
      ' (Dynam…)',
    ]);
  });

  it('drops the framework when not even one letter fits', () => {
    expect(fitPillSegments(segments, 70, measure).map((segment) => segment.text)).toEqual([
      'GB300 NVL72',
    ]);
  });

  it('leaves labels that fit untouched', () => {
    expect(fitPillSegments(segments, Infinity, measure)).toEqual(segments);
    expect(fitPillSegments(segments, 200, measure)).toEqual(segments);
  });
});
