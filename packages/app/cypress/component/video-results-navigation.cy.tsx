import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import { videoHistoryEntry } from '@/components/video-benchmark/history';
import { servingArtifact, videoRun } from '../support/video-artifacts';

describe('Published video result navigation', () => {
  const saved = servingArtifact();
  const page = { schemaVersion: 1, entries: [videoHistoryEntry(saved, null)], nextPage: null };
  beforeEach(() => {
    cy.window().then((win) =>
      win.history.replaceState(null, '', `${win.location.pathname}?view=results`),
    );
    cy.intercept('GET', '/api/video-runs?format=history&page=1', page).as('published');
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null }).as('recent');
    cy.intercept('GET', '/api/video-runs?run=123', {
      run: videoRun(123, 'success'),
      artifacts: [saved.artifact],
    }).as('run');
    cy.intercept('GET', '**/api/video-runs*format=media', saved).as('media');
    cy.intercept('GET', 'https://media.test/**', { statusCode: 204 });
  });
  it('opens published videos from History when recent Actions contain no H3 runs', () => {
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="video-history-observation"]').should('have.length', 3);
    cy.contains('button', 'Videos & result').click();
    cy.get('[data-testid="serving-selected-metrics"]').should('be.visible').and('contain', 'C1');
    cy.location('search').should('contain', 'view=results').and('contain', 'run=123');
    cy.get('@recent.all').should('have.length', 0);
  });
  it('shows the Chinese published empty state and scans CI only after an explicit request', () => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1', {
      schemaVersion: 1,
      entries: [],
      nextPage: null,
    });
    cy.mount(
      <PathnameContext.Provider value="/zh/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.contains('最新发布页面中没有可读取的结果').should('be.visible');
    cy.get('@recent.all').should('have.length', 0);
    cy.contains('button', '浏览 CI 运行').click();
    cy.wait('@recent');
    cy.contains('本页 GitHub 历史中没有 H3 运行').should('be.visible');
    cy.contains('button', '性能历史').should('be.enabled');
    cy.location('search').should('contain', 'view=results');
    cy.contains('button', '视频与结果').click();
    cy.contains('最新发布页面中没有可读取的结果').should('be.visible');
    cy.contains('button', '浏览 CI 运行').should('be.enabled');
  });
  it('retries a failed published read and skips unreadable sources without scanning CI', () => {
    let reads = 0;
    cy.intercept('GET', '/api/video-runs?format=history&page=1', (req) => {
      if (++reads === 1) req.reply({ statusCode: 503, body: { error: 'Unavailable' } });
      else
        req.reply({
          ...page,
          entries: [
            { ...page.entries[0], error: 'Unreadable index', sources: [] },
            ...page.entries,
          ],
        });
    });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.get('[role="alert"]').should('contain', 'Could not load published results');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="serving-selected-metrics"]').should('be.visible');
    cy.get('@recent.all').should('have.length', 0);
  });
  it('does not select a stale published response after returning to History', () => {
    let release: (() => void) | undefined;
    cy.window().then((win) => {
      const fetch = win.fetch.bind(win);
      let first = true;
      cy.stub(win, 'fetch').callsFake((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('format=history') && first) {
          first = false;
          return new Promise<Response>((resolve) => {
            release = () => resolve(Response.json(page));
          });
        }
        return fetch(input, init);
      });
    });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.wrap(null).should(() => expect(release).to.be.a('function'));
    cy.contains('button', 'Performance history').click();
    cy.get('[data-testid="video-history-observation"]').should('have.length', 3);
    cy.then(() => release?.());
    cy.get('@run.all').should('have.length', 0);
    cy.location('search').should('contain', 'view=history').and('not.contain', 'run=');
    cy.contains('button', 'Performance history').should('have.attr', 'aria-pressed', 'true');
  });
  it('retries the shared C4 selection after a refresh metadata failure', () => {
    cy.window().then((win) =>
      win.history.replaceState(
        null,
        '',
        `${win.location.pathname}?view=results&run=123&artifact=40&source=123&cell=c4`,
      ),
    );
    let reads = 0;
    cy.intercept('GET', '/api/video-runs?run=123', (req) => {
      if (++reads === 2) req.reply({ statusCode: 503, body: { error: 'CI run unavailable' } });
      else req.reply({ run: videoRun(123, 'success'), artifacts: [saved.artifact] });
    });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="serving-selected-metrics"]').should('contain', 'C4');
    cy.contains('button', 'Refresh').click();
    cy.get('[role="alert"]').should('contain', 'CI run unavailable');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="serving-selected-metrics"]').should('be.visible').and('contain', 'C4');
    cy.get('@published.all').should('have.length', 0);
    cy.location('search').should('contain', 'cell=c4');
  });
  it('resumes the selected artifact when media loading was cancelled by returning to History', () => {
    let release: (() => void) | undefined;
    cy.window().then((win) => {
      const fetch = win.fetch.bind(win);
      let first = true;
      cy.stub(win, 'fetch').callsFake((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('format=media') && first) {
          first = false;
          return new Promise<Response>((resolve) => {
            release = () => resolve(Response.json(saved));
          });
        }
        return fetch(input, init);
      });
    });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.wait('@run');
    cy.get('[aria-label="CI run"]').should('contain', '#123');
    cy.contains('button', 'Performance history').click();
    cy.then(() => release?.());
    cy.get('[data-testid="video-history-observation"]').should('have.length', 3);
    cy.contains('button', 'Performance history').should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', 'Videos & result').click();
    cy.get('[data-testid="serving-selected-metrics"]').should('be.visible');
    cy.get('@media.all').should('have.length', 1);
    cy.get('@recent.all').should('have.length', 0);
  });
});
