// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import VideoPointSheet from './VideoPointSheet';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
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
