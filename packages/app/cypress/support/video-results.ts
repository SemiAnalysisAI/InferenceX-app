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
