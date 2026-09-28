// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it, vi } from 'vitest';

import {
  applyNormalState,
  getShapeConfig,
  normalStateAttrs,
  type ShapeKey,
} from '@/lib/chart-rendering';

import {
  computeTooltipPosition,
  invalidateTooltipGeometry,
  renderScatterPoints,
  syncPointLabel,
  syncPointShape,
  updateScatterPointsForDisplay,
} from './scatter-points';

interface TestPoint {
  hwKey: string;
  precision: string;
  x: number;
  y: number;
  tp: number;
}

const POINTS: TestPoint[] = [
  { hwKey: 'h100', precision: 'fp8', x: 10, y: 100, tp: 8 },
  { hwKey: 'h100', precision: 'fp4', x: 20, y: 200, tp: 8 },
  { hwKey: 'mi300x', precision: 'fp8', x: 30, y: 300, tp: 4 },
];

function makeZoomGroup() {
  const svg = d3.create('svg:svg');
  return svg.append('g') as d3.Selection<SVGGElement, unknown, null, undefined>;
}

const xScale = d3.scaleLinear().domain([0, 100]).range([0, 800]);
const yScale = d3.scaleLinear().domain([0, 400]).range([600, 0]);

const keyFn = (d: TestPoint) => `${d.hwKey}|${d.precision}`;

describe('renderScatterPoints with getShapeKey', () => {
  it('resolves shapes through the accessor', () => {
    const group = makeZoomGroup();
    renderScatterPoints(
      group,
      POINTS,
      xScale,
      yScale,
      {
        getColor: () => '#123456',
        getShapeKey: (d) => (d.precision === 'fp8' ? 'circle' : 'square'),
      },
      keyFn,
    );

    const shapes = group.selectAll<SVGElement, TestPoint>('.visible-shape').nodes();
    expect(shapes).toHaveLength(3);
    expect(shapes.map((n) => n.tagName.toLowerCase()).toSorted()).toEqual([
      'circle',
      'circle',
      'rect',
    ]);
    const fp4Shape = group
      .selectAll<SVGGElement, TestPoint>('.dot-group')
      .filter((d) => d.precision === 'fp4')
      .select<SVGElement>('.visible-shape');
    expect(fp4Shape.attr('data-shape-key')).toBe('square');
  });

  it('swaps shape elements in place when the accessor result changes', () => {
    const group = makeZoomGroup();
    // Single selected precision: everything is a circle.
    const shapeState: { fp4: ShapeKey } = { fp4: 'circle' };
    const config = {
      getColor: () => '#123456',
      getShapeKey: (d: TestPoint) => (d.precision === 'fp4' ? shapeState.fp4 : 'circle'),
    };

    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);
    expect(
      group
        .selectAll<SVGElement, TestPoint>('.visible-shape')
        .nodes()
        .every((n) => n.tagName.toLowerCase() === 'circle'),
    ).toBe(true);

    // Second precision selected: fp4 points become squares. Same config
    // object — the accessor reads current state, mirroring the ref-based
    // accessors ScatterGraph passes so a precision toggle doesn't have to
    // recreate the layer config.
    shapeState.fp4 = 'square';
    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);

    const dotGroups = group.selectAll<SVGGElement, TestPoint>('.dot-group');
    expect(dotGroups.size()).toBe(3); // reused, not recreated
    const fp4Shape = dotGroups
      .filter((d) => d.precision === 'fp4')
      .select<SVGElement>('.visible-shape');
    expect(fp4Shape.node()!.tagName.toLowerCase()).toBe('rect');
    expect(fp4Shape.attr('data-shape-key')).toBe('square');
  });

  it('falls back to selectedPrecisions ordering when no accessor is given', () => {
    const group = makeZoomGroup();
    renderScatterPoints(
      group,
      POINTS,
      xScale,
      yScale,
      {
        getColor: () => '#123456',
        selectedPrecisions: ['fp8', 'fp4'],
      },
      keyFn,
    );

    const byPrecision = (precision: string) =>
      group
        .selectAll<SVGGElement, TestPoint>('.dot-group')
        .filter((d) => d.precision === precision)
        .select<SVGElement>('.visible-shape')
        .attr('data-shape-key');
    expect(byPrecision('fp8')).toBe('circle');
    expect(byPrecision('fp4')).toBe('square');
  });
});

