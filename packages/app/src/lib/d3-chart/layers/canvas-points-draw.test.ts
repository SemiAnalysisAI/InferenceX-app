// @vitest-environment jsdom
import { easeCubicInOut } from 'd3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ShapeKey } from '@/lib/charts/chart-rendering';

import { cssEase } from './canvas-points';
import {
  config,
  type Datum,
  identity,
  installFrames,
  installRecordingContext,
  key,
  mountLayer,
} from './canvas-points-test-utils';

const SHAPES: Record<string, ShapeKey> = { c: 'circle', s: 'square', t: 'triangle', d: 'diamond' };

const bezier = (t: number, p1: number, p2: number) =>
  3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;

const point = (id: string, x: number, y: number, visible?: boolean): Datum => ({
  id,
  precision: 'fp8',
  x,
  y,
  ...(visible === undefined ? {} : { visible }),
});

function drawnPositions(calls: unknown[][], ratio = 1): string[] {
  return calls
    .splice(0)
    .filter((call) => call[0] === 'setTransform' && call[1] === ratio && call[5] !== 0)
    .map((call) => `${Number(call[5]) / ratio},${Number(call[6]) / ratio}`);
}

function drawnAlphas(calls: unknown[][]): unknown[] {
  const drawn = calls.splice(0);
  return drawn
    .filter(
      (call, index) =>
        call[0] === 'set:globalAlpha' &&
        drawn[index - 1][0] === 'setTransform' &&
        drawn[index - 1][5] !== 0,
    )
    .map((call) => call[1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('CanvasPointLayer drawing', () => {
  it('records the exact draw calls for shapes, halos, fades, hover and the plot margin', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const frames = installFrames();
    const calls = installRecordingContext();
    const { svg, layer } = mountLayer();
    svg.querySelector('canvas')!.style.setProperty('--chart-c', ' teal ');
    layer.join(
      [
        point('c1', -32, 40),
        point('c2', -32.5, 40),
        point('s1', 132, -32),
        point('s2', 132.5, 40),
        point('t1', 50, 112),
        point('t2', 50, 112.5),
        point('d1', 50, -32.5),
        point('d2', 10, 20),
        point('c3', 30, 30, false),
        point('c4', 70, 60),
      ],
      key,
      100,
      80,
    );
    layer.restyle({
      getColor: (d) =>
        ({ c: 'var(--chart-c)', s: 'var(--missing, #123456)', t: 'var(--missing)' })[d.id[0]] ??
        'plum',
      getOpacity: (d) => (d.visible === false ? 0 : 0.8),
      getShapeKey: (d) => SHAPES[d.id[0]],
    });
    layer.place(identity, identity);
    layer.setFade((d) => d.id === 'd2');
    layer.setHalo((d) => ({ s1: 'var(--chart-c)', t1: 'orange' })[d.id] ?? null, {
      radius: 7.5,
      strokeWidth: 1.5,
      dash: [3, 2],
      opacity: 0.5,
    });
    layer.listen({ enter: () => true, move: () => {}, leave: () => true, click: () => {} });
    frames.run(0);
    svg
      .querySelector('.dot-hit-area')!
      .dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 60 }));
    frames.run(16);
    expect(calls.map((call) => JSON.stringify(call)).join('\n')).toMatchInlineSnapshot(`
      "["setTransform",1,0,0,1,0,0]
      ["clearRect",0,0,200,160]
      ["setTransform",2,0,0,2,-64,80]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","teal"]
      ["new Path2D"]
      ["fill",[["arc",0,0,3.5,0,6.283185307179586]]]
      ["setTransform",2,0,0,2,264,-64]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","#123456"]
      ["new Path2D"]
      ["fill",[["rect",-3.5,-3.5,7,7]]]
      ["set:globalAlpha",0.4]
      ["set:strokeStyle","teal"]
      ["set:lineWidth",1.5]
      ["setLineDash",[3,2]]
      ["beginPath"]
      ["arc",0,0,7.5,0,6.283185307179586]
      ["stroke"]
      ["setLineDash",[]]
      ["setTransform",2,0,0,2,100,224]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","var(--missing)"]
      ["new Path2D"]
      ["new Path2D","M 0 -2.8867513459481287 L 5 1.4433756729740643 L -5 1.4433756729740643 Z"]
      ["fill",[["addPath","M 0 -2.8867513459481287 L 5 1.4433756729740643 L -5 1.4433756729740643 Z"]]]
      ["set:globalAlpha",0.4]
      ["set:strokeStyle","orange"]
      ["set:lineWidth",1.5]
      ["setLineDash",[3,2]]
      ["beginPath"]
      ["arc",0,0,7.5,0,6.283185307179586]
      ["stroke"]
      ["setLineDash",[]]
      ["setTransform",2,0,0,2,20,40]
      ["set:globalAlpha",0.16000000000000003]
      ["set:fillStyle","plum"]
      ["new Path2D"]
      ["new Path2D","M 0 -5 L 5 0 L 0 5 L -5 0 Z"]
      ["fill",[["addPath","M 0 -5 L 5 0 L 0 5 L -5 0 Z"]]]
      ["setTransform",2,0,0,2,140,120]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","teal"]
      ["fill",[["arc",0,0,3.5,0,6.283185307179586]]]
      ["setTransform",1,0,0,1,0,0]
      ["set:globalAlpha",1]
      ["setTransform",1,0,0,1,0,0]
      ["clearRect",0,0,200,160]
      ["setTransform",2,0,0,2,-64,80]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","teal"]
      ["fill",[["arc",0,0,3.5,0,6.283185307179586]]]
      ["setTransform",2,0,0,2,264,-64]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","#123456"]
      ["fill",[["rect",-3.5,-3.5,7,7]]]
      ["set:globalAlpha",0.4]
      ["set:strokeStyle","teal"]
      ["set:lineWidth",1.5]
      ["setLineDash",[3,2]]
      ["beginPath"]
      ["arc",0,0,7.5,0,6.283185307179586]
      ["stroke"]
      ["setLineDash",[]]
      ["setTransform",2,0,0,2,100,224]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","var(--missing)"]
      ["fill",[["addPath","M 0 -2.8867513459481287 L 5 1.4433756729740643 L -5 1.4433756729740643 Z"]]]
      ["set:globalAlpha",0.4]
      ["set:strokeStyle","orange"]
      ["set:lineWidth",1.5]
      ["setLineDash",[3,2]]
      ["beginPath"]
      ["arc",0,0,7.5,0,6.283185307179586]
      ["stroke"]
      ["setLineDash",[]]
      ["setTransform",2,0,0,2,20,40]
      ["set:globalAlpha",0.16000000000000003]
      ["set:fillStyle","plum"]
      ["fill",[["addPath","M 0 -5 L 5 0 L 0 5 L -5 0 Z"]]]
      ["setTransform",2,0,0,2,140,120]
      ["set:globalAlpha",0.8]
      ["set:fillStyle","teal"]
      ["new Path2D"]
      ["fill",[["arc",0,0,6,0,6.283185307179586]]]
      ["setTransform",1,0,0,1,0,0]
      ["set:globalAlpha",1]"
    `);
  });

  it('draws the marker image instead of shapes once it has loaded, enlarged on hover', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { svg, layer } = mountLayer();
    layer.join([point('a', 10, 10), point('b', 40, 40)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    const marker = document.createElement('img');
    let complete = false;
    Object.defineProperty(marker, 'complete', { get: () => complete });
    layer.setMarker(marker);
    frames.run(0);
    expect(calls.some((call) => call[0] === 'drawImage')).toBe(false);
    expect(frames.pending()).toBe(false);
    complete = true;
    marker.dispatchEvent(new Event('load'));
    expect(frames.pending()).toBe(true);
    layer.listen({ enter: () => true, move: () => {}, leave: () => true, click: () => {} });
    svg
      .querySelector('.dot-hit-area')!
      .dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40 }));
    calls.length = 0;
    frames.run(16);
    expect(calls.filter((call) => call[0] === 'drawImage' || call[0] === 'fill')).toEqual([
      ['drawImage', marker, -10, -10, 20, 20],
      ['drawImage', marker, -11.5, -11.5, 23, 23],
    ]);
    const requests = frames.requests();
    layer.setMarker(marker);
    expect(frames.requests()).toBe(requests);
    layer.setMarker(null);
    calls.length = 0;
    frames.run(32);
    expect(calls.filter((call) => call[0] === 'drawImage')).toEqual([]);
    expect(calls.filter((call) => call[0] === 'fill')).toHaveLength(2);
  });

  it('sizes the canvas backing store by device pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { svg, layer } = mountLayer();
    layer.join([point('a', 1, 1)], key, 100.4, 80);
    const canvas = svg.querySelector('canvas')!;
    const foreignObject = svg.querySelector('foreignObject')!;
    expect([canvas.width, canvas.height]).toEqual([201, 160]);
    expect([canvas.style.width, canvas.style.height]).toEqual(['100.4px', '80px']);
    expect([foreignObject.getAttribute('width'), foreignObject.getAttribute('height')]).toEqual([
      '100.4',
      '80',
    ]);
    layer.join([point('a', 1, 1)], key, 50, 30);
    expect([canvas.width, canvas.height]).toEqual([100, 60]);
    vi.stubGlobal('devicePixelRatio', undefined);
    layer.join([point('a', 1, 1)], key, 50, 40);
    expect([canvas.width, canvas.height]).toEqual([50, 40]);
    layer.join([point('a', 1, 1)], key, 0, 0);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
  });

  it('draws a zero-size plot at unit scale', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const frames = installFrames();
    const calls = installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 3, 4)], key, 0, 0);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    expect(drawnPositions(calls)).toEqual(['3,4']);
  });

  it('schedules one frame for a burst of changes', () => {
    const frames = installFrames();
    installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    const before = frames.requests();
    layer.setFade(() => true);
    layer.setHalo(() => 'red', { radius: 1, strokeWidth: 1, dash: [], opacity: 1 });
    layer.setOpacity(() => 0.5);
    expect(frames.requests()).toBe(before + 1);
  });
});

