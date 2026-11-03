import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';

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