describe('syncPointShape', () => {
  function makeDotGroup() {
    const group = makeZoomGroup();
    return group.append('g').attr('class', 'dot-group') as d3.Selection<
      SVGGElement,
      unknown,
      null,
      undefined
    >;
  }

  it('creates the shape element when missing', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const shape = g.select<SVGElement>('.visible-shape');
    expect(shape.empty()).toBe(false);
    expect(shape.node()!.tagName.toLowerCase()).toBe('circle');
    expect(shape.attr('fill')).toBe('#ff0000');
    expect(shape.attr('data-shape-key')).toBe('circle');
  });

  it('updates fill in place when the shape type is unchanged', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const node = g.select<SVGElement>('.visible-shape').node();

    syncPointShape(g, 'circle', '#00ff00');
    const shape = g.select<SVGElement>('.visible-shape');
    expect(shape.node()).toBe(node); // same element, no swap
    expect(shape.attr('fill')).toBe('#00ff00');
  });

  it('swaps the element when the shape type changes', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const before = g.select<SVGElement>('.visible-shape').node();

    syncPointShape(g, 'square', '#ff0000');
    const after = g.select<SVGElement>('.visible-shape');
    expect(after.node()).not.toBe(before);
    expect(after.node()!.tagName.toLowerCase()).toBe('rect');
    expect(after.attr('data-shape-key')).toBe('square');
    // Only one visible shape remains.
    expect(g.selectAll('.visible-shape').size()).toBe(1);
  });
});

describe('computeTooltipPosition', () => {
  it('caches same-frame geometry and invalidates it by frame and content lifecycle', () => {
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback;
        return 1;
      }),
    );

    const tooltipNode = document.createElement('div');
    const tooltipBounds = vi.fn(() => ({
      width: 100,
      height: 80,
      left: 0,
      top: 0,
      right: 100,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    Object.defineProperty(tooltipNode, 'getBoundingClientRect', { value: tooltipBounds });

    const container = document.createElement('div');
    const containerBounds = vi.fn(() => ({
      width: 800,
      height: 600,
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    }));
    const clientWidthRead = vi.fn(() => 800);
    const clientHeightRead = vi.fn(() => 600);
    Object.defineProperties(container, {
      clientWidth: { get: clientWidthRead },
      clientHeight: { get: clientHeightRead },
      getBoundingClientRect: { value: containerBounds },
    });

    const tooltip = d3.select(tooltipNode);
    computeTooltipPosition(20, 30, tooltip, container);
    tooltipNode.style.left = '120px';
    computeTooltipPosition(25, 35, tooltip, container);

    expect(containerBounds).toHaveBeenCalledTimes(1);
    expect(clientWidthRead).toHaveBeenCalledTimes(1);
    expect(clientHeightRead).toHaveBeenCalledTimes(1);
    expect(tooltipBounds).toHaveBeenCalledTimes(1);

    nextFrame!(0);
    computeTooltipPosition(30, 40, tooltip, container);
    expect(containerBounds).toHaveBeenCalledTimes(2);
    expect(tooltipBounds).toHaveBeenCalledTimes(2);

    tooltipNode.innerHTML = '<strong>updated content</strong>';
    invalidateTooltipGeometry(tooltipNode);
    computeTooltipPosition(35, 45, tooltip, container);
    expect(containerBounds).toHaveBeenCalledTimes(2);
    expect(tooltipBounds).toHaveBeenCalledTimes(3);

    tooltipNode.style.width = '200px';
    computeTooltipPosition(40, 50, tooltip, container);
    expect(tooltipBounds).toHaveBeenCalledTimes(4);
    nextFrame!(16);
    vi.unstubAllGlobals();
  });

  it('keeps a tall pinned tooltip inside the visible viewport', () => {
    const tooltipNode = document.createElement('div');
    document.body.append(tooltipNode);
    Object.defineProperty(tooltipNode, 'getBoundingClientRect', {
      value: () => ({
        width: 300,
        height: 400,
        left: 0,
        top: 0,
        right: 300,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
      getBoundingClientRect: {
        value: () => ({
          width: 800,
          height: 600,
          left: 100,
          top: 600,
          right: 900,
          bottom: 1200,
          x: 100,
          y: 600,
          toJSON: () => ({}),
        }),
      },
    });
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 1280 },
      clientHeight: { configurable: true, value: 720 },
    });

    expect(computeTooltipPosition(450, 100, d3.select(tooltipNode), container)).toEqual({
      left: 560,
      top: 316,
    });
  });
});

