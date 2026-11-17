// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoPointSheet from './VideoPointSheet';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  // A return a test left on its way ends here, as a press on the page ends it.
  window.dispatchEvent(new Event('pointerdown'));
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const close = () =>
  act(() =>
    document.querySelector<HTMLButtonElement>('[data-testid="video-point-sheet-close"]')!.click(),
  );

/**
 * A 300 px sheet on an 800 px screen, so it rests at 500 px. `page` is what the test moves: the
 * scroll offset, the bottom edge of the point's mark and how tall the sheet's first screen is.
 */
function open(page: { scrollY: number; markBottom: number; firstScreen: number }) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => page.scrollY });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(() => page.firstScreen);
  const scrollBy = vi.fn();
  const scrollTo = vi.fn();
  vi.stubGlobal('scrollBy', scrollBy);
  vi.stubGlobal('scrollTo', scrollTo);
  const anchor = () =>
    ({
      getBoundingClientRect: () => ({ top: page.markBottom - 20, bottom: page.markBottom }),
    }) as Element;
  const onClose = vi.fn();
  const render = (pointKey: string) =>
    act(() =>
      root!.render(
        <VideoPointSheet
          title="B200"
          color="black"
          facts={[]}
          clip={null}
          prompt={null}
          metrics={[]}
          telemetry={{ label: 'View telemetry', onOpen: () => {} }}
          context={{ gpu: 'b200', overlay: false }}
          pointKey={pointKey}
          anchor={anchor}
          onClose={onClose}
        >
          rest
        </VideoPointSheet>,
      ),
    );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render('first');
  return { scrollBy, scrollTo, onClose, render, close };
}

it('returns the page to where a tap found it, not to where a later scroll passed', () => {
  // The mark is on screen, 100 px under where the sheet rests.
  const page = { scrollY: 1000, markBottom: 580, firstScreen: 200 };
  const sheet = open(page);
  expect(sheet.scrollBy).toHaveBeenLastCalledWith({ top: 100, behavior: 'smooth' });
  // Part of the way there the clip is read, and the taller first screen asks for more.
  Object.assign(page, { scrollY: 1040, markBottom: 540, firstScreen: 230 });
  sheet.render('first');
  expect(sheet.scrollBy).toHaveBeenCalledTimes(2);
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000 });
  expect(sheet.onClose).toHaveBeenCalledOnce();
});

it('moves nothing when a link’s sheet closes, also when its clip was read on the way down', () => {
  // The link's point starts below the screen.
  const page = { scrollY: 0, markBottom: 1500, firstScreen: 200 };
  const sheet = open(page);
  expect(sheet.scrollBy).toHaveBeenLastCalledWith({ top: 1020, behavior: 'smooth' });
  // The clip is read while the page is on its way: the mark is on screen and still covered.
  Object.assign(page, { scrollY: 800, markBottom: 700, firstScreen: 230 });
  sheet.render('first');
  expect(sheet.scrollBy).toHaveBeenLastCalledWith({ top: 220, behavior: 'smooth' });
  sheet.close();
  expect(sheet.scrollTo).not.toHaveBeenCalled();
  expect(sheet.onClose).toHaveBeenCalledOnce();
});

it('returns to where the reader tapped a second point after a link opened the first', () => {
  const page = { scrollY: 0, markBottom: 1500, firstScreen: 200 };
  const sheet = open(page);
  // At rest on the linked point, the reader taps one the sheet covers.
  Object.assign(page, { scrollY: 1020, markBottom: 600 });
  sheet.render('second');
  expect(sheet.scrollBy).toHaveBeenLastCalledWith({ top: 120, behavior: 'smooth' });
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1020 });
});

/** Lets the sheet animate, as a browser does; returns each animation with a handle that ends it. */
function animated() {
  const slides: { frames: Keyframe[]; finish: () => void; cancelled: boolean }[] = [];
  Element.prototype.animate = function animate(frames: Keyframe[]) {
    const listeners: Record<string, (() => void)[]> = {};
    const slide = {
      frames,
      cancelled: false,
      finish: () => listeners.finish?.forEach((listener) => listener()),
    };
    slides.push(slide);
    return {
      addEventListener: (type: string, listener: () => void) =>
        (listeners[type] ??= []).push(listener),
      cancel: () => {
        slide.cancelled = true;
      },
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
  return slides;
}
afterEach(() => Reflect.deleteProperty(Element.prototype, 'animate'));

it('slides away and scrolls the page back smoothly, and closes once it is gone', () => {
  const slides = animated();
  const page = { scrollY: 1000, markBottom: 580, firstScreen: 200 };
  const sheet = open(page);
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000, behavior: 'smooth' });
  // Still there while it leaves, with the page behind already taking touches.
  expect(sheet.onClose).not.toHaveBeenCalled();
  expect(slides).toHaveLength(1);
  expect(slides[0].frames.at(-1)).toEqual({ transform: 'translateY(100%)', opacity: 0 });
  expect(document.querySelector('[data-testid="video-point-sheet-backdrop"]')!.className).toContain(
    'pointer-events-none',
  );
  // A second close while it leaves does nothing more.
  sheet.close();
  expect(slides).toHaveLength(1);
  act(() => slides[0].finish());
  expect(sheet.onClose).toHaveBeenCalledOnce();
});

