import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { COARSE_POINTER_QUERY } from '@/hooks/useMediaQuery';

/** Clone retained metadata for isolated browser cases; mutations are test data, not benchmark evidence. */
export function resultHistory(
  edit?: (observation: VideoHistoryObservation) => void,
): Cypress.Chainable<VideoHistoryPage> {
  return cy.fixture<VideoHistoryPage>('api/video-history.json').then((retained) => {
    const page = structuredClone(retained);
    for (const entry of page.entries)
      for (const source of entry.sources)
        for (const observation of source.observations) edit?.(observation);
    return page;
  });
}

export function readOnlyVideoRequests() {
  cy.intercept({ url: '/api/video-runs*', middleware: true }, (request) => {
    expect(request.method, 'video data stays read-only').to.equal('GET');
    const format = new URL(request.url).searchParams.get('format');
    expect(format, 'media reads never invoke the publication path').not.to.equal('media');
  });
  cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
}

/**
 * A touch screen for the components mounted after it: `useIsCoarsePointer` reads true. Call it
 * before mounting. CSS media queries still see the test browser's mouse.
 */
export function coarsePointer() {
  cy.window().then((win) => {
    const real = win.matchMedia.bind(win);
    cy.stub(win, 'matchMedia').callsFake((query: string) =>
      query === COARSE_POINTER_QUERY
        ? ({
            matches: true,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          } as unknown as MediaQueryList)
        : real(query),
    );
  });
}

/**
 * A touch screen the style sheet sees too: Chromium's touch emulation makes
 * `(hover: none) and (pointer: coarse)` match in CSS and in `matchMedia`. Chromium only; the
 * emulation outlives the test, so pair `touchScreen(true)` with `touchScreen(false)` in `afterEach`.
 */
export function touchScreen(enabled: boolean) {
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setTouchEmulationEnabled',
      params: { enabled },
    }),
  );
}

/**
 * Asks for reduced motion, or stops asking, as the system setting does: stylesheets and
 * `matchMedia` both see it. Chromium only; set it before the page mounts.
 */
export function reducedMotion(enabled: boolean) {
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: {
        features: [{ name: 'prefers-reduced-motion', value: enabled ? 'reduce' : '' }],
      },
    }),
  );
}

/**
 * A drag by the browser's own mouse, straight down from a point of the mounted page: a press, one
 * move and a release, each reaching whatever is under the mouse as a person's does, where
 * `trigger` hands its event to the element named. The mouse ends outside the mounted page.
 * Chromium only.
 */
export function mouseDragDown(x: number, y: number, distance: number) {
  cy.then(async () => {
    const frame = window.top!.document.querySelector<HTMLElement>('iframe.aut-iframe')!;
    const box = frame.getBoundingClientRect();
    // The runner draws the mounted page scaled to fit its own window.
    const scale = box.width / frame.offsetWidth;
    const mouse = (type: string, pageY: number, buttons: number) =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Input.dispatchMouseEvent',
        params: {
          type,
          x: box.left + x * scale,
          y: box.top + pageY * scale,
          button: 'left',
          buttons,
          clickCount: 1,
        },
      });
    await mouse('mousePressed', y, 1);
    await mouse('mouseMoved', y + distance, 1);
    await mouse('mouseReleased', y + distance, 0);
    await Cypress.automation('remote:debugger:protocol', {
      command: 'Input.dispatchMouseEvent',
      params: { type: 'mouseMoved', x: 0, y: 0 },
    });
  });
}

const staged = (element: HTMLMediaElement) =>
  element.closest('[data-testid="video-results-stage"]') !== null;

/** What `phoneMedia` saw the stage ask of its clips. */
export interface PhoneMediaCall {
  call: 'play' | 'pause';
  src: string;
  /** Asked for inside a click's dispatch, which is where a phone accepts a start. */
  inClick: boolean;
  /** Whether the clip had its data by then. */
  loaded: boolean;
}

/**
 * Stands in for the stage's video elements with media that behaves as iOS WebKit's does: a clip
 * has its duration but no picture data until play() has been asked of it and left standing for
 * `loadMs(src)`; pause() before that drops the wait, so a clip that is played and at once paused
 * never loads. Until the data is there no `progress`, `canplay` or `canplaythrough` fires and
 * nothing is buffered. Returns the calls seen and the undo, which the test's `afterEach` runs.
 */
