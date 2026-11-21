// @test-environment jsdom
import { readFileSync } from 'node:fs';

import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { afterEach, describe, expect, it, vi } from 'bun:test';

import { ThemeProvider } from '@/components/ui/theme-provider';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { APP_THEMES } from '@/lib/themes/themes';
import {
  $,
  $$,
  click,
  contains,
  dispatch,
  eventually,
  fakeLayout,
  findContaining,
  get,
  intercept,
  isVisible,
  observeRequests,
  render,
  select,
  type FetchRoute,
  type InterceptedRequest,
} from '@/test/dom';
import { withProviders } from '@/test/mock-providers';

import retainedHistory from '../../../cypress/fixtures/api/video-history.json';
import { servingArtifact } from '../../../cypress/support/video-artifacts';
import type { VideoHistoryObservation, VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';
import { readVideoLink, videoSearch } from './page-search';
import { videoPoints } from './points';
import { parseResultsState } from './results';
import type { ResultsEvidence } from './results-evidence';
import VideoDashboard from './VideoDashboard';

// Every video request must be a read; media is never published from here.
let videoRequests: InterceptedRequest[] = [];
afterEach(() => {
  for (const request of videoRequests) {
    expect(request.method).toBe('GET');
    expect(request.url.searchParams.get('format')).not.toBe('media');
  }
  videoRequests = [];
});

function readOnlyVideoRequests() {
  observeRequests((request) => {
    if (request.url.pathname === '/api/video-runs') videoRequests.push(request);
  });
  intercept('GET', '/api/video-runs?run=*', { status: 204 });
}

/** A clone of the retained metadata; mutations are test data, not benchmark evidence. */
function resultHistory(edit?: (observation: VideoHistoryObservation) => void): VideoHistoryPage {
  const page = structuredClone(retainedHistory) as unknown as VideoHistoryPage;
  for (const entry of page.entries)
    for (const source of entry.sources)
      for (const observation of source.observations) edit?.(observation);
  return page;
}

let remount = () => {};
/** Opens `search` as a link: the page reads the address bar when it mounts. */
const openLink = (search: string) => {
  window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  remount();
};

async function mount({
  pathname = '/vgx',
  search = '?r_y=videosPerGpuHour',
  edit,
  editPage,
  theme,
}: {
  pathname?: string;
  search?: string;
  edit?: (observation: VideoHistoryObservation) => void;
  editPage?: (page: VideoHistoryPage) => void;
  theme?: 'light' | 'dark';
} = {}): Promise<FetchRoute> {
  if (theme) localStorage.setItem('theme', theme);
  // The Cypress viewport was 1280 px wide; the chart sizes itself from its container.
  fakeLayout(1280, 600);
  readOnlyVideoRequests();
  const page = resultHistory(edit);
  editPage?.(page);
  const history = intercept('GET', '/api/video-runs?format=history&page=1*', { body: page });
  // Settings outlive a mount, so another link is read first and each test's link is new.
  window.history.replaceState(null, '', `${window.location.pathname}?previous-test`);
  readVideoLink();
  window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  const dashboard = (
    <PathnameContext.Provider value={pathname}>
      <VideoDashboard />
    </PathnameContext.Provider>
  );
  remount = () =>
    render(
      withProviders(
        theme ? (
          <ThemeProvider
            attribute="class"
            defaultTheme={theme}
            enableSystem={false}
            themes={APP_THEMES}
          >
            {dashboard}
          </ThemeProvider>
        ) : (
          dashboard
        ),
      ),
    );
  remount();
  await eventually(() => expect(history.calls.length).toBeGreaterThan(0));
  await eventually(() => expect(isVisible($('[data-testid="video-results"]'))).toBe(true));
  return history;
}

const points = (selector = '') => $$(`[data-testid="video-results-chart"] .dot-group${selector}`);
const hardwarePoints = (hardware: string) => points(`[data-hardware="${hardware}"]`);
const offStage = (hardware: string) =>
  hardwarePoints(hardware).filter((point) => !Object.hasOwn(point.dataset, 'clipRole'));
const playing = () => points('[data-clip-role="playing"]');
const clipVideo = () => $('[data-testid="video-results-clip"][data-hardware="b200"] video');
const previousRun = () =>
  get('[data-testid="results-run-context"] button[aria-label="Previous run"]');
/** The streamed dashboard replaces the pending shell, so an edit made in it would be lost. */
const focusFirstControl = (focusable: boolean) => {
  const button = get<HTMLButtonElement>('[data-testid="video-results"] button');
  button.focus();
  expect(document.activeElement === button).toBe(focusable);
};
/** d3 keeps each point's datum on its node. */
const datum = <T,>(node: Element) => (node as unknown as { __data__: T }).__data__;
const gpusOf = (node: Element) =>
  datum<{ cell: { point: VideoPoint } }>(node).cell.point.participating;
const config = () => get<HTMLSelectElement>('[data-testid="video-results-config"]');
const against = () => get<HTMLSelectElement>('[data-testid="video-results-against"]');
const stagePill = (side: 'a' | 'b') =>
  get(`[data-side="${side}"] [data-testid="video-results-pill"]`);
const text = (selector: string) => get(selector).textContent ?? '';
const enter = (node: Element) => dispatch(node, new MouseEvent('mouseenter'));
const leave = (node: Element) => dispatch(node, new MouseEvent('mouseleave'));
const shape = (node: Element) => get('.visible-shape', node);
const openPoint = async (hardware: string, overlay = false) => {
  click(
    await eventually(() =>
      get(
        `[data-testid="video-results-chart"] .dot-group[data-hardware="${hardware}"][data-overlay="${overlay}"] .visible-shape`,
      ),
    ),
  );
  click(
    await eventually(() =>
      get('[data-testid="point-details-panel"] [data-action="view-telemetry"]'),
    ),
  );
};
const toggleHardware = (hardware: string) => click(get(`label[for="checkbox-${hardware}"]`));
const chooseEngine = (label: string) =>
  click(contains('button', label, get('[data-testid="results-engine"]')));
const plottedY = (hardware: string) =>
  datum<{ y: number }>(points(`[data-hardware="${hardware}"][data-overlay="false"]`)[0]).y;
const chooseOption = async (selector: string, option: string) => {
  click(get(selector));
  click(await eventually(() => contains('[data-select-option]', option)));
};
/** A key of the page's in-memory settings, which Share turns into a link. */
const searchParam = (key: string) => new URLSearchParams(videoSearch()).get(key);

const B200_RUN = '34341996789';
const FRAME = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>')}`;
/** Leaves the B200 run unapproved on a workload no approved source publishes. */
const namedOnlyWorkload = (page: VideoHistoryPage) => {
  const entry = page.entries.find((item) => item.runId === B200_RUN)!;
  entry.approved = false;
  let namedWorkload = '';
  for (const source of entry.sources)
    for (const observation of source.observations) {
      const workload = JSON.parse(observation.workloadKey!);
      workload.plan.cases[0].seed += 1;
      observation.workloadKey = JSON.stringify(workload);
      if (observation.concurrency === 1) namedWorkload = observation.id;
    }
  return namedWorkload;
};

/**
 * Adds 1-, 2- and 8-GPU points to the B200 run, drawn and playable but neither its lead nor where
 * the stage opens: 1 and 2 GPUs are slower but more efficient, 8 GPUs is the fastest, costliest
 * end. Serves the run's published clips with first frames. Returns the read's route and URL.
 */
interface FrontierRead {
  route: FetchRoute;
  read: string;
}
const b200Frontier = (page: VideoHistoryPage, frame = FRAME): FrontierRead => {
  for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
  const source = page.entries.find((entry) => entry.runId === B200_RUN)!.sources[0];
  const lead = source.observations.find((observation) => observation.concurrency === 1)!;
  for (const [gpus, p50] of [
    [1, 300],
    [2, 150],
    [8, 40],
  ])
    source.observations.push({ ...lead, id: `${lead.id}-g${gpus}`, participating: gpus, p50 });
  const point = videoPoints([page]).find((item) => item.id === lead.id)!;
  const saved = servingArtifact(Number(B200_RUN), point.artifactId, 'NVIDIA B200');
  saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
    path,
    path === 'manifest.json' ? lead.id.split(':')[0] : sha,
  ]);
  saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
    path,
    { ...asset, posterUrl: frame },
  ]);
  const read = `/api/video-runs?run=${B200_RUN}&artifact=${point.artifactId}&format=published`;
  return { route: intercept('GET', read, { body: saved }), read };
};

