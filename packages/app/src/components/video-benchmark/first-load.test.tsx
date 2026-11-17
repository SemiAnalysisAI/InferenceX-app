// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useClientSearch } from '@/hooks/useClientSearch';
import VideoResultsClips from './VideoResultsClips';
import { parseStage, writeStage } from './clip-stage';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import { referenceQualityFixture } from './reference-quality.fixture';
import { publishedResultsSide } from './results-clips';
import { useVideoPoints } from './use-video-points';
import { videoClipSourceKey } from './initial-data';
import { MOBILE_VIEWPORT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it.each([true, false])(
  'renders seeded points/media (available=%s) before effects and hydrates without refetching',
  async (available) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fixture = referenceQualityFixture(20);
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: '/retained.mp4', downloadUrl: '/retained.mp4' }],
    ];
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      entries: [videoHistoryEntry(fixture.stored, null)],
      nextPage: null,
    };
    const initial = { pages: [page], replay: true };
    const point = namedRunPoints(initial.pages, '123').find(
      (candidate) => candidate.cell === 'c1',
    )!;
    const side = publishedResultsSide(fixture.stored, point);
    const queryClient = new QueryClient();
    function InitialResults() {
      const { points, namedPoints, loading, replay } = useVideoPoints('123', initial);
      return (
        <QueryClientProvider client={queryClient}>
          <output>
            {JSON.stringify({
              official: points.length,
              named: namedPoints.length,
              loading,
              replay,
            })}
          </output>
          <VideoResultsClips
            points={[point]}
            initialSides={{ [videoClipSourceKey(point)]: available ? side : null }}
            colorFor={() => 'black'}
            against="reference"
            onAgainstChange={() => {}}
            onSubjectChange={() => {}}
            onShow={() => {}}
            reveal={0}
          />
        </QueryClientProvider>
      );
    }
    const html = renderToString(<InitialResults />);
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    for (const video of container.querySelectorAll('video')) {
      Object.defineProperty(video, 'readyState', { value: 4 });
      Object.defineProperty(video, 'duration', { value: 5 });
    }
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      available ? '/retained.mp4' : undefined,
    );
    if (available)
      expect(
        container.querySelector('video')?.getAttribute('preload'),
        'no media before Play',
      ).toBe('none');
    expect(container.querySelector('output')?.textContent).toBe(
      JSON.stringify({ official: 0, named: 3, loading: false, replay: true }),
    );
    const hydrationError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container!, <InitialResults />, { onRecoverableError: hydrationError });
      await Promise.resolve();
    });
    expect(hydrationError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="video-results-play"]')?.disabled,
    ).toBe(!available);
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      available ? '/retained.mp4' : undefined,
    );
  },
);

it('shows a newly read clip while another selected source is still pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const fast = referenceQualityFixture(20, '123', 7);
  const slow = referenceQualityFixture(20, '456', 8, 'b'.repeat(64), 'NVIDIA H100');
  const points = [fast, slow].map((fixture) => {
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: `/${fixture.stored.runId}.mp4`, downloadUrl: '/clip.mp4' }],
    ];
    return namedRunPoints(
      [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
      fixture.stored.runId,
    ).find((candidate) => candidate.cell === 'c1')!;
  });
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('run=123') ? Promise.resolve(Response.json(fast.stored)) : pending.promise,
    ),
  );
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <VideoResultsClips
          points={points}
          colorFor={() => 'black'}
          against="reference"
          onAgainstChange={() => {}}
          onSubjectChange={() => {}}
          onShow={() => {}}
          reveal={0}
        />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  expect(container.querySelectorAll('video')).toHaveLength(1);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/123.mp4');
  expect(container.textContent).toContain('Loading retained clips');
  await act(async () => {
    pending.resolve(Response.json(slow.stored));
    await pending.promise;
  });
  expect(container.querySelectorAll('video')).toHaveLength(1);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/123.mp4');
  expect(container.textContent).not.toContain('Loading retained clips');
});

it('holds the prompt row and stage with a skeleton while the subject is read', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const fixture = referenceQualityFixture(20);
  const point = namedRunPoints(
    [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
    fixture.stored.runId,
  ).find((candidate) => candidate.cell === 'c1')!;
  container = document.createElement('div');
  document.body.append(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      <VideoResultsClips
        points={[point]}
        colorFor={() => 'black'}
        against="reference"
        onAgainstChange={() => {}}
        onSubjectChange={() => {}}
        onShow={() => {}}
        reveal={0}
      />,
    );
  });
  expect(container.querySelector('[data-testid="video-results-clips-skeleton"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="video-results-stage"]')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Loading retained clips…');
});

it('waits for a newly wanted side before a reveal scrolls, even after an earlier read failed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const broken = referenceQualityFixture(20, '123', 7);
  const later = referenceQualityFixture(20, '456', 8, 'b'.repeat(64), 'NVIDIA H100');
  const points = [broken, later].map((fixture) => {
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: `/${fixture.stored.runId}.mp4`, downloadUrl: '/clip.mp4' }],
    ];
    return namedRunPoints(
      [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
      fixture.stored.runId,
    ).find((candidate) => candidate.cell === 'c1')!;
  });
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('run=123')
        ? Promise.resolve(new Response(null, { status: 500 }))
        : pending.promise,
    ),
  );
  const queryClient = new QueryClient();
  const render = (shown: typeof points, reveal: number) => (
    <QueryClientProvider client={queryClient}>
      <VideoResultsClips
        points={shown}
        colorFor={() => 'black'}
        against="reference"
        onAgainstChange={() => {}}
        onSubjectChange={() => {}}
        onShow={() => {}}
        reveal={reveal}
      />
    </QueryClientProvider>
  );
  container = document.createElement('div');
  document.body.append(container);
  try {
    await act(async () => {
      root = createRoot(container!);
      root.render(render([points[0]], 0));
      await Promise.resolve();
    });
    expect(container.textContent, 'the first read failed').toContain('Retry clips');
    await act(async () => {
      root!.render(render(points, 1));
      await Promise.resolve();
    });
    expect(scroll, 'no scroll while the new side is still being read').not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(Response.json(later.stored));
      await pending.promise;
    });
    expect(scroll).toHaveBeenCalledTimes(1);
  } finally {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
});

