// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { plotBounds, plotClipSize } from './plot-bounds';

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
const CLIP_ID = 'clip-scatter-graph';

function renderChartSvg({
  box = { left: 100, top: 200, width: 800, height: 600 },
  transform = 'translate(60,24)' as string | null,
  clip = { width: 730, height: 516 } as { width: number; height: number } | null,
  /** A same-SVG clipPath belonging to something else (overflow continuations). */
  decoyClip = false,
} = {}): Element {
  const svg = svgEl('svg');
  stubBox(svg, box.left, box.top, box.width, box.height);

  const defs = svgEl('defs');
  if (decoyClip) {
    const other = svgEl('clipPath');
    other.setAttribute('id', 'some-other-clip');
    const otherRect = svgEl('rect');
    otherRect.setAttribute('width', '1');
    otherRect.setAttribute('height', '1');
    other.append(otherRect);
    defs.append(other);
  }
  if (clip) {
    const clipPath = svgEl('clipPath');
    clipPath.setAttribute('id', CLIP_ID);
    const rect = svgEl('rect');
    rect.setAttribute('width', String(clip.width));
    rect.setAttribute('height', String(clip.height));
    clipPath.append(rect);
    defs.append(clipPath);
  }
  svg.append(defs);

  const root = svgEl('g');
  root.setAttribute('class', 'chart-root');
  if (transform !== null) root.setAttribute('transform', transform);
  const zoomGroup = svgEl('g');
  zoomGroup.setAttribute('class', 'zoom-group');
  if (clip) zoomGroup.setAttribute('clip-path', `url(#${CLIP_ID})`);
  root.append(zoomGroup);
  svg.append(root);

  document.body.append(svg);
  return svg;
}

afterEach(() => {
  document.body.innerHTML = '';
});

const zoomGroupOf = (svg: Element) => svg.querySelector('.zoom-group')!;

describe('plotClipSize', () => {
  it('returns the clip rect size in zoom-group units', () => {
    expect(plotClipSize(zoomGroupOf(renderChartSvg()))).toEqual({ width: 730, height: 516 });
  });

  it('finds the owning SVG through the zoom group when none is passed', () => {
    const svg = renderChartSvg({ decoyClip: true });
    expect(plotClipSize(zoomGroupOf(svg))).toEqual({ width: 730, height: 516 });
  });

  it('returns null when the group is not clipped', () => {
    expect(plotClipSize(zoomGroupOf(renderChartSvg({ clip: null })))).toBeNull();
  });

  it('returns null when the referenced clipPath is missing', () => {
    const svg = renderChartSvg();
    svg.querySelector(`#${CLIP_ID}`)!.remove();
    expect(plotClipSize(zoomGroupOf(svg))).toBeNull();
  });

  it('returns null for a degenerate clip rect', () => {
    const svg = renderChartSvg({ clip: { width: 730, height: 0 } });
    expect(plotClipSize(zoomGroupOf(svg))).toBeNull();
  });

  it('returns null for a detached group with no owner SVG', () => {
    const group = svgEl('g');
    group.setAttribute('clip-path', `url(#${CLIP_ID})`);
    expect(plotClipSize(group)).toBeNull();
  });
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

  it("resolves the chart's own clipPath, not whichever one comes first", () => {
    // The overflow-continuation layer defines a clipPath per group, so
    // "the first clipPath in the SVG" is not a safe assumption.
    const svg = renderChartSvg({ decoyClip: true });
    expect(plotBounds(svg)).toEqual({ left: 160, top: 224, right: 890, bottom: 740 });
  });

  it('returns null when the chart clips nothing', () => {
    // clipContent: false — no clip-path on the zoom group, so nothing is
    // painted away and the caller should fall back to the SVG box.
    expect(plotBounds(renderChartSvg({ clip: null }))).toBeNull();
  });

  it('returns null when the referenced clipPath is missing', () => {
    const svg = renderChartSvg();
    svg.querySelector('clipPath')!.remove();
    expect(plotBounds(svg)).toBeNull();
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
