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
