// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Jumpscare } from '@/components/jumpscare/jumpscare';
import {
  JUMPSCARE_DURATION_MS,
  JUMPSCARE_MAX_DELAY_MS,
  JUMPSCARE_MIN_DELAY_MS,
} from '@/lib/jumpscare';

const localeState = vi.hoisted(() => ({ pathname: '/' }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
const audio = vi.hoisted(() => ({
  unlockJumpscareAudio: vi.fn(() => null),
  playJumpscareSound: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => localeState.pathname,
}));
vi.mock('@/lib/analytics', () => analytics);
vi.mock('@/lib/jumpscare-audio', () => audio);

let container: HTMLDivElement;
let root: Root;

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: query.includes('reduced-motion') ? matches : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

function setSearch(search: string) {
  window.history.replaceState(null, '', `${localeState.pathname}${search}`);
}

function overlay() {
  return document.querySelector('[data-testid="jumpscare"]');
}

function interact() {
  act(() => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  localeState.pathname = '/';
  setSearch('');
  setReducedMotion(false);
  analytics.track.mockClear();
  audio.unlockJumpscareAudio.mockClear();
  audio.playJumpscareSound.mockClear();
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
  // jsdom has no canvas backend; the overlay must cope with a null 2D context.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mount() {
  act(() => root.render(<Jumpscare />));
}

const MID_DELAY = Math.round((JUMPSCARE_MIN_DELAY_MS + JUMPSCARE_MAX_DELAY_MS) / 2);

describe('Jumpscare', () => {
  it('renders nothing until the visitor interacts, then fires within ten seconds', () => {
    mount();
    expect(overlay()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(overlay()).toBeNull();
    expect(audio.unlockJumpscareAudio).not.toHaveBeenCalled();

    interact();
    expect(audio.unlockJumpscareAudio).toHaveBeenCalledTimes(1);
    expect(overlay()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(MID_DELAY - 1);
    });
    expect(overlay()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const node = overlay();
    expect(node).not.toBeNull();
    expect(node?.getAttribute('aria-hidden')).toBe('true');
    expect(node?.querySelector('svg')).not.toBeNull();
    expect(node?.querySelector('[data-testid="jumpscare-caption"]')?.textContent).toContain(
      'IT IS BEHIND YOU',
    );
    expect(audio.playJumpscareSound).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith(
      'jumpscare_fired',
      expect.objectContaining({ forced: false, pathname: '/' }),
    );
  });

  it('tears itself down after the animation and does not re-arm within the same mount', () => {
    mount();
    interact();
    act(() => {
      vi.advanceTimersByTime(MID_DELAY);
    });
    expect(overlay()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(JUMPSCARE_DURATION_MS);
    });
    expect(overlay()).toBeNull();

    interact();
    act(() => {
      vi.advanceTimersByTime(JUMPSCARE_MAX_DELAY_MS + 1);
    });
    expect(overlay()).toBeNull();
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('only listens for the first activation gesture', () => {
    mount();
    interact();
    interact();
    act(() => {
      document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    });
    expect(audio.unlockJumpscareAudio).toHaveBeenCalledTimes(1);
  });

  it('shows the Chinese caption on /zh pages', () => {
    localeState.pathname = '/zh';
    setSearch('');
    mount();
    interact();
    act(() => {
      vi.advanceTimersByTime(MID_DELAY);
    });
    expect(overlay()?.querySelector('[data-testid="jumpscare-caption"]')?.textContent).toContain(
      '它就在你身后',
    );
  });

  const quietCases: [string, () => void][] = [
    ['under reduced motion', () => setReducedMotion(true)],
    [
      'inside a partner embed',
      () => {
        localeState.pathname = '/embed/inference';
        setSearch('');
      },
    ],
    [
      'under browser automation',
      () => Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true }),
    ],
  ];

  it.each(quietCases)('stays quiet %s', (_name, arrange) => {
    arrange();
    mount();
    interact();
    act(() => {
      vi.advanceTimersByTime(JUMPSCARE_MAX_DELAY_MS + 1);
    });
    expect(overlay()).toBeNull();
    expect(audio.unlockJumpscareAudio).not.toHaveBeenCalled();
  });

  function remount() {
    act(() => root.unmount());
    root = createRoot(container);
  }

  it('fires again on a fresh mount — there is no cooldown', () => {
    for (let visit = 0; visit < 3; visit++) {
      mount();
      interact();
      act(() => {
        vi.advanceTimersByTime(MID_DELAY);
      });
      expect(overlay()).not.toBeNull();
      remount();
    }
    expect(analytics.track).toHaveBeenCalledTimes(3);
  });

  it('?jumpscare=1 forces it past reduced motion and ?jumpscare=0 disables it', () => {
    setReducedMotion(true);
    setSearch('?jumpscare=1');
    mount();
    interact();
    act(() => {
      vi.advanceTimersByTime(MID_DELAY);
    });
    expect(overlay()).not.toBeNull();
    expect(analytics.track).toHaveBeenCalledWith(
      'jumpscare_fired',
      expect.objectContaining({ forced: true }),
    );

    remount();
    setReducedMotion(false);
    analytics.track.mockClear();
    setSearch('?jumpscare=0');
    mount();
    interact();
    act(() => {
      vi.advanceTimersByTime(JUMPSCARE_MAX_DELAY_MS + 1);
    });
    expect(overlay()).toBeNull();
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