export function phoneMedia(win: Window, loadMs: (src: string) => number) {
  const view = win as Window & typeof globalThis;
  const media = view.HTMLMediaElement.prototype;
  const video = view.HTMLVideoElement.prototype;
  const DURATION = 2;
  const calls: PhoneMediaCall[] = [];
  interface Clip {
    paused: boolean;
    loaded: boolean;
    timer: number;
    /** Media time and wall time when it last started moving or stopped. */
    time: number;
    since: number;
    rate: number;
    frames: Map<number, VideoFrameRequestCallback>;
    next: number;
  }
  const clips = new WeakMap<HTMLMediaElement, Clip>();
  const clipOf = (element: HTMLMediaElement) => {
    let clip = clips.get(element);
    if (!clip) {
      clip = {
        paused: true,
        loaded: false,
        timer: 0,
        time: 0,
        since: 0,
        rate: 1,
        frames: new Map(),
        next: 1,
      };
      clips.set(element, clip);
      // The duration is known up front, as with the metadata a phone preloads.
      view.setTimeout(() => element.dispatchEvent(new view.Event('loadedmetadata')));
    }
    return clip;
  };
  const now = (clip: Clip) =>
    clip.loaded && !clip.paused
      ? Math.min(DURATION, clip.time + ((view.performance.now() - clip.since) / 1000) * clip.rate)
      : clip.time;
  const present = (clip: Clip) =>
    view.requestAnimationFrame((at) => {
      const frames = [...clip.frames.values()];
      clip.frames.clear();
      for (const frame of frames) frame(at, {} as VideoFrameCallbackMetadata);
    });
  const settle = (clip: Clip) => {
    clip.time = now(clip);
    clip.since = view.performance.now();
  };
  const called = (call: PhoneMediaCall['call'], element: HTMLMediaElement, clip: Clip) =>
    calls.push({
      call,
      src: element.getAttribute('src') ?? '',
      inClick: view.event?.type === 'click',
      loaded: clip.loaded,
    });
  const read: Record<string, (clip: Clip) => unknown> = {
    paused: (clip) => clip.paused,
    readyState: (clip) => (clip.loaded ? 4 : 1),
    duration: () => DURATION,
    seeking: () => false,
    ended: () => false,
    buffered: (clip) => {
      const end = clip.loaded ? DURATION : 0;
      return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end };
    },
    currentTime: now,
    playbackRate: (clip) => clip.rate,
  };
  const write: Record<string, (clip: Clip, value: number) => void> = {
    currentTime: (clip, value) => {
      clip.time = value;
      clip.since = view.performance.now();
      if (clip.loaded) present(clip);
    },
    playbackRate: (clip, value) => {
      settle(clip);
      clip.rate = value;
    },
  };
  const methods: Record<string, (element: HTMLMediaElement, argument: never) => unknown> = {
    play: (element) => {
      const clip = clipOf(element);
      called('play', element, clip);
      if (!clip.paused) return Promise.resolve();
      settle(clip);
      clip.paused = false;
      if (!clip.loaded)
        clip.timer = view.setTimeout(
          () => {
            clip.loaded = true;
            clip.since = view.performance.now();
            element.dispatchEvent(new view.Event('canplay'));
            element.dispatchEvent(new view.Event('playing'));
            present(clip);
          },
          loadMs(element.getAttribute('src') ?? ''),
        );
      return Promise.resolve();
    },
    pause: (element) => {
      const clip = clipOf(element);
      called('pause', element, clip);
      settle(clip);
      clip.paused = true;
      view.clearTimeout(clip.timer);
    },
    requestVideoFrameCallback: (element, callback: VideoFrameRequestCallback) => {
      const clip = clipOf(element);
      clip.frames.set(clip.next, callback);
      clip.next += 1;
      return clip.next - 1;
    },
    cancelVideoFrameCallback: (element, id: number) => clipOf(element).frames.delete(id),
  };
  // A clip outside the stage keeps the browser's own media.
  const undo = [...Object.keys(read), ...Object.keys(methods)].map((name) => {
    const target = name in media ? media : video;
    const real = Object.getOwnPropertyDescriptor(target, name)!;
    Object.defineProperty(
      target,
      name,
      name in methods
        ? {
            configurable: true,
            writable: true,
            value(this: HTMLMediaElement, argument: never) {
              return staged(this)
                ? methods[name](this, argument)
                : (real.value as (...all: never[]) => unknown).call(this, argument);
            },
          }
        : {
            configurable: true,
            get(this: HTMLMediaElement) {
              return staged(this) ? read[name](clipOf(this)) : real.get!.call(this);
            },
            set(this: HTMLMediaElement, value: number) {
              if (staged(this) && write[name]) write[name](clipOf(this), value);
              else real.set?.call(this, value);
            },
          },
    );
    return () => Object.defineProperty(target, name, real);
  });
  return { calls, undo: () => undo.forEach((restore) => restore()) };
}

/**
 * The width and height of the area around an element's centre whose taps reach it, up to 30 px
 * each way. It counts a hit area drawn by a pseudo-element and stops where a neighbour is on top.
 */
export function tapArea(selector: string) {
  return cy.get(selector).then(($element) => {
    const element = $element[0];
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const reach = (dx: number, dy: number) => {
      let steps = 0;
      while (
        steps < 30 &&
        element.contains(
          element.ownerDocument.elementFromPoint(x + dx * (steps + 1), y + dy * (steps + 1)),
        )
      )
        steps += 1;
      return steps;
    };
    return { width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1 };
  });
}