/** Adds an unapproved re-export of the B200 run, so the official B200 line stays drawn. */
const NAMED_RUN = '90000000003';
const addNamedRun = (page: VideoHistoryPage) => {
  const named = structuredClone(page.entries.find((entry) => entry.runId === B200_RUN)!);
  named.runId = NAMED_RUN;
  named.artifact.id = 99993;
  named.approved = false;
  // Distinct observation IDs, so neither copy displaces the other's points.
  for (const source of named.sources)
    for (const observation of source.observations) observation.id = `named-${observation.id}`;
  page.entries.unshift(named);
};

const evidence = (observation: VideoHistoryObservation): ResultsEvidence => ({
  workloadHash: 'a'.repeat(64),
  manifestHash: observation.id.split(':')[0],
  verified: true,
  engine: 'sglang',
  mode: 't2v',
  attempted: 20,
  notStarted: 0,
  latencies: Array.from({ length: 20 }, (_, index) => 70 + index * 0.5),
  clientP50: 75,
  powerValid: true,
  powerSamples: 2,
  peakPowerW: 3900,
  gpuMemoryMiB: null,
  warmupSeconds: 38.2,
  failures: { timeout: 0, oom: 0, engine: 0, transport: 0, other: 0 },
});

const engines = () => [...new Set(hardwarePoints('b200').map((group) => group.dataset.engine))];