/** Attribute, style, and text records a MutationObserver sees while `run` executes. */
function recordMutations(root: Node, run: () => void): string[] {
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
  run();
  const records = observer.takeRecords();
  observer.disconnect();
  return records.map((r) =>
    r.type === 'attributes' ? `${(r.target as Element).tagName}.${r.attributeName}` : r.type,
  );
}

describe('syncPointLabel', () => {
  function makePointGroup() {
    return makeZoomGroup().append('g').attr('class', 'dot-group').node()!;
  }

  it('creates the label with its tspans', () => {
    const group = makePointGroup();
    syncPointLabel(group, 'TP8\nEP4', '#fff', false);

    const label = group.querySelector('.point-label')!;
    expect(label.getAttribute('fill')).toBe('#fff');
    expect(label.getAttribute('text-anchor')).toBe('middle');
    expect((label as SVGTextElement).style.opacity).toBe('1');
    const tspans = [...label.querySelectorAll('tspan')];
    expect(tspans.map((t) => t.textContent)).toEqual(['TP8', 'EP4']);
    expect(tspans.map((t) => t.getAttribute('dy'))).toEqual([`${-(0.8 + 1.1)}em`, '1.1em']);
  });

  it('emits no mutation records when re-synced with the same state', () => {
    const group = makePointGroup();
    syncPointLabel(group, 'TP8\nEP4', '#fff', false);

    expect(recordMutations(group, () => syncPointLabel(group, 'TP8\nEP4', '#fff', false))).toEqual(
      [],
    );
  });

  it('writes only what changed', () => {
    const group = makePointGroup();
    syncPointLabel(group, 'TP8', '#fff', false);

    expect(recordMutations(group, () => syncPointLabel(group, 'TP4', '#fff', true))).toEqual([
      // display + opacity, then the tspan text node.
      'text.style',
      'text.style',
      'childList',
    ]);
    const label = group.querySelector<SVGTextElement>('.point-label')!;
    expect(label.style.display).toBe('none');
    expect(label.style.opacity).toBe('0');
    expect(label.textContent).toBe('TP4');
  });
});

describe('updateScatterPointsForDisplay', () => {
  const config = {
    getColor: (d: TestPoint) => (d.hwKey === 'h100' ? 'green' : 'red'),
    getOpacity: (d: TestPoint) => (d.hwKey === 'h100' ? 1 : 0.2),
    getPointerEvents: (d: TestPoint) => (d.hwKey === 'h100' ? 'auto' : 'none'),
    getLabelText: (d: TestPoint) => `TP${d.tp}`,
    foreground: '#fff',
  };

  it('emits no mutation records when the display state is unchanged', () => {
    const group = makeZoomGroup();
    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);
    updateScatterPointsForDisplay(group, config);

    expect(
      recordMutations(group.node()!, () => updateScatterPointsForDisplay(group, config)),
    ).toEqual([]);
  });

  it('still applies a changed display state', () => {
    const group = makeZoomGroup();
    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);
    updateScatterPointsForDisplay(group, config);

    updateScatterPointsForDisplay(group, {
      ...config,
      getOpacity: () => 0.2,
      getColor: () => 'blue',
      hideLabels: true,
    });

    const points = group.selectAll<SVGGElement, TestPoint>('.dot-group').nodes();
    expect(points.map((p) => p.style.opacity)).toEqual(['0.2', '0.2', '0.2']);
    expect(points.map((p) => p.querySelector('.visible-shape')!.getAttribute('fill'))).toEqual([
      'blue',
      'blue',
      'blue',
    ]);
    expect(
      points.map((p) => (p.querySelector('.point-label') as SVGTextElement).style.display),
    ).toEqual(['none', 'none', 'none']);
  });
});

describe('normalStateAttrs', () => {
  it.each(['circle', 'square', 'triangle', 'diamond'] as ShapeKey[])(
    'matches what applyNormalState writes for %s',
    (shapeKey) => {
      const element = document.createElementNS(
        'http://www.w3.org/2000/svg',
        getShapeConfig(shapeKey).type,
      ) as SVGCircleElement | SVGRectElement | SVGPathElement;
      applyNormalState(d3.select(element), shapeKey);
      const written = [...element.attributes].map((a) => [a.name, a.value]);
      expect(normalStateAttrs(shapeKey)).toEqual(written);
    },
  );
});
