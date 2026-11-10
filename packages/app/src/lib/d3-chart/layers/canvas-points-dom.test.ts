// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CANVAS_POINT_LAYER_SELECTOR } from './canvas-point-registry';
import type { CanvasPointLayerElement, PointPointerHandlers } from './canvas-points';
import {
  config,
  type Datum,
  identity,
  installFrames,
  installRecordingContext,
  key,
  mountLayer,
} from './canvas-points-test-utils';

const point = (id: string, x: number, y: number, visible?: boolean): Datum => ({
  id,
  precision: 'fp8',
  x,
  y,
  ...(visible === undefined ? {} : { visible }),
});

function placedLayer(points: Datum[]) {
  const frames = installFrames();
  installRecordingContext();
  const mounted = mountLayer();
  mounted.layer.join(points, key, 100, 100);
  mounted.layer.restyle(config);
  mounted.layer.place(identity, identity);
  frames.run(0);
  return { ...mounted, frames };
}

function labelAnchors(svg: Element) {
  return [...svg.querySelectorAll<SVGGElement>('.point-label-anchor')];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function stubScreenOrigin(element: SVGGElement, x: number, y: number): void {
  Object.defineProperty(element, 'getScreenCTM', {
    configurable: true,
    value: () => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
  });
}

describe('CanvasPointLayer DOM', () => {
  it('builds a pointer-transparent canvas under the SVG, beside a transparent hit path and a label layer', () => {
    const { svg, layer } = mountLayer();
    const element = svg.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)!;
    expect(element.dataset.pointsJoined).toBe('0');
    expect([...element.children].map((child) => child.tagName)).toEqual(['path', 'g']);
    const [hitPath, labelLayer] = element.children;
    layer.join([point('a', 1, 2)], key, 100, 100);
    layer.place(identity, identity);
    expect(svg.querySelector('foreignObject, canvas')).toBeNull();
    const canvas = svg.previousElementSibling as HTMLCanvasElement;
    expect(canvas.tagName.toLowerCase()).toBe('canvas');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect([canvas.style.display, canvas.style.position, canvas.style.pointerEvents]).toEqual([
      'block',
      'absolute',
      'none',
    ]);
    expect((svg as SVGSVGElement).style.position).toBe('relative');
    expect([hitPath.getAttribute('fill'), hitPath.getAttribute('cursor')]).toEqual([
      'transparent',
      'pointer',
    ]);
    expect(labelLayer.getAttribute('class')).toBe('point-label-layer');
    layer.restyle(config);
    expect(element.scatterPoints?.().map((entry) => [entry.key, entry.x, entry.y])).toEqual([
      ['a', 1, 2],
    ]);
  });

  it('aligns the canvas with the plot origin instead of relying on SVG transforms', () => {
    const { svg, layer } = mountLayer();
    const host = svg.parentElement!;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 500, 400));
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 28, 500, 392));
    Object.defineProperty(layer.element, 'getCTM', {
      configurable: true,
      value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 60, f: 24 }),
    });
    layer.join([point('a', 1, 2)], key, 100, 100);
    layer.place(identity, identity);
    const canvas = svg.previousElementSibling as HTMLCanvasElement;
    expect([canvas.style.left, canvas.style.top]).toEqual(['60px', '32px']);
  });

  it('removes the canvas when the chart clears its SVG and keeps one canvas per layer', async () => {
    const first = mountLayer();
    first.layer.join([point('a', 1, 2)], key, 100, 100);
    first.layer.place(identity, identity);
    first.layer.place(identity, identity);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    first.svg.replaceChildren();
    await Promise.resolve();
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('redraws only connected layers when the document theme changes, from one observer', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const connected = mountLayer().layer;
    const detached = mountLayer();
    expect(observe.mock.calls.length).toBeLessThanOrEqual(1);
    detached.svg.remove();
    const connectedRedraw = vi.spyOn(connected, 'invalidate');
    const detachedRedraw = vi.spyOn(detached.layer, 'invalidate');
    document.documentElement.classList.toggle('dark');
    await Promise.resolve();
    expect(connectedRedraw).toHaveBeenCalledOnce();
    expect(detachedRedraw).not.toHaveBeenCalled();
  });

  it('updates the hit path and hit index when points restyle or move', () => {
    const { svg, layer, frames } = placedLayer([point('a', 10, 10), point('b', 50, 50)]);
    const hitPath = svg.querySelector('.dot-hit-area')!;
    const arc = 'a12,12 0 1,0 24,0a12,12 0 1,0 -24,0';
    expect(hitPath.getAttribute('d')).toBe(`M-2,10${arc}M38,50${arc}`);
    expect(layer.hitTest(10, 10)).toBe(0);
    layer.restyle({ ...config, getPointerEvents: (d) => (d.id === 'a' ? 'none' : 'auto') });
    expect(frames.pending()).toBe(true);
    expect(layer.hitTest(10, 10)).toBe(-1);
    frames.run(16);
    expect(hitPath.getAttribute('d')).toBe(`M38,50${arc}`);
    layer.replaceData([point('a', 10, 10), point('b', 90, 50)], key);
    layer.place(identity, identity);
    expect(frames.pending()).toBe(true);
    expect(layer.hitTest(50, 50)).toBe(-1);
    expect(layer.hitTest(90, 50)).toBe(1);
    frames.run(32);
    expect(hitPath.getAttribute('d')).toBe(`M78,50${arc}`);
  });
});