describe('VideoGenX Results', () => {
  it('shows the loading state without reading History while the server streams the cohort', async () => {
    readOnlyVideoRequests();
    const history = intercept('GET', '/api/video-runs?format=history&page=*', {
      body: { schemaVersion: 1, entries: [], nextPage: null },
    });
    const initialData = { state: parseResultsState('?r_tier=r'), history: null, sides: {} };
    render(
      withProviders(
        <PathnameContext.Provider value="/vgx">
          <VideoDashboard initialData={initialData} pending />
        </PathnameContext.Provider>,
      ),
    );
    expect(get('[role="status"]').textContent).toContain('Loading video results');
    // The plot waits under a skeleton, never under the note for an empty selection.
    expect(isVisible(get('[data-testid="video-results-chart-skeleton"]'))).toBe(true);
    expect(text('[data-testid="video-results-chart"]')).not.toContain('No visible hardware');
    expect(isVisible(get('[data-testid="video-results"]'))).toBe(true);
    expect(history.calls).toHaveLength(0);
    focusFirstControl(false);
    render(
      withProviders(
        <PathnameContext.Provider value="/vgx">
          <VideoDashboard initialData={initialData} />
        </PathnameContext.Provider>,
      ),
    );
    await eventually(() => expect(history.calls.length).toBeGreaterThan(0));
    await eventually(() => focusFirstControl(true));
  });

  it('ignores retired controls and plots every named-run GPU count on either X axis', async () => {
    await mount({
      search:
        '?unofficialrun=34341996789&r_gpus=3&r_basis=allocated&r_x=p90&r_y=videosPerGpuHour&r_optimal=0',
      editPage: (page) => {
        const entry = page.entries.find((item) => item.runId === '34341996789')!;
        entry.approved = false;
        const source = entry.sources[0];
        const fourGpu = source.observations.find((observation) => observation.cell === 'c1')!;
        source.observations.push({
          ...structuredClone(fourGpu),
          id: 'two-gpu:c1',
          participating: 2,
          allocated: 2,
        });
      },
    });
    const consoleError = vi.spyOn(console, 'error');
    const overlay = '[data-hardware="b200"][data-overlay="true"]';
    expect($('[data-testid="results-table"]')).toBeNull();
    expect($('[data-testid="results-gpus"]')).toBeNull();
    expect($('[data-testid="results-cost-basis"]')).toBeNull();
    await eventually(() =>
      expect(text('[data-testid="video-results-chart"] .x-axis-label')).toContain('Median latency'),
    );
    await eventually(() => expect(points(overlay)).toHaveLength(2));
    // Same latency on half the boards doubles videos per GPU-hour, so the 4-GPU cell is dominated.
    expect(points(`${overlay}[data-optimal="false"]`)).toHaveLength(1);
    const values = points(overlay)
      .map((point) => datum<{ y: number }>(point).y)
      .toSorted((a, b) => a - b);
    expect(values[1]).toBeCloseTo(values[0] * 2, 9);
    click(get('[data-testid="results-x-metric"]'));
    const unmeasured = await eventually(() => text('[data-testid="results-x-unmeasured"]'));
    expect(unmeasured).toContain('Quality loss vs lossless (LPIPS)');
    expect(unmeasured).toContain('Peak GPU memory');
    click(contains('[data-select-option]', 'GPUs per deployment'));
    await eventually(() => expect(searchParam('r_x')).toBe('gpus'));
    await eventually(() =>
      expect(text('#video-results-chart-title')).toContain('vs. GPUs per deployment'),
    );
    await eventually(() =>
      expect(text('[data-testid="video-results-chart"] .x-axis-label')).toBe('GPUs per deployment'),
    );
    await eventually(() =>
      expect(
        points(overlay)
          .map((point) => datum<{ x: number }>(point).x)
          .toSorted(),
      ).toEqual([2, 4]),
    );
    expect(points(`${overlay}[data-optimal="false"]`)).toHaveLength(1);
    expect($('[data-testid="video-results-chart"] .dot-group .point-label')).toBeNull();
    expect(
      consoleError.mock.calls.some((args) => /Cannot update a component/u.test(String(args[0]))),
    ).toBe(false);
    click(get('label[for="video-results-optimal"]'));
    await eventually(() => {
      expect(points(overlay)).toHaveLength(1);
      expect(points(overlay)[0].dataset.optimal).toBe('true');
    });
    expect(searchParam('r_optimal')).toBeNull();
    for (const key of ['r_gpus', 'r_basis']) expect(searchParam(key)).toBeNull();
    enter(points(overlay)[0]);
    await eventually(() =>
      expect(text('[data-chart-tooltip="video-results-chart"] [data-hover-notice]')).toBe(
        '✕ #34341996789',
      ),
    );
    expect(text('[data-chart-tooltip="video-results-chart"]')).toContain('Median s');
    leave(points(overlay)[0]);
    toggleHardware('b200');
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(0));
    expect(points(overlay)).toHaveLength(0);
  });

  it('names the latency in the zh hover card, where the GPU axis title does not', async () => {
    await mount({ pathname: '/zh/vgx', search: '?r_x=gpus&r_y=videosPerGpuHour' });
    enter(
      await eventually(() =>
        get('[data-testid="video-results-chart"] .dot-group[data-hardware="b200"]'),
      ),
    );
    await eventually(() =>
      expect(text('[data-chart-tooltip="video-results-chart"]')).toContain('中位延迟 (s)'),
    );
  });

  it('shows a named unapproved run without an approved cohort and clears it without promotion', async () => {
    const history = await mount({
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour&r_view=side',
      editPage: (page) => {
        for (const entry of page.entries) entry.approved = false;
      },
    });
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('b200')) expect(point.dataset.overlay).toBe('true');
    });
    await eventually(() =>
      expect(text('[data-testid="video-results-clip"][data-hardware="b200"]')).toContain(
        'Unofficial run',
      ),
    );
    click(get('[data-testid="video-results-sources"] summary'));
    await eventually(() =>
      expect(text('[data-testid="video-results-sources"]')).toContain('No matching receipt'),
    );
    expect(points('[data-overlay="false"]')).toHaveLength(0);
    const requestCount = history.calls.length;
    click(get('[data-testid="results-overlay-dismiss"]'));
    await eventually(() => expect($('[data-testid="results-overlay"]')).toBeNull());
    expect(history.calls).toHaveLength(requestCount);
    expect(points()).toHaveLength(0);
    expect($('[data-testid="video-results-stage"]')).toBeNull();
    // Rewriting the results keys keeps the clip stage's own keys.
    expect(searchParam('r_view')).toBe('side');
  });

  it('shows a lossy named run’s clip, which leads no card, in the overlay color', async () => {
    await mount({
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour',
      editPage: (page) => {
        for (const entry of page.entries) {
          const named = entry.runId === '34341996789';
          if (named) entry.approved = false;
          for (const observation of entry.sources[0].observations)
            observation.results = {
              ...evidence(observation),
              optimizations: named ? ['first-block-cache'] : [],
            };
        }
      },
    });
    const clip = await eventually(() => {
      const found = get('[data-testid="video-results-clip"][data-hardware="b200"]');
      expect(found.textContent).toContain('Unofficial run');
      return found;
    });
    for (const dot of $$('[data-testid="video-results-pill"] .rounded-full', clip))
      expect(dot.getAttribute('style')).toContain(overlayRunColor(0));
    expect($$('[data-testid="video-results-pill"] .rounded-full', clip).length).toBeGreaterThan(0);
  });

  it('opens a link that names only a run on the workload that run measured', async () => {
    const search = '?unofficialRun=34341996789&r_y=videosPerGpuHour';
    await mount({ search, editPage: namedOnlyWorkload });
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('b200')) expect(point.dataset.overlay).toBe('true');
    });
    expect(hardwarePoints('h200')).toHaveLength(0);
    // A workload only the run publishes has no model slug, so the link carries a point ID.
    await eventually(() => expect(searchParam('r_workload')).toMatch(/:c1$/u));
    click(get('[data-testid="results-overlay-dismiss"]'));
    await eventually(() => {
      expect(hardwarePoints('h200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('h200')) expect(point.dataset.overlay).toBe('false');
    });
    expect(searchParam('r_workload')).toBeNull();
    // The dismissed run no longer holds the page, so its link opens on its workload again.
    openLink(search);
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('b200')) expect(point.dataset.overlay).toBe('true');
      expect(hardwarePoints('h200')).toHaveLength(0);
    });
  });

  it('keeps a workload picked after a run link opened it, when the served page mounts again', async () => {
    const search = '?unofficialRun=34341996789&r_y=videosPerGpuHour';
    let page!: VideoHistoryPage;
    await mount({
      search,
      editPage: (history) => {
        namedOnlyWorkload(history);
        page = history;
      },
    });
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('b200')) expect(point.dataset.overlay).toBe('true');
    });
    click(get('#results-workload'));
    click(await eventually(() => get('[role="option"]:not([aria-selected="true"])')));
    await eventually(() => {
      expect(hardwarePoints('h200').length).toBeGreaterThan(0);
      expect(hardwarePoints('b200')).toHaveLength(0);
    });
    // A language switch mounts the page again, and the server hands it the link's settings and
    // History, so the run is known on the first render.
    render(
      withProviders(
        <PathnameContext.Provider value="/zh/vgx">
          <VideoDashboard
            initialData={{
              state: parseResultsState(search),
              history: { pages: [page], replay: false },
              sides: {},
            }}
          />
        </PathnameContext.Provider>,
      ),
    );
    await eventually(() => {
      expect(hardwarePoints('h200').length).toBeGreaterThan(0);
      expect(hardwarePoints('b200')).toHaveLength(0);
    });
  });

  it('restores the approved workload after dismissing an explicitly selected named-only workload', async () => {
    let sourceId = '';
    await mount({
      // The link's own workload wins over the one the named run measured.
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour&r_workload=minimax-h3',
      editPage: (page) => {
        sourceId = namedOnlyWorkload(page);
      },
    });
    await eventually(() => expect(hardwarePoints('h200').length).toBeGreaterThan(0));
    openLink(`?unofficialrun=34341996789&r_y=videosPerGpuHour&r_workload=${sourceId}`);
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('b200')) expect(point.dataset.overlay).toBe('true');
      expect(hardwarePoints('h200')).toHaveLength(0);
    });
    click(get('[data-testid="results-overlay-dismiss"]'));
    await eventually(() => {
      expect(hardwarePoints('h200').length).toBeGreaterThan(0);
      for (const point of hardwarePoints('h200')) expect(point.dataset.overlay).toBe('false');
      expect(hardwarePoints('b200')).toHaveLength(0);
    });
    expect(searchParam('r_workload')).toBeNull();
    expect(window.location.search).not.toContain('unofficialrun');
  });

  it('switches between approved models from the benchmark config', async () => {
    await mount({
      // A filter left over from the previous workload must not hide the next one.
      search: '?r_y=videosPerGpuHour&r_steps=50',
      editPage: (page) => {
        const entry = page.entries.find((item) => item.runId === B200_RUN)!;
        for (const source of entry.sources)
          for (const observation of source.observations) {
            const workload = JSON.parse(observation.workloadKey!);
            workload.plan.model_id = 'Wan-AI/Wan2.2-T2V-A14B-Diffusers';
            workload.plan.generation.num_inference_steps = 40;
            observation.workloadKey = JSON.stringify(workload);
          }
      },
    });
    await eventually(() => expect(hardwarePoints('h200').length).toBeGreaterThan(0));
    expect(hardwarePoints('b200')).toHaveLength(0);
    expect(isVisible(get('[data-testid="results-benchmark-config"]'))).toBe(true);
    expect(text('#results-workload')).toContain('MiniMaxAI/MiniMax-H3');
    click(get('#results-workload'));
    click(await eventually(() => contains('[role="option"]', 'Wan-AI/Wan2.2-T2V-A14B-Diffusers')));
    await eventually(() => {
      expect(hardwarePoints('b200').length).toBeGreaterThan(0);
      expect(hardwarePoints('h200')).toHaveLength(0);
    });
    await eventually(() =>
      expect(text('#video-results-chart-title')).toContain('Wan-AI/Wan2.2-T2V-A14B-Diffusers'),
    );
    expect(searchParam('r_workload')).toBe('wan2.2-t2v-a14b-diffusers');
    expect(searchParam('r_steps')).toBeNull();
  });

  it('opens the named re-export, not the official cell, when both share an observation ID', async () => {
    const namedRun = '90000000001';
    let approvedMedia!: FetchRoute;
    let namedMedia!: FetchRoute;
    await mount({
      editPage: (page) => {
        const original = page.entries.find((entry) => entry.runId === '34341996789')!;
        const reexport = structuredClone(original);
        reexport.runId = namedRun;
        reexport.artifact.id = 99991;
        reexport.approved = false;
        page.entries.unshift(reexport);
        const point = videoPoints([page]).find(
          (item) => item.hardwareKey === 'b200' && item.concurrency === 1,
        )!;
        const saved = servingArtifact(Number(point.runId), point.artifactId, 'NVIDIA B200');
        saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
          path,
          path === 'manifest.json' ? point.id.split(':')[0] : sha,
        ]);
        intercept('GET', 'https://media.test/*', {
          body: new Uint8Array(readFileSync('cypress/fixtures/video-results/candidate.mp4')),
          headers: { 'Content-Type': 'video/mp4' },
        });
        approvedMedia = intercept(
          'GET',
          `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=published`,
          { body: saved },
        );
        namedMedia = intercept(
          'GET',
          `/api/video-runs?run=${namedRun}&artifact=99991&format=published`,
          { status: 204 },
        );
      },
    });
    await eventually(() => expect(approvedMedia.calls.length).toBeGreaterThan(0));
    await eventually(() => expect(clipVideo()).not.toBeNull());
    openLink(`?unofficialrun=${namedRun}&r_y=videosPerGpuHour`);
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(2));
    await eventually(() => expect(namedMedia.calls.length).toBeGreaterThan(0));
    await eventually(() => expect(clipVideo()).toBeNull());
    await openPoint('b200', true);
    await eventually(() =>
      expect(searchParam('r_point')).toMatch(new RegExp(`^${namedRun}:`, 'u')),
    );
    await eventually(() =>
      expect(text('[data-testid="video-results-detail"] h1')).toContain('B200'),
    );
    expect(text('[data-testid="video-results-detail"]')).toContain(`Unofficial run #${namedRun}`);
    click(get('[data-testid="results-detail-tab-sources"]'));
    await eventually(() => {
      const detail = text('[data-testid="video-results-detail"]');
      expect(detail).toContain(namedRun);
      expect(detail).toContain('99991');
      expect(detail).toContain('No matching approval receipt');
    });
    click(get('[data-testid="results-detail-back"]'));
    // The remounted chart first draws the point pinned before the detail view, enlarged, and
    // binds its click handlers on the next display pass, which also restores resting radii.
    await eventually(() => {
      const radii = hardwarePoints('b200').map((point) => shape(point).getAttribute('r'));
      expect(radii).toHaveLength(2);
      expect(new Set(radii).size).toBe(1);
    });
    await openPoint('b200');
    click(await eventually(() => get('[data-testid="results-detail-tab-sources"]')));
    await eventually(() => {
      const detail = text('[data-testid="video-results-detail"]');
      expect(detail).toContain('34341996789');
      expect(detail).not.toContain(namedRun);
    });
    click(get('[data-testid="results-detail-back"]'));
    toggleHardware(await eventually(() => (get('label[for="checkbox-b200"]'), 'b200')));
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(0));
    toggleHardware('b200');
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(2));
    // One read per mount: `openLink` mounted the page again. Dismiss reads no more.
    expect(approvedMedia.calls).toHaveLength(2);
    click(get('[data-testid="results-overlay-dismiss"]'));
    await eventually(() => expect(clipVideo()).not.toBeNull());
    expect(approvedMedia.calls).toHaveLength(2);
    await eventually(() => {
      expect(hardwarePoints('b200')).toHaveLength(1);
      expect(hardwarePoints('b200')[0].dataset.overlay).toBe('false');
    });
  });

  it('applies the sample floor, preserves unknown allocation and drops every planned placeholder', async () => {
    await mount({
      edit: (observation) => {
        if (observation.hardware.includes('H100')) {
          observation.samples = 9;
          observation.valid = 9;
        }
        if (observation.hardware.includes('H200')) observation.allocated = null;
      },
    });
    expect(text('[data-testid="results-how-to-read"] h2')).toBe('How to read these results');
    expect($('details[data-testid^="results-"] > summary h2')).toBeNull();
    expect(text('[data-testid="results-not-measured"]')).toContain('LoRA switch time');
    expect($('[data-testid="results-empty"][data-state="planned"]')).toBeNull();
    await eventually(() => expect(points()).toHaveLength(2));
    expect(hardwarePoints('h100')).toHaveLength(0);
    expect($('#checkbox-h100')).toBeNull();
    click(
      get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"] .visible-shape'),
    );
    // An unrecorded allocation shows only the GPUs used, not a dangling "of —".
    await eventually(() => {
      const setup = text('[data-slot="point-details-setup"]');
      expect(setup).toContain('GPUs');
      expect(setup).not.toContain(' of ');
    });
    const tco = text('[data-testid="results-tco-table"]');
    expect(tco).toContain('B200');
    expect(tco).not.toContain('MI355X');
    expect(text('[data-testid="results-tco-rate"]')).toBe('1.73');
    await chooseOption('[data-testid="results-cost-tier"]', 'Rent – 3-Year Commit');
    await eventually(() => expect(searchParam('r_tier')).toBe('r'));
    await eventually(() => expect(text('[data-testid="results-tco-rate"]')).toBe('3.70'));
  });

  it('views results as of an earlier run and compares a chip config over time', async () => {
    await mount({
      search: '?r_y=videosPerGpuHour',
      // Retained projections predate the output-seconds rate that prices a video-second.
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
      },
      editPage: (page) => {
        for (const entry of page.entries)
          if (entry.runId === '34341996789') entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    await eventually(() => expect(text('#run-select')).toContain('Run 3/3'));
    await eventually(() => expect(points()).toHaveLength(3));
    click(previousRun());
    await eventually(() => expect(text('#run-select')).toContain('Run 2/3'));
    expect(searchParam('r_run')).toBe('34341996789');
    await eventually(() => expect(points('[data-hardware="h200"]')).toHaveLength(0));
    expect(points()).toHaveLength(2);
    click(get('[data-testid="results-run-context"] button[aria-label="Next run"]'));
    await eventually(() => expect(text('#run-select')).toContain('Run 3/3'));
    await eventually(() => expect(points()).toHaveLength(3));
    click(get('[data-testid="results-chip-config"]'));
    click(await eventually(() => contains('[role="option"]', 'B200 · 4 GPU · TP2 × Ulysses 2')));
    await eventually(() => expect(searchParam('r_configs')).toBe('b200:na:4g:tp2:u2'));
    await eventually(() => expect(points()).toHaveLength(1));
    expect(points('[data-hardware="b200"]')[0].textContent).toContain('2026-09-09');
    expect(text('[data-testid="results-compare-history"]')).toContain('Comparison Date Range');
    // Run 1/3 predates B200, so its history point lies outside the as-of cells yet still opens.
    click(previousRun());
    await eventually(() => expect(text('#run-select')).toContain('Run 2/3'));
    click(previousRun());
    await eventually(() => expect(text('#run-select')).toContain('Run 1/3'));
    click(
      await eventually(() =>
        get('[data-testid="video-results-chart"] .dot-group[data-hardware="b200"] .visible-shape'),
      ),
    );
    // The stage plays that history point, and its TCO comes from the history cell too.
    await eventually(() => expect(searchParam('r_clip')).toMatch(/^34341996789:/u));
    await eventually(() =>
      expect(text('[data-testid="video-results-readout"] [data-metric="cost"] dd')).toMatch(
        /^\$\d/u,
      ),
    );
    click(get('[data-testid="point-details-panel"] [data-action="view-telemetry"]'));
    await eventually(() =>
      expect(text('[data-testid="video-results-detail"] h1')).toContain('B200'),
    );
    expect(searchParam('r_point')).toMatch(/^34341996789:/u);
  });

  it('plots the selected Y metric with participating GPUs and median latency', async () => {
    await mount({
      search: '?r_basis=allocated',
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
      },
    });
    expect(text('#video-results-chart-title')).toContain(
      'Video-seconds per $1 TCO vs. Median latency per clip',
    );
    await eventually(() =>
      expect(text('[data-testid="video-results-chart"] .x-axis-label')).toBe(
        'Median latency per 8 s clip at 24 fps (s)',
      ),
    );
    // B200 reserves eight boards, but only the four participating boards are charged.
    await eventually(() =>
      expect(Math.abs(plottedY('b200') - 400 / (4 * 1.73))).toBeLessThan(1e-9),
    );
    await chooseOption('[data-testid="results-y-metric"]', 'GPU energy per valid clip (kJ)');
    await eventually(() => expect(searchParam('r_y')).toBe('kjPerClip'));
    await eventually(() =>
      expect(text('#video-results-chart-title')).toContain('GPU energy per valid clip'),
    );
    await eventually(() => expect(Math.abs(plottedY('b200') - 301.1)).toBeLessThanOrEqual(0.1));
  });

  it('plots each GPU’s best lossless engine or one engine, and asks before showing two', async () => {
    // Every deployment also ran on vLLM-Omni with identical numbers and on Sol with caching.
    await mount({
      editPage: (page) => {
        for (const entry of page.entries)
          for (const source of entry.sources)
            source.observations = source.observations.flatMap((observation) => [
              { ...observation, results: evidence(observation) },
              {
                ...observation,
                id: `${observation.id}-vllm`,
                results: { ...evidence(observation), engine: 'vllm-omni' },
              },
              {
                ...observation,
                id: `${observation.id}-sol`,
                results: {
                  ...evidence(observation),
                  engine: 'sol-engine',
                  optimizations: ['first-block-cache', 'sol-attn'],
                },
              },
            ]);
      },
    });
    // A tie keeps the engine listed first; the cached Sol run never competes.
    await eventually(() => expect(engines()).toEqual(['sglang']));
    expect(text('label[for="checkbox-b200"]')).toContain('B200 (SGLang)');
    // Best or one engine: no option draws every engine at once.
    expect(findContaining('button', /^All$/u, get('[data-testid="results-engine"]'))).toBeNull();
    chooseEngine('vLLM-Omni');
    await eventually(() => expect(searchParam('r_engine')).toBe('vllm-omni'));
    await eventually(() => expect(engines()).toEqual(['vllm-omni']));
    chooseEngine('Best');
    await eventually(() => expect(engines()).toEqual(['sglang']));
    expect($('[data-testid="results-lossy-key"]')).toBeNull();
    // The lossy Sol line beside SGLang puts two engines on one GPU, so it asks first.
    click(get('#video-results-lossy'));
    click(
      await eventually(() =>
        contains('button', 'Cancel', get('[data-testid="engine-comparison-confirmation"]')),
      ),
    );
    await eventually(() => expect(searchParam('r_lossy')).toBeNull());
    click(get('#video-results-lossy'));
    click(
      await eventually(() =>
        contains(
          'button',
          'I agree, show both',
          get('[data-testid="engine-comparison-confirmation"]'),
        ),
      ),
    );
    await eventually(() => expect(searchParam('r_lossy')).toBe('1'));
    await eventually(() => expect(engines()).toEqual(['sglang', 'sol-engine']));
    expect(text('[data-testid="results-lossy-key"]')).toContain(
      'B200 (NVIDIA Sol Engine · FirstBlockCache + Sol-Attn)',
    );
    // A lossy line's pill is a dashed outline, named by its optimisations.
    const lossyPills = $$('[data-series-pill][data-lossy="true"]');
    expect(lossyPills.length).toBeGreaterThanOrEqual(1);
    expect(lossyPills[0].textContent).toContain('B200 · ');
    const outline = get('rect', lossyPills[0]);
    expect(outline.getAttribute('stroke-dasharray')).toBe('3 2');
    expect(outline.getAttribute('fill')).toBe('var(--card)');
  });

  it('plays the config picked in the Compare row against its default pairing', async () => {
    // No run stored clips; the row and its pairing still follow the pick.
    intercept('GET', '/api/video-runs*', { status: 204 });
    await mount({
      search: '?r_y=videosPerGpuHour&r_lossy=1',
      editPage: (page) => {
        for (const entry of page.entries) {
          entry.publishedAt = '2026-11-01T00:00:00.000Z';
          for (const source of entry.sources)
            source.observations = source.observations.flatMap((observation) => [
              { ...observation, results: evidence(observation) },
              {
                ...observation,
                id: `${observation.id}-fbc`,
                results: { ...evidence(observation), optimizations: ['first-block-cache'] },
              },
            ]);
        }
      },
    });
    // The first select picks what plays, and the second follows it.
    select(await eventually(() => config()), 'h200');
    await eventually(() => expect(playing()[0]?.dataset.hardware).toBe('h200'));
    await eventually(() => expect(searchParam('r_clip')).toMatch(/^34342452354:[^-]+$/u));
    await eventually(() => expect(against().value).toBe('reference'));
    await eventually(() => expect(stagePill('b').textContent).toContain('Diffusers reference'));
    expect(text('[data-testid="video-results-compare"]')).toContain('compare');
    // A click on the playing point keeps the reader's pairing.
    select(against(), 'h100');
    click(shape(playing()[0]));
    await eventually(() => expect(against().value).toBe('h100'));
    // A lossy config pairs with its lossless twin.
    select(config(), get<HTMLOptionElement>('option[value^="h200+"]', config()).value);
    await eventually(() => expect(searchParam('r_clip')).toMatch(/^34342452354:.+-fbc$/u));
    await eventually(() => expect(against().value).toBe('twin'));
    await eventually(() => {
      expect(stagePill('b').textContent).toContain('H200');
      expect(stagePill('b').textContent).toContain('lossless');
    });
  });

  it('pairs an unofficial run with the official cell of the same deployment', async () => {
    await mount({
      search: `?unofficialrun=${NAMED_RUN}&r_y=videosPerGpuHour`,
      editPage: (page) => {
        b200Frontier(page);
        addNamedRun(page);
        // Without its lead's deployment the named run opens on another of its GPU counts.
        const named = page.entries.find((entry) => entry.runId === NAMED_RUN)!.sources[0];
        named.observations = named.observations.filter((item) => /-g\d+$/u.test(item.id));
      },
    });
    await eventually(() => expect(playing()[0]?.dataset.overlay).toBe('true'));
    // The row names which B200 plays, so it never reads "B200 compare B200 official".
    await eventually(() =>
      expect(config().selectedOptions[0]?.textContent).toBe('B200 · unofficial run'),
    );
    await eventually(() => expect(against().value).toBe('b200'));
    await eventually(() =>
      expect(points('[data-clip-role="baseline"]')[0]?.dataset.overlay).toBe('false'),
    );
    const [first, second] = points('[data-clip-role]').map(gpusOf);
    // The baseline plays the same deployment.
    expect(second).toBe(first);
  });

  it('opens and pairs B200 on the middle of its frontier, not its most efficient end', async () => {
    await mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        b200Frontier(page);
      },
    });
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(4));
    await eventually(() => {
      expect(stagePill('a').textContent).toContain('4 GPUs');
      expect(get('b', stagePill('a')).textContent).toBe('B200 · SGLang');
    });
    // Compared with another GPU, B200 plays the deployment the first select plays for it.
    select(config(), 'h100');
    await eventually(() =>
      expect([...against().options].some((option) => option.value === 'b200')).toBe(true),
    );
    select(against(), 'b200');
    await eventually(() => expect(gpusOf(points('[data-clip-role="baseline"]')[0])).toBe(4));
  });

  it('shows a point’s first frame in its hover card, reading clips the pointer rests on', async () => {
    let frontier!: FrontierRead;
    await mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        frontier = b200Frontier(page);
      },
    });
    await eventually(() =>
      expect($('[data-testid="video-results-clip"][data-hardware="b200"] video')).not.toBeNull(),
    );
    const tooltip = '[data-chart-tooltip="video-results-chart"]';
    // The playing point's clips were read with the stage, so its card needs no second read.
    let before = frontier.route.calls.length;
    enter(playing()[0]);
    await eventually(() =>
      expect(get(`${tooltip} [data-hover-image]`).getAttribute('src')).toBe(FRAME),
    );
    expect(frontier.route.calls).toHaveLength(before);
    leave(playing()[0]);
    // H100's read answered without media, so its card keeps text only.
    enter(hardwarePoints('h100')[0]);
    await eventually(() => expect(text(tooltip)).toContain('H100'));
    await eventually(() => expect($(`${tooltip} [data-hover-image]`)).toBeNull());
    leave(hardwarePoints('h100')[0]);
    before = frontier.route.calls.length;
    enter(offStage('b200')[0]);
    // The card keeps the frame's box while the point's clips are read.
    await eventually(() => expect($(`${tooltip} [data-hover-image-pending]`)).not.toBeNull());
    await eventually(() =>
      expect(get(`${tooltip} [data-hover-image]`).getAttribute('src')).toBe(FRAME),
    );
    expect(frontier.route.calls).toHaveLength(before + 1);
    // A read that fails closes the box instead of leaving the card waiting.
    leave(offStage('b200')[0]);
    const failed = intercept('GET', frontier.read, { status: 500 });
    enter(offStage('b200')[1]);
    await eventually(() => expect($(`${tooltip} [data-hover-image-pending]`)).not.toBeNull());
    await eventually(() => expect(failed.calls.length).toBeGreaterThan(0));
    await eventually(() => {
      expect(text(tooltip)).toContain('B200');
      expect($(`${tooltip} [data-hover-media]`)).toBeNull();
    });
  });

  it('pulses playable points until the first clip is picked', async () => {
    await mount({
      editPage: (page) => {
        for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    await eventually(() => expect($('[data-clip-role="playing"]')).not.toBeNull());
    await eventually(() =>
      expect(
        points('[data-clips="true"]:not([data-clip-role])').flatMap((point) =>
          $$('.video-clip-pulse', point),
        ).length,
      ).toBeGreaterThanOrEqual(1),
    );
    expect(
      points('[data-clip-role]').flatMap((point) => $$('.video-clip-pulse', point)),
    ).toHaveLength(0);
    expect(
      points('[data-clips="false"]').flatMap((point) => $$('.video-clip-pulse', point)),
    ).toHaveLength(0);
    click(
      get('[data-testid="video-results-chart"] .dot-group[data-hardware="h200"] .visible-shape'),
    );
    await eventually(() =>
      expect($('[data-testid="video-results-chart"] .video-clip-pulse')).toBeNull(),
    );
  });

  it('falls back to the overview for an unknown or hidden deployment and drops its key', async () => {
    await mount({ search: '?r_y=videosPerGpuHour&r_point=0:missing' });
    expect($('[data-testid="video-results-detail"]')).toBeNull();
    await eventually(() => expect(points()).toHaveLength(3));
    await eventually(() => expect(searchParam('r_point')).toBeNull());
    await eventually(() => expect(window.location.search).toBe('?r_y=videosPerGpuHour'));
    const point = datum<{ key: string }>(hardwarePoints('b200')[0]).key;
    openLink(`?r_point=${encodeURIComponent(point)}&r_y=videosPerGpuHour`);
    await eventually(() =>
      expect(text('[data-testid="video-results-detail"] h1')).toContain('B200'),
    );
    openLink(`?r_point=${encodeURIComponent(point)}&r_hidden=b200&r_y=videosPerGpuHour`);
    await eventually(() => expect($('[data-testid="video-results-detail"]')).toBeNull());
    await eventually(() => expect(hardwarePoints('b200')).toHaveLength(0));
    await eventually(() => expect(searchParam('r_point')).toBeNull());
    await eventually(() =>
      expect(window.location.search).toBe('?r_hidden=b200&r_y=videosPerGpuHour'),
    );
    toggleHardware('b200');
    await eventually(() => expect(hardwarePoints('b200').length).toBeGreaterThan(0));
    expect($('[data-testid="video-results-detail"]')).toBeNull();
  });
});