describe('CanvasPointLayer position animation', () => {
  it('eases kept points along both axes and restarts cleanly for the next move', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { layer } = mountLayer();
    const render = (points: Datum[]) => {
      layer.join(points, key, 100, 100);
      layer.restyle(config);
      layer.place(identity, identity);
    };
    render([point('a', 10, 10), point('b', 20, 20)]);
    frames.run(0);
    let before = layer.capturePositions();
    render([point('a', 30, 10), point('b', 20, 40), point('c', 90, 90)]);
    frames.run(0);
    layer.animateFrom(before, 100, (d) => d.visible !== false);
    expect(frames.pending()).toBe(true);
    calls.length = 0;
    frames.run(0);
    expect(drawnPositions(calls)).toEqual(['10,10', '20,20', '90,90']);
    frames.run(50);
    expect(drawnPositions(calls)).toEqual(['20,10', '20,30', '90,90']);
    frames.run(100);
    expect(drawnPositions(calls)).toEqual(['30,10', '20,40', '90,90']);
    expect(frames.pending()).toBe(false);

    before = layer.capturePositions();
    render([point('a', 30, 10), point('b', 20, 60), point('c', 90, 90)]);
    layer.animateFrom(before, 100, null);
    calls.length = 0;
    frames.run(1000);
    frames.run(1025);
    expect(drawnPositions(calls)).toEqual([
      '30,10',
      '20,40',
      '90,90',
      '30,10',
      `20,${40 + 20 * easeCubicInOut(0.25)}`,
      '90,90',
    ]);

    render([point('a', 30, 10), point('b', 20, 60), point('c', 90, 90)]);
    frames.run(1050);
    expect(drawnPositions(calls)).toEqual(['30,10', '20,60', '90,90']);
    expect(frames.pending()).toBe(false);
  });

  it('stops an animation when points are placed again mid-flight', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    const before = layer.capturePositions();
    layer.replaceData([point('a', 50, 50)], key);
    layer.place(identity, identity);
    layer.animateFrom(before, 100, null);
    frames.run(0);
    frames.run(50);
    layer.place(identity, identity);
    calls.length = 0;
    frames.run(60);
    expect(drawnPositions(calls)).toEqual(['50,50']);
    expect(frames.pending()).toBe(false);
  });

  it('leaves points that stopped moving in place on the next animation of the same join', () => {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10), point('b', 20, 20)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    const move = (points: Datum[]) => {
      const before = layer.capturePositions();
      layer.replaceData(points, key);
      layer.place(identity, identity);
      layer.animateFrom(before, 100, null);
      frames.run(0);
      frames.run(100);
    };
    move([point('a', 30, 10), point('b', 40, 20)]);
    move([point('a', 30, 10), point('b', 60, 20)]);
    calls.length = 0;
    move([point('a', 30, 10), point('b', 60, 40)]);
    expect(drawnPositions(calls)).toEqual(['30,10', '60,20', '30,10', '60,40']);
  });

  it('does not animate when nothing moved', () => {
    const frames = installFrames();
    installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(0);
    layer.animateFrom(layer.capturePositions(), 100, null);
    expect(frames.pending()).toBe(false);
  });

  it('requests an unaccelerated 2D context so WebKit keeps the canvas inside the plot transform', () => {
    const frames = installFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    layer.invalidate();
    frames.run(0);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
  });

  it('gives up animating when the canvas has no 2D context', () => {
    const frames = installFrames();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    const before = new Map([[1, { x: 0, y: 0 }]]);
    layer.setOpacityTransition(100);
    layer.setOpacity(() => 0.5);
    layer.animateFrom(before, 100, null);
    frames.run(0);
    frames.run(10);
    expect(frames.pending()).toBe(false);
  });
});