describe('CanvasPointLayer labels', () => {
  it('creates, orders, positions, styles and removes label anchors with the points', () => {
    const { svg, layer } = placedLayer([point('a', 10, 20), point('b', 30, 40)]);
    layer.setOpacityTransition(150);
    layer.setLabels((d) => d.id, 'ink');
    const anchors = () =>
      labelAnchors(svg).map((anchor) => [
        anchor.textContent,
        anchor.getAttribute('transform'),
        anchor.style.opacity,
        anchor.style.filter,
        anchor.style.transition,
      ]);
    expect(anchors()).toEqual([
      ['a', 'translate(10,20)', '1', '', 'opacity 150ms ease'],
      ['b', 'translate(30,40)', '1', '', 'opacity 150ms ease'],
    ]);
    expect(svg.querySelector('.point-label')!.getAttribute('fill')).toBe('ink');

    layer.setFade((d) => d.id === 'b');
    expect(anchors()[1][3]).toBe('opacity(0.2)');
    layer.setFade(null);
    expect(anchors()[1][3]).toBe('');

    layer.replaceData([point('a', 15, 25), point('b', 30, 40)], key);
    layer.place(identity, identity);
    expect(anchors()[0][1]).toBe('translate(15,25)');

    layer.join([point('b', 30, 40)], key, 100, 100);
    layer.restyle(config);
    expect(anchors().map((anchor) => anchor[0])).toEqual(['b']);

    layer.restyle({ ...config, getOpacity: () => 0 });
    expect(labelAnchors(svg)).toEqual([]);
    layer.restyle(config);
    expect(anchors().map((anchor) => anchor[0])).toEqual(['b']);

    layer.setLabels(null, 'ink');
    expect(labelAnchors(svg)).toEqual([]);
    layer.setLabels((d) => d.id, 'ink');
    expect(anchors().map((anchor) => anchor[0])).toEqual(['b']);
  });

  it('sets a label transition only while opacity transitions are on', () => {
    const { svg, layer } = placedLayer([point('a', 10, 20)]);
    layer.setLabels((d) => d.id, 'ink');
    expect(labelAnchors(svg)[0].style.transition).toBe('');
    layer.setOpacityTransition(1);
    layer.setOpacity(() => 0.5);
    expect(labelAnchors(svg)[0].style.transition).toBe('opacity 1ms ease');
  });
});

function pointerLayer() {
  const mounted = placedLayer([point('a', 10, 10), point('b', 60, 10)]);
  stubScreenOrigin(mounted.layer.element, 100, 50);
  const events: string[] = [];
  const handlers: PointPointerHandlers<Datum> = {
    enter: (_event, datum) => {
      events.push(`enter:${datum.id}`);
      return true;
    },
    move: () => events.push('move'),
    leave: (_event, datum) => {
      events.push(`leave:${datum.id}`);
      return true;
    },
    click: (_event, datum, position) => events.push(`click:${datum.id}@${position.x}`),
  };
  mounted.layer.listen(handlers);
  const hitArea = mounted.svg.querySelector('.dot-hit-area')!;
  const fire = (type: string, x: number, y: number) =>
    hitArea.dispatchEvent(new MouseEvent(type, { clientX: 100 + x, clientY: 50 + y }));
  return { ...mounted, events, fire };
}