/** B200, H200 and H100 on one workload, each with one stored clip, and their read sides. */
function threeGpus() {
  const fixtures = [
    referenceQualityFixture(20, '789', 9, 'c'.repeat(64), 'NVIDIA B200'),
    referenceQualityFixture(20, '123', 7),
    referenceQualityFixture(20, '456', 8, 'b'.repeat(64), 'NVIDIA H100'),
  ];
  const sides: Record<string, ReturnType<typeof publishedResultsSide>> = {};
  const points = fixtures.map((fixture) => {
    const path = fixture.attachment.pairs[0].candidate.media_path;
    fixture.stored.sources[0].assets = [
      [path, { url: `/${fixture.stored.runId}.mp4`, downloadUrl: '/clip.mp4' }],
    ];
    const point = namedRunPoints(
      [{ schemaVersion: 1, entries: [videoHistoryEntry(fixture.stored, null)], nextPage: null }],
      fixture.stored.runId,
    ).find((candidate) => candidate.cell === 'c1')!;
    sides[videoClipSourceKey(point)] = publishedResultsSide(fixture.stored, point);
    return { ...point, publishedAt: '2026-01-01T00:00:00Z' };
  });
  return { fixtures, points, sides };
}

/** The dashboard's own wiring of the pair (`r_vs`) and the phone layout around the clips. */
function PhonePage({
  points,
  sides,
  guess,
  queryClient,
}: {
  points: ReturnType<typeof threeGpus>['points'];
  sides?: ReturnType<typeof threeGpus>['sides'];
  guess: boolean;
  queryClient: QueryClient;
}) {
  const against = parseStage(useClientSearch()).vs;
  const phone = useMediaQuery(MOBILE_VIEWPORT_QUERY, guess);
  return (
    <QueryClientProvider client={queryClient}>
      <VideoResultsClips
        points={points}
        initialSides={sides}
        colorFor={() => 'black'}
        phone={phone}
        against={against}
        onAgainstChange={(vs) => writeStage({ ...parseStage(location.search), vs })}
        onSubjectChange={() => {}}
        onShow={() => {}}
        reveal={0}
      />
    </QueryClientProvider>
  );
}

const pairing = () =>
  container?.querySelector<HTMLSelectElement>('[data-testid="video-results-against"]')?.value;
const screen = (narrow: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === MOBILE_VIEWPORT_QUERY && narrow,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

// The server renders with its guess of a phone and without the link's stage keys, and hydration
// repeats that render before the address and the screen are read.
it.each([
  { link: '', guess: true, narrow: true, search: '?r_vs=h200', shown: 'h200' },
  // A pair the link names is never overwritten by the phone's opening pair.
  {
    link: '?r_vs=reference',
    guess: true,
    narrow: true,
    search: '?r_vs=reference',
    shown: 'reference',
  },
  {
    link: '?r_vs=h100',
    guess: true,
    narrow: true,
    search: '?r_vs=h100',
    shown: 'h100',
  },
  // A wrong guess: a tablet whose User-Agent says Mobile ends on the default pair and a bare link.
  { link: '', guess: true, narrow: false, search: '', shown: 'reference' },
  // The other wrong guess: a narrow desktop window gets the phone's pair once it is measured.
  {
    link: '',
    guess: false,
    narrow: true,
    search: '?r_vs=h200',
    shown: 'h200',
  },
])(
  'names a phone\u2019s opening pair in the link only for a bare link on a narrow screen ($link, guess $guess, narrow $narrow)',
  async ({ link, guess, narrow, search, shown }) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { points, sides } = threeGpus();
    const queryClient = new QueryClient();
    const page = (
      <PhonePage points={points} sides={sides} guess={guess} queryClient={queryClient} />
    );
    // Only the user agent tells the server about the screen, so its guess decides the document.
    const html = renderToString(page);
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    expect(pairing(), 'the pair in the server document').toBe(guess ? 'h200' : 'reference');
    window.history.replaceState(null, '', `/vgx${link}`);
    screen(narrow);
    const hydrationError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container!, page, { onRecoverableError: hydrationError });
      await Promise.resolve();
    });
    expect(hydrationError).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
    expect(pairing()).toBe(shown);
  },
);

it('names the opening pair only once its clips are read, so never a side without any', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { fixtures, points } = threeGpus();
  // H200 is the first candidate, and its run turns out to have stored no clips.
  const h200 = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const stored = fixtures.find((fixture) =>
        url.includes(`run=${fixture.stored.runId}`),
      )!.stored;
      return stored.runId === '123' ? h200.promise : Promise.resolve(Response.json(stored));
    }),
  );
  screen(true);
  window.history.replaceState(null, '', '/vgx');
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(<PhonePage points={points} guess queryClient={new QueryClient()} />);
    await Promise.resolve();
  });
  expect(pairing(), 'the candidate still being read holds its place').toBe('h200');
  expect(window.location.search, 'nothing is named while it is read').toBe('');
  await act(async () => {
    h200.resolve(new Response(null, { status: 204 }));
    await h200.promise;
  });
  expect(pairing()).toBe('h100');
  expect(window.location.search).toBe('?r_vs=h100');
});
