// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { plotBounds } from './plot-bounds';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends string>(tag: K): Element {
  return document.createElementNS(SVG_NS, tag);
}

function stubBox(element: Element, left: number, top: number, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * The skeleton `setupChart` builds: a root group translated by the margins,
 * and a clip rect sized to the plot area inside them.
 */
function renderChartSvg({
  box = { left: 100, top: 200, width: 800, height: 600 },
  transform = 'translate(60,24)' as string | null,
  clip = { width: 730, height: 516 } as { width: number; height: number } | null,
} = {}): Element {
  const svg = svgEl('svg');
  stubBox(svg, box.left, box.top, box.width, box.height);

  if (clip) {
    const defs = svgEl('defs');
    const clipPath = svgEl('clipPath');
    const rect = svgEl('rect');
    rect.setAttribute('width', String(clip.width));
    rect.setAttribute('height', String(clip.height));
    clipPath.append(rect);
    defs.append(clipPath);
    svg.append(defs);
  }

  const root = svgEl('g');
  root.setAttribute('class', 'chart-root');
  if (transform !== null) root.setAttribute('transform', transform);
  svg.append(root);

  document.body.append(svg);
  return svg;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('plotBounds', () => {
  it('insets the SVG box by the chart margins', () => {
    // 60px left / 24px top margins are the inference scatter's axis gutters.
    const svg = renderChartSvg();

    expect(plotBounds(svg)).toEqual({
      left: 160,
      top: 224,
      right: 890,
      bottom: 740,
    });
  });

  it('is strictly smaller than the SVG box it is derived from', () => {
    const svg = renderChartSvg();
    const box = svg.getBoundingClientRect();
    const bounds = plotBounds(svg)!;

    expect(bounds.left).toBeGreaterThan(box.left);
    expect(bounds.top).toBeGreaterThan(box.top);
    expect(bounds.right).toBeLessThan(box.right);
    expect(bounds.bottom).toBeLessThan(box.bottom);
  });

  it('accepts a space-separated translate', () => {
    const svg = renderChartSvg({ transform: 'translate(60 24)' });
    expect(plotBounds(svg)?.left).toBe(160);
  });

  it('returns null when the chart clips nothing', () => {
    // clipContent: false — the caller should fall back to the SVG box, since
    // in that mode nothing is painted away.
    expect(plotBounds(renderChartSvg({ clip: null }))).toBeNull();
  });

  it('returns null before the skeleton has rendered', () => {
    const svg = svgEl('svg');
    stubBox(svg, 0, 0, 800, 600);
    expect(plotBounds(svg)).toBeNull();
  });

  it('returns null for a missing or unreadable transform', () => {
    expect(plotBounds(renderChartSvg({ transform: null }))).toBeNull();
    expect(plotBounds(renderChartSvg({ transform: 'scale(2)' }))).toBeNull();
  });

  it('returns null for a degenerate clip rect', () => {
    expect(plotBounds(renderChartSvg({ clip: { width: 0, height: 516 } }))).toBeNull();
  });
});