describe('CanvasPointLayer pointer', () => {
  it('enters on mouseenter, clears hover on mouseleave and re-enters the same point', () => {
    const { layer, frames, events, fire } = pointerLayer();
    fire('mouseenter', 10, 10);
    expect(layer.snapshot()[0].hovered).toBe(true);
    expect(frames.pending()).toBe(true);
    fire('mouseleave', 10, 10);
    expect(layer.snapshot()[0].hovered).toBe(false);
    fire('mousemove', 10, 10);
    expect(events).toEqual(['enter:a', 'move', 'leave:a', 'enter:a', 'move']);
  });

  it('clicks the first point and reports its position relative to the plot origin', () => {
    const { events, fire } = pointerLayer();
    fire('click', 12, 10);
    fire('click', 35, 10);
    expect(events).toEqual(['click:a@10']);
  });
});

describe('CanvasPointLayer state', () => {
  it('reports every point in the snapshot with its style and client position', () => {
    const { layer } = placedLayer([
      point('a', 10, 20),
      point('b', 30, 40),
      point('c', 50, 60, false),
    ]);
    stubScreenOrigin(layer.element, 100, 50);
    layer.restyle({
      getColor: (d) => (d.id === 'a' ? 'red' : 'blue'),
      getPointerEvents: (d) => (d.id === 'c' ? 'none' : 'auto'),
      getOpacity: (d) => (d.id === 'c' ? 0 : 1),
      dataAttrs: { 'data-id': (d) => (d.id === 'b' ? null : d.id) },
    });
    layer.setHalo((d) => (d.id === 'b' ? 'green' : null), {
      radius: 1,
      strokeWidth: 1,
      dash: [],
      opacity: 1,
    });
    layer.setFade((d) => d.id === 'a');
    layer.setLabels((d) => d.id, 'ink');
    expect(
      layer
        .snapshot()
        .map(({ key: id, clientX, clientY, interactive, color, halo, faded, label, attrs }) => ({
          id,
          clientX,
          clientY,
          interactive,
          color,
          halo,
          faded,
          label,
          attrs,
        })),
    ).toEqual([
      {
        id: 'a',
        clientX: 110,
        clientY: 70,
        interactive: true,
        color: 'red',
        halo: null,
        faded: true,
        label: 'a',
        attrs: { 'data-id': 'a' },
      },
      {
        id: 'b',
        clientX: 130,
        clientY: 90,
        interactive: true,
        color: 'blue',
        halo: 'green',
        faded: false,
        label: 'b',
        attrs: {},
      },
      {
        id: 'c',
        clientX: 150,
        clientY: 110,
        interactive: false,
        color: 'blue',
        halo: null,
        faded: false,
        label: null,
        attrs: { 'data-id': 'c' },
      },
    ]);
    layer.restyle({ getColor: () => 'black' });
    expect(layer.snapshot().map((entry) => [entry.opacity, entry.halo])).toEqual([
      [1, null],
      [1, 'green'],
      [1, null],
    ]);
  });

  it('clears fades and halos and redraws for each change', () => {
    const { layer, frames } = placedLayer([point('a', 10, 20)]);
    layer.setFade(() => true);
    expect(frames.pending()).toBe(true);
    frames.run(16);
    layer.setFade(null);
    expect(layer.snapshot()[0].faded).toBe(false);
    expect(frames.pending()).toBe(true);
    frames.run(32);
    layer.setHalo(() => 'green', { radius: 1, strokeWidth: 1, dash: [], opacity: 1 });
    expect(frames.pending()).toBe(true);
    frames.run(48);
    layer.setHalo(null, { radius: 1, strokeWidth: 1, dash: [], opacity: 1 });
    expect(layer.snapshot()[0].halo).toBeNull();
    expect(frames.pending()).toBe(true);
  });

  it('reads opacity from every point and nothing past the end', () => {
    const { layer } = placedLayer([point('a', 10, 20), point('b', 30, 40)]);
    layer.setOpacity((d) => (d.visible === false ? 0 : 0.5));
    expect(layer.snapshot().map((entry) => entry.opacity)).toEqual([0.5, 0.5]);
  });
});
