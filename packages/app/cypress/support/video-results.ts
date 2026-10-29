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

export const RESULT_GROUPS = [
  'validity',
  'latency',
  'throughput',
  'energy',
  'cost',
  'quality',
  'stability',
  'startup',
  'deploy',
];

export function assertResultsFit() {
  cy.document().should((document) => {
    const width = document.documentElement.clientWidth;
    const overflowing = [...document.querySelectorAll('[data-testid="video-results"] *')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`)
      .join(', ');
    expect(
      document.documentElement.scrollWidth,
      `no horizontal page overflow (${overflowing})`,
    ).to.be.at.most(document.documentElement.clientWidth);
  });
}
