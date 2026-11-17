// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION } from './motion';
import { ghostStage } from './stage-ghost';

let fades: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
/** What the reader asked for; each test sets it before it paints. */
let reduced = false;

beforeEach(() => {
  fades = [];
  reduced = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion: reduce'),
  }));
  Element.prototype.animate = function animate(
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    fades.push({ frames, options });
    return {} as Animation;
  } as typeof Element.prototype.animate;
});

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.unstubAllGlobals();
});

/** A Wipe stage: both sides loaded, the right one clipped to its left half. */
function stage() {
  const element = document.createElement('div');
  element.innerHTML =
    '<div data-side="a"><div><img></div></div><div data-side="b"><div data-shown="0,50"><img></div></div><canvas></canvas>';
  document.body.append(element);
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 225 }) as DOMRect;
  for (const side of element.querySelectorAll<HTMLElement>('[data-side]'))
    side.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 225 }) as DOMRect;
  for (const image of element.querySelectorAll('img')) {
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1344 });
    Object.defineProperty(image, 'naturalHeight', { value: 768 });
  }
  const canvas = element.querySelector('canvas')!;
  const context = {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
  };
  canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
  canvas.getAnimations = () => [];
  return { element, canvas, context };
}

describe('ghostStage', () => {
  it('paints each side where it sits, Wipe clipped as it shows, and fades the picture out', () => {
    const { element, canvas, context } = stage();
    ghostStage(canvas);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    // The clipped side shows its left half only.
    expect(context.rect.mock.calls).toEqual([
      [0, 0, 400, 225],
      [0, 0, 200, 225],
    ]);
    expect(fades).toHaveLength(1);
    expect(fades[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(fades[0].options.duration).toBe(MOTION.base);
    element.remove();
  });

  it('paints nothing under reduced motion, so the stage changes at once', () => {
    reduced = true;
    const { element, canvas, context } = stage();
    ghostStage(canvas);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(fades).toHaveLength(0);
    element.remove();
  });
});