it('stays for another point tapped while it slides away', () => {
  const slides = animated();
  const sheet = open({ scrollY: 1000, markBottom: 400, firstScreen: 200 });
  sheet.close();
  sheet.render('second');
  expect(slides[0].cancelled).toBe(true);
  // The slide that was cut short must not close the sheet the reader just moved.
  act(() => slides[0].finish());
  expect(sheet.onClose).not.toHaveBeenCalled();
  expect(
    document.querySelector('[data-testid="video-point-sheet-backdrop"]')!.className,
  ).not.toContain('pointer-events-none');
});

it('closes at once under reduced motion', () => {
  animated();
  const sheet = open({ scrollY: 1000, markBottom: 580, firstScreen: 200 });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000 });
  expect(sheet.onClose).toHaveBeenCalledOnce();
});

it('stops the page where it is once the reader takes hold of it on its way back', () => {
  animated();
  const page = { scrollY: 1100, markBottom: 580, firstScreen: 200 };
  const sheet = open({ ...page, scrollY: 1000 });
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => page.scrollY });
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000, behavior: 'smooth' });
  // A second tap on the sheet as it leaves is not a hand on the page.
  document
    .querySelector('[data-testid="video-point-sheet-close"]')!
    .dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(sheet.scrollTo).toHaveBeenCalledOnce();
  // Part of the way back a wheel turns: a scroll to where the page is ends the smooth one.
  page.scrollY = 1060;
  window.dispatchEvent(new Event('wheel'));
  expect(sheet.scrollTo).toHaveBeenLastCalledWith({ top: 1060 });
  page.scrollY = 1070;
  window.dispatchEvent(new Event('touchstart'));
  expect(sheet.scrollTo).toHaveBeenCalledTimes(2);
});

it('ends the return for another point tapped while it slides away', () => {
  animated();
  // The second point is clear of the sheet where the page is, and would not be where it began.
  const page = { scrollY: 1000, markBottom: 580, firstScreen: 200 };
  const sheet = open(page);
  Object.assign(page, { scrollY: 1100, markBottom: 480 });
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000, behavior: 'smooth' });
  sheet.render('second');
  expect(sheet.scrollTo).toHaveBeenLastCalledWith({ top: 1100 });
  expect(sheet.scrollBy).toHaveBeenCalledOnce();
  // The same point drawn again, as when its clip is read, sends no scroll of its own.
  sheet.render('second');
  expect(sheet.scrollTo).toHaveBeenCalledTimes(2);
});

it('ends the return for a point tapped after the sheet has gone', () => {
  const slides = animated();
  const page = { scrollY: 1000, markBottom: 580, firstScreen: 200 };
  const first = open(page);
  first.close();
  act(() => slides[0].finish());
  expect(first.onClose).toHaveBeenCalledOnce();
  act(() => root!.unmount());
  // The page is part of the way back when another point opens a sheet of its own.
  const second = open({ scrollY: 1070, markBottom: 480, firstScreen: 200 });
  expect(second.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1070 });
  expect(second.scrollBy).not.toHaveBeenCalled();
});

it('lets the page go back when a point that needed no scroll is drawn again as the sheet leaves', () => {
  animated();
  const page = { scrollY: 1000, markBottom: 580, firstScreen: 200 };
  const sheet = open(page);
  // The sheet moves to a point already clear of it, so the page does not move for that one.
  Object.assign(page, { scrollY: 1100, markBottom: 480 });
  sheet.render('second');
  expect(sheet.scrollBy).toHaveBeenCalledOnce();
  sheet.close();
  expect(sheet.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1000, behavior: 'smooth' });
  // Its clip is read while the sheet slides away, which makes the first screen taller.
  Object.assign(page, { scrollY: 1080, firstScreen: 230 });
  sheet.render('second');
  expect(sheet.scrollTo).toHaveBeenCalledOnce();
});
