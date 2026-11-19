// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PointHitGrid, hitAreaPath } from './canvas-point-hit';
import { joinedDrawOrder } from './canvas-point-order';
import { CANVAS_POINT_LAYER_SELECTOR, canvasPointLayerOf } from './canvas-point-registry';
import { cssEase, ensureCanvasPointLayer, type PointPointerHandlers } from './canvas-points';
import {
  config,
  type Datum,
  identity,
  installFrames,
  installRecordingContext,
  key,
  mountLayer,
} from './canvas-points-test-utils';

// Layers schedule a draw on every change. A real jsdom frame from one test can fire in the next
// after Path2D is unstubbed, so every test queues frames by hand.
beforeEach(() => {
  installFrames();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function d3Order(previous: string[], next: string[]): string[] {
  const group = d3.create('svg:g');
  group
    .selectAll('g')
    .data(
      previous.map((id) => ({ id })),
      (d) => (d as { id: string }).id,
    )
    .enter()
    .append('g')
    .attr('data-id', (d) => d.id);
  const selection = group.selectAll<SVGGElement, { id: string }>('g').data(
    next.map((id, index) => ({ id, index })),
    (d) => d.id,
  );
  selection.exit().remove();
  selection
    .enter()
    .append('g')
    .attr('data-index', (d) => String(d.index));
  selection.attr('data-index', (d) => String(d.index));
  return group
    .selectAll<SVGGElement, unknown>('g')
    .nodes()
    .map((node) => node.dataset.index!);
}

describe('joinedDrawOrder', () => {
  it('matches the DOM order of a keyed d3 join, duplicates included', () => {
    const random = seeded(7);
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let round = 0; round < 300; round++) {
      const pick = () =>
        Array.from({ length: Math.floor(random() * 9) }, () => pool[Math.floor(random() * 8)]);
      const previous = pick();
      const next = pick();
      const expected = d3Order(previous, next);
      const { order } = joinedDrawOrder(previous, next);
      expect(order.map(String)).toEqual(expected);
    }
  });

  it('maps each kept position to the first previous node with its key', () => {
    const { order, previous } = joinedDrawOrder(['x', 'y', 'x'], ['y', 'x', 'x']);
    expect(order).toEqual([1, 0, 2]);
    expect([...previous]).toEqual([0, 1, -1]);
  });
});

describe('PointHitGrid', () => {
  it('returns the last drawn interactive point within the hit radius, like stacked SVG circles', () => {
    const random = seeded(11);
    const count = 400;
    const xs = Float64Array.from({ length: count }, () => random() * 220 - 10);
    const ys = Float64Array.from({ length: count }, () => random() * 120 - 10);
    const interactive = Uint8Array.from({ length: count }, () => (random() < 0.8 ? 1 : 0));
    const grid = new PointHitGrid(12);
    grid.build(xs, ys, interactive, count, 200, 100);
    for (let y = -3; y <= 103; y += 1.5) {
      for (let x = -3; x <= 203; x += 1.5) {
        let expected = -1;
        if (x >= 0 && x <= 200 && y >= 0 && y <= 100) {
          for (let index = 0; index < count; index++) {
            const dx = xs[index] - x;
            const dy = ys[index] - y;
            if (interactive[index] && dx * dx + dy * dy <= 144) expected = index;
          }
        }
        expect(grid.hit(x, y)).toBe(expected);
      }
    }
  });

  it('includes the exact hit-radius boundary', () => {
    const grid = new PointHitGrid(12);
    grid.build(Float64Array.of(50), Float64Array.of(50), Uint8Array.of(1), 1, 100, 100);
    expect(grid.hit(62, 50)).toBe(0);
    expect(grid.hit(62.001, 50)).toBe(-1);
  });
});

describe('hitAreaPath', () => {
  it('draws one hit circle per interactive point near the plot', () => {
    const path = hitAreaPath(
      Float64Array.of(10, 20, 500),
      Float64Array.of(10, 20, 10),
      Uint8Array.of(1, 0, 1),
      3,
      100,
      100,
      12,
    );
    expect(path).toBe('M-2,10a12,12 0 1,0 24,0a12,12 0 1,0 -24,0');
  });
});

describe('cssEase', () => {
  it('follows the CSS ease curve', () => {
    expect(cssEase(0)).toBe(0);
    expect(cssEase(1)).toBe(1);
    expect(cssEase(0.5)).toBeCloseTo(0.8024, 3);
    expect(cssEase(0.25)).toBeCloseTo(0.4085, 3);
  });
});

describe('CanvasPointLayer', () => {
  it('is found from its chart root and survives re-ensure', () => {
    const { svg, zoomGroup, layer } = mountLayer();
    expect(canvasPointLayerOf<Datum>(svg)).toBe(layer);
    expect(ensureCanvasPointLayer<Datum>(zoomGroup)).toBe(layer);
    expect(svg.querySelectorAll(CANVAS_POINT_LAYER_SELECTOR)).toHaveLength(1);
    svg.remove();
  });

  it('gives every node with a duplicated key the last datum on a metric update', () => {
    const { svg, layer } = mountLayer();
    layer.join(
      [
        { id: 'a', precision: 'fp8', x: 1, y: 1 },
        { id: 'a', precision: 'fp8', x: 2, y: 2 },
        { id: 'b', precision: 'fp8', x: 3, y: 3 },
      ],
      key,
      100,
      100,
    );
    layer.replaceData(
      [
        { id: 'a', precision: 'fp8', x: 10, y: 10 },
        { id: 'a', precision: 'fp8', x: 20, y: 20 },
        { id: 'b', precision: 'fp8', x: 30, y: 30 },
      ],
      key,
    );
    expect(layer.data.map((d) => d.x)).toEqual([20, 20, 30]);
    svg.remove();
  });

  it('bumps the join counter only when points enter', () => {
    const { svg, layer } = mountLayer();
    const points = [{ id: 'a', precision: 'fp8', x: 1, y: 1 }];
    layer.join(points, key, 100, 100);
    expect(layer.element.dataset.pointsJoined).toBe('1');
    layer.join(points, key, 100, 100);
    expect(layer.element.dataset.pointsJoined).toBe('1');
    layer.join([...points, { id: 'b', precision: 'fp8', x: 2, y: 2 }], key, 100, 100);
    expect(layer.element.dataset.pointsJoined).toBe('2');
    svg.remove();
  });

  it('dispatches enter, leave and click for the topmost point under the pointer', () => {
    const { svg, layer } = mountLayer();
    layer.join(
      [
        { id: 'a1', precision: 'fp8', x: 10, y: 10 },
        { id: 'b1', precision: 'fp8', x: 15, y: 10 },
        { id: 'a2', precision: 'fp8', x: 60, y: 60, visible: false },
      ],
      key,
      100,
      100,
    );
    layer.restyle(config);
    layer.place(identity, identity);
    const events: string[] = [];
    let accept = true;
    const handlers: PointPointerHandlers<Datum> = {
      enter: (_event, datum, position) => {
        events.push(`enter:${datum.id}@${position.x}`);
        return accept;
      },
      move: () => events.push('move'),
      leave: (_event, datum) => {
        events.push(`leave:${datum.id}`);
        return accept;
      },
      click: (_event, datum) => events.push(`click:${datum.id}`),
    };
    layer.listen(handlers);
    const hitArea = svg.querySelector('.dot-hit-area')!;
    const fire = (type: string, x: number, y: number) =>
      hitArea.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }));

    fire('mousemove', 1, 10);
    fire('mousemove', 12, 10);
    fire('mousemove', 26, 10);
    fire('mousemove', 60, 60);
    fire('click', 12, 10);
    fire('mouseleave', 60, 60);
    expect(events).toEqual([
      'enter:a1@10',
      'move',
      'leave:a1',
      'enter:b1@15',
      'move',
      'move',
      'leave:b1',
      'click:b1',
    ]);
    expect(layer.snapshot().some((entry) => entry.hovered)).toBe(false);

    fire('mousemove', 15, 10);
    expect(layer.snapshot().find((entry) => entry.hovered)?.key).toBe('b1');
    accept = false;
    fire('mouseleave', 40, 40);
    expect(layer.snapshot().find((entry) => entry.hovered)?.key).toBe('b1');
    layer.clearHover();
    expect(layer.snapshot().some((entry) => entry.hovered)).toBe(false);
    svg.remove();
  });

  it('keeps label placement when only legend emphasis changes', () => {
    const { svg, layer } = mountLayer();
    layer.join([{ id: 'a', precision: 'fp8', x: 10, y: 10 }], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    layer.setLabels((d) => d.id, 'black');
    const tspan = svg.querySelector('.point-label tspan')!;
    tspan.setAttribute('dy', '14px');
    layer.setOpacity(() => 0.15);
    expect(tspan.getAttribute('dy')).toBe('14px');
    expect(svg.querySelector<SVGGElement>('.point-label-anchor')!.style.opacity).toBe('0.15');
    layer.setOpacity(() => 0);
    expect(svg.querySelector('.point-label-anchor')).toBeNull();
    svg.remove();
  });

  it('orders export data like the live join', () => {
    const { svg, layer } = mountLayer();
    layer.join(
      ['c', 'a', 'b'].map((id) => ({ id, precision: 'fp8', x: 1, y: 1 })),
      key,
      100,
      100,
    );
    const next = ['a', 'b', 'd', 'c'].map((id) => ({ id, precision: 'fp8', x: 2, y: 2 }));
    expect(layer.orderedLike(next, key).map((d) => d.id)).toEqual(['d', 'c', 'a', 'b']);
    svg.remove();
  });

  it('animates moved visible points from their previous positions', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { svg, layer } = mountLayer();
    const points = [
      { id: 'a', precision: 'fp8', x: 10, y: 10 },
      { id: 'b', precision: 'fp8', x: 20, y: 20, visible: false },
    ];
    layer.join(points, key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    const before = layer.capturePositions();
    expect([...before.values()]).toEqual([{ x: 10, y: 10 }]);
    layer.replaceData(
      points.map((d) => ({ ...d, x: d.x + 5 })),
      key,
    );
    layer.place(identity, identity);
    layer.animateFrom(before, 300, null);
    const drawnX = () =>
      calls
        .splice(0)
        .filter((call) => call[0] === 'setTransform' && call[1] === 1 && call[5] !== 0)
        .map((call) => call[5]);
    calls.length = 0;
    frames.run(1000);
    expect(drawnX()).toEqual([10]);
    frames.run(1150);
    expect(drawnX()).toEqual([12.5]);
    frames.run(1300);
    expect(drawnX()).toEqual([15]);
    expect(frames.pending()).toBe(false);
    svg.remove();
  });

  it('draws fades and halos with group opacity semantics', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { svg, layer } = mountLayer();
    layer.join(
      [
        { id: 'a', precision: 'fp8', x: 10, y: 10 },
        { id: 'b', precision: 'fp8', x: 20, y: 20 },
      ],
      key,
      100,
      100,
    );
    layer.restyle({ ...config, getOpacity: () => 0.5 });
    layer.place(identity, identity);
    layer.setFade((d) => d.id === 'b');
    layer.setHalo((d) => (d.id === 'a' ? 'green' : null), {
      radius: 7.5,
      strokeWidth: 1.5,
      dash: [3, 2],
      opacity: 0.9,
    });
    frames.run(0);
    const alphas = calls.filter((call) => call[0] === 'set:globalAlpha').map((call) => call[1]);
    expect(alphas).toEqual([0.45, 0.5, 0.1, 1]);
    expect(calls.filter((call) => call[0] === 'set:strokeStyle')).toEqual([
      ['set:strokeStyle', 'green'],
    ]);
    expect(calls.filter((call) => call[0] === 'setLineDash')).toEqual([
      ['setLineDash', [3, 2]],
      ['setLineDash', []],
    ]);
    expect(calls.filter((call) => call[0] === 'set:fillStyle').map((call) => call[1])).toEqual([
      'red',
      'blue',
    ]);
    svg.remove();
  });

  it('fades opacity changes with the CSS ease curve once transitions are on', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { svg, layer } = mountLayer();
    layer.join([{ id: 'a', precision: 'fp8', x: 10, y: 10 }], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    layer.setOpacityTransition(150);
    layer.setOpacity(() => 0);
    calls.length = 0;
    frames.run(100);
    frames.run(175);
    frames.run(250);
    const alphas = calls
      .filter((call) => call[0] === 'set:globalAlpha' && call[1] !== 1)
      .map((call) => call[1]);
    expect(alphas).toHaveLength(1);
    expect(alphas[0]).toBeCloseTo(1 - cssEase(0.5), 6);
    expect(frames.pending()).toBe(false);
    svg.remove();
  });
});
