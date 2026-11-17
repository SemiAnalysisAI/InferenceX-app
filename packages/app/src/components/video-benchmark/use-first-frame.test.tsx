// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFirstFrame } from './use-first-frame';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
});

function Clip({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useFirstFrame(() => video.current, src);
  return (
    <>
      <video ref={video} src={src} />
      {!frame && <img alt="" data-testid="first-frame" />}
    </>
  );
}

it('covers a clip again when it comes back after another, and when the element drops its data', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // The frames each element is still waiting to draw.
  const waits = new Map<HTMLVideoElement, Map<number, () => void>>();
  let next = 1;
  Object.assign(HTMLVideoElement.prototype, {
    requestVideoFrameCallback(this: HTMLVideoElement, drawn: () => void) {
      waits.set(this, (waits.get(this) ?? new Map()).set(next, drawn));
      next += 1;
      return next - 1;
    },
    cancelVideoFrameCallback(this: HTMLVideoElement, id: number) {
      waits.get(this)?.delete(id);
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const show = (src: string) => act(() => root!.render(<Clip src={src} />));
  const video = () => container!.querySelector('video')!;
  const draw = () =>
    act(() => {
      const frames = [...(waits.get(video()) ?? new Map<number, () => void>()).values()];
      waits.get(video())?.clear();
      frames.forEach((drawn) => drawn());
    });
  const covered = () => container!.querySelector('[data-testid="first-frame"]') !== null;

  show('/a.mp4');
  expect(covered(), 'before a frame').toBe(true);
  draw();
  expect(covered(), 'after its frame').toBe(false);

  show('/b.mp4');
  expect(covered(), 'another clip').toBe(true);
  // Back on the first clip without the second ever drawing: the element loads it anew.
  show('/a.mp4');
  expect(covered(), 'the first clip again').toBe(true);
  draw();
  expect(covered()).toBe(false);

  act(() => video().dispatchEvent(new Event('emptied')));
  expect(covered(), 'after the element dropped its data').toBe(true);
  draw();
  expect(covered()).toBe(false);
});