describe('CanvasPointLayer opacity transitions', () => {
  function fadingLayer(durationMs: number) {
    const frames = installFrames();
    const calls = installRecordingContext();
    const { layer } = mountLayer();
    layer.join([point('a', 10, 10)], key, 100, 100);
    layer.restyle(config);
    layer.place(identity, identity);
    frames.run(5);
    layer.setOpacityTransition(durationMs);
    calls.length = 0;
    return { frames, calls, layer };
  }

  it('eases from the shown opacity, starting at the first frame even at time zero', () => {
    const { frames, calls, layer } = fadingLayer(100);
    layer.setOpacity(() => 0.5);
    frames.run(0);
    frames.run(50);
    frames.run(100);
    expect(drawnAlphas(calls)).toEqual([1, 1 - 0.5 * cssEase(0.5), 0.5]);
    expect(frames.pending()).toBe(false);
    layer.setOpacity(() => 1);
    frames.run(1000);
    frames.run(1050);
    expect(drawnAlphas(calls)).toEqual([0.5, 0.5 + 0.5 * cssEase(0.5)]);
  });

  it('continues a fade across a join and shows entering points at once', () => {
    const { frames, calls, layer } = fadingLayer(100);
    layer.setOpacity(() => 0.5);
    frames.run(0);
    frames.run(50);
    const shown = 1 - 0.5 * cssEase(0.5);
    layer.join([point('a', 10, 10), point('b', 20, 20)], key, 100, 100);
    layer.restyle({ ...config, getOpacity: (d) => (d.id === 'a' ? 0.5 : 1) });
    layer.place(identity, identity);
    calls.length = 0;
    frames.run(60);
    frames.run(110);
    expect(drawnAlphas(calls)).toEqual([shown, 1, shown + (0.5 - shown) * cssEase(0.5), 1]);
  });

  it('applies opacity at once without a transition', () => {
    const { frames, calls, layer } = fadingLayer(0);
    layer.setOpacity(() => 0.5);
    frames.run(10);
    expect(drawnAlphas(calls)).toEqual([0.5]);
    expect(frames.pending()).toBe(false);
  });

  it('honours a one millisecond transition', () => {
    const { frames, calls, layer } = fadingLayer(1);
    layer.setOpacity(() => 0.5);
    frames.run(10);
    frames.run(11);
    expect(drawnAlphas(calls)).toEqual([1, 0.5]);
  });
});

describe('cssEase precision', () => {
  it('matches cubic-bezier(0.25, 0.1, 0.25, 1) to 1e-6', () => {
    for (let step = 1; step < 200; step++) {
      const progress = step / 200;
      let low = 0;
      let high = 1;
      for (let i = 0; i < 80; i++) {
        const mid = (low + high) / 2;
        if (bezier(mid, 0.25, 0.25) < progress) low = mid;
        else high = mid;
      }
      expect(cssEase(progress)).toBeCloseTo(bezier(low, 0.1, 1), 6);
    }
  });
});
