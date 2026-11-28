// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchPointerIntent } from './pointer-intent';

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function move(x: number, timeStamp: number, buttons: number) {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: 10, buttons });
  Object.defineProperties(event, {
    pointerType: { value: 'mouse' },
    timeStamp: { value: timeStamp },
  });
  window.dispatchEvent(event);
}

function flushFrames() {
  for (const frame of frames.splice(0)) frame(performance.now());
}

function target() {
  const element = document.createElement('a');
  const rect = vi
    .spyOn(element, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(200, 0, 40, 20));
  return { element, rect };
}

describe('watchPointerIntent', () => {
  it('predicts a target the mouse is heading toward', () => {
    const { element } = target();
    const onPredicted = vi.fn();
    const stop = watchPointerIntent(element, onPredicted);
    for (let i = 0; i <= 4; i++) move(100 + i * 10, i * 10, 0);
    flushFrames();
    expect(onPredicted).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not measure targets while a button is held for a drag', () => {
    const { element, rect } = target();
    const onPredicted = vi.fn();
    const stop = watchPointerIntent(element, onPredicted);
    for (let i = 0; i <= 4; i++) move(100 + i * 10, i * 10, 1);
    flushFrames();
    expect(rect).not.toHaveBeenCalled();
    expect(onPredicted).not.toHaveBeenCalled();
    stop();
  });
});
