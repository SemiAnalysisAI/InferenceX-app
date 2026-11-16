import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';
import { parseStage, writeStage } from '@/components/video-benchmark/clip-stage';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import type { ResultCell } from '@/components/video-benchmark/results';
import type { ResultsEvidence } from '@/components/video-benchmark/results-evidence';
import { absoluteFrameDifference } from '@/components/video-benchmark/results-clips';
import VideoResultsClips from '@/components/video-benchmark/VideoResultsClips';
import styles from '@/components/video-benchmark/results.module.css';
import history from '../fixtures/api/video-history.json';
import { servingArtifact } from '../support/video-artifacts';
import { mountWithProviders } from '../support/test-utils';
import { coarsePointer, phoneMedia, tapArea, touchScreen } from '../support/video-results';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';

// Retained H100/H200/B200 C1/C2/C4 observations; clips come from synthetic stored artifacts.
const points = videoPoints([history as unknown as VideoHistoryPage]);
// The retained native H200 run under the sample floor never becomes a side.
const cells = dashboardCells(points).cells;
const c1 = (key: string) => cells.find((p) => p.hardwareKey === key && p.concurrency === 1)!;
const COLORS: Record<string, string> = {
  h100: 'rgb(10, 20, 30)',
  h200: 'rgb(40, 50, 60)',
  b200: 'rgb(70, 80, 90)',
};
const colorFor = (key: string) => COLORS[key] ?? 'rgb(0, 0, 0)';

const mediaUrl = (point: VideoPoint) =>
  `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=published`;
const sideVideo = (side: 'a' | 'b') =>
  cy.get(`[data-testid="video-results-clip"][data-side="${side}"] video`);
const speaker = (side: 'a' | 'b') =>
  cy.get(`[data-side="${side}"] [data-testid="video-results-speaker"]`);
const scrub = (time: number) => {
  cy.window().then((win) => {
    cy.get('[data-testid="video-results-scrub"]').then(($input) => {
      const setValue = Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setValue.call($input[0], String(time));
      $input[0].dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  });
  cy.get('[data-testid="video-results-scrub"]').should('have.value', String(time));
};
/** Both sides, so a reloaded side cannot fall behind the group unnoticed. */
const expectClipsAt = (time: number) =>
  cy
    .get('[data-testid="video-results-stage"] video')
    .should('have.length', 2)
    .each(($video) =>
      cy
        .wrap($video)
        .should(($element) =>
          expect(($element[0] as HTMLVideoElement).currentTime).to.be.closeTo(time, 0.08),
        ),
    );
const expectAudio = (side: 'a' | 'b' | null) =>
  cy.get<HTMLVideoElement>('[data-testid="video-results-stage"] video').should(($videos) => {
    for (const video of $videos) {
      const role = video.closest<HTMLElement>('[data-side]')?.dataset.side;
      expect(video.muted, role).to.equal(role !== side);
    }
  });
/** The Wipe split, read from the baseline's clip-path: its right inset on the left, else its left inset. */
const splitOf = ($media: JQuery<HTMLElement>) => {
  const insets = /inset\((?<insets>[^)]*)\)/u
    .exec($media[0].style.clipPath)
    ?.groups?.insets.split(' ');
  const side = insets?.findIndex((inset) => inset.endsWith('%'));
  const percent = Number.parseFloat(insets?.[side ?? -1] ?? '');
  return side === 1 ? 100 - percent : percent;
};
/** Distinct first-frame stand-ins; data URIs load without a request. */
const poster = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="${fill}"/></svg>`)}`;
const WIPE_MEDIA = '[data-side="b"] > div';
const TILE_PREVIEW = '[data-testid="video-results-prompt-preview"]';
/** Pills, wipe and clip-path agree on which side the baseline (side b) sits. */
const expectBaselineLeft = (left: boolean) => {
  cy.get('[data-testid="video-results-pill"]').should(($pills) => {
    const [a, b] = [...$pills].map((pill) => pill.getBoundingClientRect().left);
    expect(b < a, 'reference pill on the left').to.equal(left);
  });
  cy.get(WIPE_MEDIA).should(($media) =>
    expect($media[0].style.clipPath).to.match(
      left
        ? /^inset\(0(?:px)? [\d.]+% 0(?:px)? 0(?:px)?\)$/u
        : /^inset\(0(?:px)? 0(?:px)? 0(?:px)? [\d.]+%\)$/u,
    ),
  );
};
/** Two animation frames, so a throttled split update would have landed. */
const nextFrames = () =>
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
      }),
  );
/** Moves the pointer to a share of the stage width. */
const pointAt = (share: number) =>
  cy.get('[data-testid="video-results-stage"]').then(($stage) => {
    const rect = $stage[0].getBoundingClientRect();
    cy.wrap($stage).trigger('pointermove', {
      clientX: rect.left + rect.width * share,
      clientY: rect.top + rect.height / 2,
    });
  });
/** Play, then pause at once: the media is requested and the scrubber learns the duration. */
const load = (start = '[data-testid="video-results-play"]') => {
  cy.get(start).click();
  cy.get('[data-testid="video-results-play"]').click();
  cy.get('[data-testid="video-results-play"]').should('have.attr', 'aria-pressed', 'false');
  cy.get('[data-testid="video-results-scrub"]').should('not.be.disabled');
};
/** Retries until the Difference canvas has a drawn top-left pixel that passes `check`. */
const expectDifference = (check: (rgba: number[]) => void) =>
  cy.get<HTMLCanvasElement>('[data-testid="video-results-difference"]').should(($canvas) => {
    const rgba = [...$canvas[0].getContext('2d')!.getImageData(0, 0, 1, 1).data];
    expect(rgba[3], 'drawn').to.equal(255);
    check(rgba);
  });

const cost = (perVideo: number, perVideoSecond: number) => ({
  perVideo,
  perVideoSecond,
  perHour: 1,
});
const readout = '[data-testid="video-results-readout"]';
/** A readout cell's lines: its own value, its context, then the pair's value when it has one. */
const readoutLines = (metric: string) => cy.get(`${readout} [data-metric="${metric}"] dd`);
const readoutValue = (metric: string, index = 0) => readoutLines(metric).eq(index);
/** The readout's cells in reading order. */
const readoutOrder = (metrics: readonly string[]) =>
  cy
    .get(`${readout} [data-metric]`)
    .should(($cells) =>
      expect($cells.toArray().map((cell) => cell.dataset.metric)).to.deep.equal(metrics),
    );

// These decoder fixtures are test inputs, never benchmark evidence.
function mountResultsClips(
  keys = ['b200', 'h200'],
  pathname = '/vgx',
  diagnostics = false,
  unofficialRun?: string,
  previews: string[] = [],
  brokenPreview = false,
  unpublished: string[] = [],
  {
    leads,
    deployments,
    costs = {},
    takes,
    posters = {},
    phone = false,
  }: {
    /** The phone layout and its opening pair, which the dashboard takes from the viewport. */
    phone?: boolean;
    /** Replace the C1 leads of `keys`, which still serve the media. */
    leads?: VideoPoint[];
    deployments?: VideoPoint[];
    costs?: Record<string, ResultCell['cost']>;
    /** Takes of the one prompt each artifact holds; 4 by default. */
    takes?: number;
    /** Poster URLs by measurement slot (`measurement-r001`) or `reference`. */
    posters?: Record<string, string>;
  } = {},
) {
  const referenceMedia = { url: '', diagnosticUrl: '', previewUrl: '' };
  cy.fixture('video-results/reference.mp4', 'base64').then((encoded: string) => {
    cy.window().then((win) => {
      const bytes = Uint8Array.from(win.atob(encoded), (char) => char.codePointAt(0)!);
      referenceMedia.url = win.URL.createObjectURL(new win.Blob([bytes], { type: 'video/mp4' }));
      if (diagnostics) {
        referenceMedia.diagnosticUrl = win.URL.createObjectURL(
          new win.Blob([bytes], { type: 'video/mp4' }),
        );
        cy.wrap(referenceMedia.diagnosticUrl).as('diagnostic-reference-url');
      }
    });
  });
  if (previews.length > 0)
    // A visibly different stand-in for the web encode, so Difference against it would not be zero.
    cy.fixture('video-results/candidate.mp4', 'base64').then((encoded: string) => {
      cy.window().then((win) => {
        const bytes = brokenPreview
          ? Uint8Array.of(0, 0, 0, 8)
          : Uint8Array.from(win.atob(encoded), (char) => char.codePointAt(0)!);
        referenceMedia.previewUrl = win.URL.createObjectURL(
          new win.Blob([bytes], { type: 'video/mp4' }),
        );
        cy.wrap(referenceMedia.previewUrl).as('preview-url');
      });
    });
  for (const key of keys) {
    cy.fixture(`video-results/${key === 'h200' ? 'reference' : 'candidate'}.mp4`, 'base64').then(
      (encoded: string) => {
        cy.window().then((win) => {
          const bytes = Uint8Array.from(win.atob(encoded), (char) => char.codePointAt(0)!);
          const url = win.URL.createObjectURL(new win.Blob([bytes], { type: 'video/mp4' }));
          const point = c1(key);
          const saved = servingArtifact(
            Number(point.runId),
            point.artifactId,
            `NVIDIA ${key.toUpperCase()}`,
            takes,
          );
          saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
            path,
            path === 'manifest.json' ? point.id.split(':')[0] : sha,
          ]);
          saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
            path,
            {
              ...asset,
              url,
              ...(previews.includes(key) ? { previewUrl: referenceMedia.previewUrl } : {}),
              posterUrl: posters[/measurement-r\d+/u.exec(path)?.[0] ?? ''],
            },
          ]);
          cy.wrap(url).as(`original-${key}`);
          const qualityFixture = referenceQualityFixture();
          const [quality] = verifiedQuality(
            qualityFixture.attachment,
            qualityFixture.descriptor,
            qualityFixture.stored,
            '9'.repeat(64),
          ).pairs;
          quality.candidate = {
            ...quality.candidate,
            run_id: point.runId,
            artifact_id: point.artifactId,
            source_id: saved.sources[0].id,
            manifest_sha256: point.id.split(':')[0],
          };
          quality.reference.url = referenceMedia.url;
          if (previews.includes('reference'))
            quality.reference.previewUrl = referenceMedia.previewUrl;
          quality.reference.posterUrl = posters.reference;
          saved.quality = [quality];
          if (diagnostics) {
            const diagnosticUrl = win.URL.createObjectURL(
              new win.Blob([bytes], { type: 'video/mp4' }),
            );
            cy.wrap(diagnosticUrl).as(`diagnostic-${key}-url`);
            saved.diagnostics = [
              {
                ...quality,
                scope: 'matched-noise-diagnostic',
                attachmentSha256: '8'.repeat(64),
                origin: quality.candidate,
                psnrDb: 30,
                reference: { ...quality.reference, url: referenceMedia.diagnosticUrl },
                candidate: {
                  run_id: `native-${key}-rerun`,
                  receipt_sha256: '7'.repeat(64),
                  plan_sha256: quality.candidate.plan_sha256,
                  hardware_key: key,
                  gpu_count: 4,
                  topology: { ulysses_degree: 2, tensor_parallel_degree: 2 },
                  runtime_name: 'sglang',
                  runtime_revision: '6'.repeat(40),
                  source_revision: '5'.repeat(40),
                  harness_sha256: '1'.repeat(64),
                  image_digest: `sha256:${'4'.repeat(64)}`,
                  effective_settings_sha256: '3'.repeat(64),
                  noise: {},
                  case_id: quality.candidate.case_id,
                  prompt: quality.candidate.prompt,
                  seed: quality.candidate.seed,
                  media_path: `${key}/diagnostic.mp4`,
                  media_sha256: '2'.repeat(64),
                  url: diagnosticUrl,
                },
              },
            ];
          }
          if (unpublished.includes(key)) {
            // An unstored named run: no published media, only documents and PSNR read live.
            cy.intercept('GET', mediaUrl(point), { statusCode: 204 });
            saved.sources[0].assets = [];
            quality.reference.url = '';
            cy.intercept(
              'GET',
              mediaUrl(point).replace('format=published', 'format=live'),
              saved,
            ).as(`results-${key}`);
          } else cy.intercept('GET', mediaUrl(point), saved).as(`results-${key}`);
        });
      },
    );
  }
  const selectedPoints = leads ?? keys.map(c1);
  function Clips() {
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
    const [against, setAgainst] = useState<string | null>(null);
    return (
      <PathnameContext.Provider value={pathname}>
        <button onClick={() => setHidden(hidden.size > 0 ? new Set() : new Set(['b200']))}>
          Toggle B200
        </button>
        <input aria-label="Notes" />
        {/* The page's column, which a phone's blocks join once the section leaves its box. */}
        <div className={`${styles.page} flex flex-col gap-4`}>
          <VideoResultsClips
            points={selectedPoints.filter((point) => !hidden.has(point.hardwareKey ?? ''))}
            colorFor={colorFor}
            deployments={deployments}
            costs={{
              [c1('b200').id]: { participating: cost(0.1, 0.02), allocated: null },
              [c1('h100').id]: { participating: cost(0.3, 0.06), allocated: cost(0.6, 0.12) },
              ...costs,
            }}
            unofficialRun={unofficialRun}
            phone={phone}
            titleRow={<h1 className="md:hidden">VideoGenX</h1>}
            against={against}
            onAgainstChange={setAgainst}
            onSubjectChange={(clip) => {
              setAgainst(null);
              writeStage({ ...parseStage(window.location.search), clip });
            }}
            onShow={() => {}}
            reveal={0}
          />
        </div>
      </PathnameContext.Provider>
    );
  }
  mountWithProviders(<Clips />);
  cy.wait(keys.map((key) => `@results-${key}` as const));
}

/** A lossy B200 lead at p50 40 s against its lossless twin, if any; both clips take 120 s. */
function mountLossyPair(twinP50: number | null) {
  const lossy: VideoPoint = {
    ...c1('b200'),
    id: `${c1('b200').id}-fbc`,
    p50: 40,
    results: { optimizations: ['first-block-cache'] } as unknown as ResultsEvidence,
  };
  const twins = twinP50 === null ? [] : [{ ...c1('b200'), p50: twinP50 }];
  mountResultsClips(['b200'], '/vgx', false, undefined, [], false, [], {
    leads: [lossy],
    deployments: [lossy, ...twins],
    costs: { [lossy.id]: { participating: cost(0.04, 0.01), allocated: null } },
  });
}

/** The viewport y of an element's top edge. */
const topOf = (selector: string) =>
  cy.get(selector).then(($element) => $element[0].getBoundingClientRect().top);
/** The viewport y of an element's bottom edge. */
const bottomOf = (selector: string) =>
  cy.get(selector).then(($element) => $element[0].getBoundingClientRect().bottom);
/** Each selector's element starts below the one before it. */
const expectStacked = (order: string[]) =>
  cy.wrap(order).each((selector: string, index) => {
    if (index === 0) return;
    topOf(order[index - 1]).then((above) =>
      topOf(selector).should((below) =>
        expect(below, `${selector} below ${order[index - 1]}`).to.be.greaterThan(above),
      ),
    );
  });

describe('Video results clip stage', () => {
  beforeEach(() => {
    // The stage keeps its view and prompt in the URL, which outlives one test's mount.
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
  });
  /** Puts the browser's own media back after a test that stood in for it. */
  let undoMedia: (() => void) | null = null;
  afterEach(() => {
    if (Cypress.isBrowser({ family: 'chromium' })) touchScreen(false);
    undoMedia?.();
    undoMedia = null;
  });

  it('keeps one audible side, also across a prompt switch', () => {
    mountResultsClips(['b200', 'h100'], '/vgx', true);
    expectAudio(null);
    speaker('a').click();
    expectAudio('a');
    pointAt(0);
    cy.get('[data-testid="video-results-play"]').click();
    cy.get(WIPE_MEDIA).should(($media) =>
      expect(splitOf($media), 'split ignores the pointer before the first Play').to.equal(50),
    );
    speaker('b').click();
    expectAudio('b');
    sideVideo('b').should(($video) =>
      expect(($video[0] as HTMLVideoElement).paused).to.equal(false),
    );
    cy.screenshot('audio-desktop-en');
    cy.get('[data-prompt="drum-taps"]').click();
    cy.get('[data-testid="video-results-play"]').should('have.attr', 'aria-pressed', 'false');
    expectAudio('b');
    speaker('b').should('have.attr', 'aria-pressed', 'true').click();
    expectAudio(null);
  });

  it('restores mute when the audible hardware is hidden or fails, and stacks Side by side on a phone', () => {
    cy.viewport(375, 900);
    mountResultsClips(['b200', 'h100'], '/zh/vgx', false, c1('b200').runId);
    cy.get('[data-side="a"]').should('contain', 'B200').and('contain', '非官方运行');
    cy.get('[data-side="a"] [data-testid="video-results-pill"] b').should(($name) => {
      expect($name.text()).to.contain('B200');
      expect($name[0].scrollWidth, 'hardware name not truncated').to.be.at.most(
        $name[0].clientWidth,
      );
    });
    cy.get('[aria-label="收听 B200"]').click();
    expectAudio('a');
    cy.contains('button', 'Toggle B200').click();
    cy.get('[data-side="a"]').should('contain', 'H100');
    expectAudio(null);
    cy.get('[aria-label="收听 H100"]').click();
    expectAudio('a');
    cy.get('[data-testid="video-results-view-side"]').click();
    cy.get('[data-testid="video-results-clip"]').should(($sides) => {
      const [a, b] = [...$sides].map((side) => side.getBoundingClientRect());
      expect(a.top, 'subject stacked under the baseline below 640 px').to.be.at.least(b.bottom);
    });
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.screenshot('audio-mobile-zh');
    load();
    sideVideo('a').then(($video) => {
      const video = $video[0] as HTMLVideoElement;
      video.src = 'data:video/mp4;base64,YmFk';
      video.load();
    });
    cy.get('[data-side="a"]').should('contain', '此视频无法播放');
    expectAudio(null);
    speaker('a').should('not.exist');
  });

  it('keeps native rerun media and PSNR separate from the original CI performance', () => {
    cy.viewport(390, 900);
    mountResultsClips(['b200', 'h100'], '/vgx', true);
    // At this width the strip under the stage is the prompt picker.
    cy.get('[data-strip-prompt="diag:drum-taps"]')
      .should('have.attr', 'aria-pressed', 'true')
      .and('contain', 'Matched-noise rerun');
    cy.get('[data-side="a"]').should('contain', '4 GPU');
    cy.get(readout).should('have.attr', 'data-pair', 'reference').and('contain', '30 dB');
    for (const metric of ['wall', 'energy', 'cost']) readoutValue(metric).should('have.text', '—');
    cy.get('@diagnostic-b200-url').then((url) => sideVideo('a').should('have.attr', 'src', url));
    cy.get('@diagnostic-reference-url').then((url) =>
      sideVideo('b').should('have.attr', 'src', url),
    );
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]')
      .should('contain', 'native-b200-rerun')
      .and('contain', 'sglang 666666666666')
      .and('contain', 'Receipt')
      .and('not.contain', c1('b200').runId);
    cy.window().its('innerWidth').should('eq', 390);
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('[data-strip-prompt="drum-taps"]').click();
    // The board's reference order: quality first, then latency and one cost, then energy.
    readoutOrder(['psnr', 'wall', 'cost', 'energy']);
    readoutValue('psnr').should('have.text', '25 dB');
    readoutValue('wall').should('have.text', '120 s');
    readoutValue('energy').should('have.text', '301,088 J');
    readoutValue('cost').should('have.text', '$0.1');
    readoutValue('cost', 1).should('have.text', '$0.02 / video-s');
    cy.get(`${readout} [data-metric="cost"]`)
      .should('have.attr', 'title')
      .and('contain', 'On the allocated GPUs: not measured yet.');
    cy.get(`${readout} [data-testid="video-results-readout-pair"]`).should(
      'contain',
      '4 GPU · TP2 × Ulysses 2',
    );
    cy.get('[data-testid="video-results-sources"]').should('contain', c1('b200').runId);
  });

  it('requests media only on Play, then plays, seeks, wipes and draws real pixel differences', () => {
    mountResultsClips(['b200', 'h200', 'h100']);
    cy.get<HTMLVideoElement>('[data-testid="video-results-stage"] video')
      .should('have.length', 2)
      .each(($video) => expect(($video[0] as HTMLVideoElement).preload).to.equal('none'));
    cy.get('[data-testid="video-results-sources"]').should('not.have.attr', 'open');
    cy.get('[data-testid="video-results-sources"] summary').focus();
    cy.focused().should('contain', 'Prompt & sources').click();
    cy.get('[data-testid="video-results-sources"]')
      .should('contain', c1('b200').runId)
      .and('contain', c1('b200').runtime)
      .and('contain', 'Official Diffusers reference')
      .and('not.contain', 'web encode');
    cy.get('[data-testid="video-results-prompt"]')
      .should('contain', 'A drummer taps a snare drum.')
      .and('contain', 'seed 11')
      .and('contain', 'take 1');
    readoutValue('cost').should('have.text', '$0.1');
    // A mouse reads each readout cell's explanation from its title; only touch adds a button.
    cy.get(`${readout} [data-slot="info-help"]`).should('not.exist');

    cy.get('[data-testid="video-results-stage"]').click('right');
    load('[data-testid="video-results-start"]');
    cy.get('[data-side="b"] [data-testid="video-results-pill"] b').click();
    cy.get('[data-testid="video-results-split"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('[data-testid="video-results-stage"] video').each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.readyState).to.be.greaterThan(0);
        expect(video.videoWidth).to.equal(32);
        expect(video.duration).to.equal(2);
      }),
    );
    scrub(0.8);
    expectClipsAt(0.8);
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-stage"] video').each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.paused).to.equal(false);
        expect(video.currentTime).to.be.greaterThan(0.8);
      }),
    );
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-stage"] video').each(($video) =>
      cy
        .wrap($video)
        .should(($element) => expect(($element[0] as HTMLVideoElement).paused).to.equal(true)),
    );

    pointAt(0.25);
    cy.get(WIPE_MEDIA).should(($media) => expect(splitOf($media)).to.be.closeTo(25, 0.5));
    cy.get('[data-testid="video-results-stage"]').click('right');
    cy.get('[data-testid="video-results-split"]').should('have.attr', 'aria-pressed', 'true');
    cy.get(WIPE_MEDIA).then(($media) => {
      const locked = splitOf($media);
      pointAt(0.8);
      nextFrames();
      cy.get(WIPE_MEDIA).should(($after) => expect(splitOf($after)).to.equal(locked));
    });

    cy.get('[data-testid="video-results-view-diff"]').click();
    expectDifference((rgba) => {
      expect(rgba[0]).to.be.greaterThan(200);
      expect(rgba[2]).to.be.greaterThan(200);
    });
    // The canvas blends the two frames itself; every pixel equals the arithmetic done in script.
    cy.get<HTMLCanvasElement>('[data-testid="video-results-difference"]').should(($canvas) => {
      const page = $canvas[0].ownerDocument;
      const pixels = (side: 'a' | 'b') => {
        const video = page.querySelector<HTMLVideoElement>(`[data-side="${side}"] video`)!;
        const frame = page.createElement('canvas');
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        const context = frame.getContext('2d')!;
        context.drawImage(video, 0, 0);
        return context.getImageData(0, 0, frame.width, frame.height).data;
      };
      const drawn = $canvas[0]
        .getContext('2d')!
        .getImageData(0, 0, $canvas[0].width, $canvas[0].height).data;
      expect($canvas[0].width, 'frame width').to.equal(32);
      expect([...drawn]).to.deep.equal([...absoluteFrameDifference(pixels('b'), pixels('a'))]);
    });
    // The pair is paused: once its frames have stood still for half a second its picture stands
    // too, and is not blended again ten times a second.
    cy.wait(700);
    const draws = { stage: 0, self: 0 };
    cy.window().then((win) => {
      const context = (win as unknown as typeof globalThis).CanvasRenderingContext2D.prototype;
      const draw = context.drawImage as (...args: unknown[]) => void;
      cy.stub(context, 'drawImage').callsFake(function (
        this: CanvasRenderingContext2D,
        ...args: unknown[]
      ) {
        if (this.canvas.dataset.testid === 'video-results-difference') draws.stage += 1;
        // No canvas is its own source, which browsers have not always agreed on.
        if (args[0] === this.canvas) draws.self += 1;
        return draw.apply(this, args);
      });
    });
    cy.wait(1500).then(() => {
      // One picture is four draws onto the stage's canvas; ten a second would be sixty.
      expect(draws.stage, 'draws onto the stage canvas').to.be.at.most(8);
    });
    // A new frame is blended at once, and still without a canvas drawn onto itself.
    scrub(0.4);
    cy.wrap(draws).should((seen) => expect(seen.stage).to.be.greaterThan(8));
    cy.wrap(draws).its('self').should('equal', 0);
    // H200's clip equals the reference, so the next subject draws a black difference.
    cy.contains('button', 'Toggle B200').click();
    cy.get('[data-side="a"]').should('contain', 'H200');
    expectDifference((rgba) => expect(rgba).to.deep.equal([0, 0, 0, 255]));
    // Compared with H100 instead, the other side plays H100's clip of the same prompt.
    cy.get('[data-testid="video-results-against"]').select('h100');
    cy.get('@original-h100').then((url) => sideVideo('b').should('have.attr', 'src', url));
    expectDifference((rgba) => expect(rgba[0]).to.be.greaterThan(200));
  });

  it('starts both clips from the tap where a clip loads only while it plays, behind their first frames', () => {
    const reference = poster('red');
    const subject = poster('blue');
    const seen = { calls: [] as ReturnType<typeof phoneMedia>['calls'], referenceSrc: '' };
    cy.window().then((win) => {
      // The reference takes twice as long to have data as the subject does.
      const media = phoneMedia(win, (src) => (src === seen.referenceSrc ? 600 : 300));
      seen.calls = media.calls;
      undoMedia = media.undo;
    });
    mountResultsClips(['b200'], '/vgx', false, undefined, [], false, [], {
      posters: { reference, 'measurement-r001': subject },
    });
    const videos = '[data-testid="video-results-stage"] video';
    const frames = '[data-testid="video-results-first-frame"]';
    sideVideo('b').then(($video) => {
      seen.referenceSrc = $video.attr('src')!;
    });
    cy.get(frames).should('have.length', 2);
    cy.get('[data-testid="video-results-play"]')
      .click()
      .then(() => {
        // Both starts are asked for inside the tap, and neither is taken back.
        expect(seen.calls.filter((entry) => entry.call === 'play' && entry.inClick)).to.have.length(
          2,
        );
        expect(seen.calls.filter((entry) => entry.call === 'pause')).to.deep.equal([]);
      });
    // While the clips load, each side keeps its first frame and the transport says why it waits.
    cy.get(frames)
      .should('have.length', 2)
      .each(($frame) => cy.wrap($frame).should('be.visible'));
    sideVideo('a').parent().find('img').should('have.attr', 'src', subject);
    cy.get('[data-testid="video-results-buffering"]').should('contain', 'Loading');
    cy.get('[data-testid="video-results-play"]').should('have.attr', 'aria-pressed', 'true');
    // Both move once the slower clip has data: well inside a second, and from one time.
    cy.get<HTMLVideoElement>(videos, { timeout: 1500 }).should(($videos) => {
      const times = [...$videos].map((video) => {
        expect(video.paused, 'playing').to.equal(false);
        expect(video.currentTime, 'moving').to.be.greaterThan(0.05);
        return video.currentTime;
      });
      expect(Math.abs(times[0] - times[1]), 'together').to.be.lessThan(0.04);
    });
    cy.get(frames).should('not.exist');
    cy.get('[data-testid="video-results-buffering"]').should('not.exist');
    cy.then(() =>
      // A clip that waits for data is never paused; only the one that had its data is held.
      expect(seen.calls.filter((entry) => entry.call === 'pause' && !entry.loaded)).to.deep.equal(
        [],
      ),
    );
  });

  it('wipes by a sideways drag, plays on a tap and explains itself by tap on a touch screen', () => {
    coarsePointer();
    mountResultsClips(['b200', 'h200']);
    load('[data-testid="video-results-start"]');
    const play = '[data-testid="video-results-play"]';
    const handle = '[data-testid="video-results-split"]';
    cy.get('[data-testid="video-results-stage"]').then(($stage) => {
      cy.stub($stage[0], 'setPointerCapture').as('capture');
      const { width, height, left, top } = $stage[0].getBoundingClientRect();
      // Below the centre, so presses land on the clips rather than the split handle.
      const at = (share: number) =>
        [
          width * share,
          height * 0.75,
          { clientX: left + width * share, clientY: top + height * 0.75, pointerId: 7 },
        ] as const;
      const press = (from: number, to = from) =>
        cy
          .wrap($stage)
          .trigger('pointerdown', ...at(from))
          .trigger('pointermove', ...at(to))
          .trigger('pointerup', ...at(to))
          .trigger('click', ...at(to));
      // A finger does not hover: a move without a press leaves the split alone.
      cy.wrap($stage).trigger('pointermove', ...at(0.2));
      nextFrames();
      cy.get(WIPE_MEDIA).should(($media) => expect(splitOf($media)).to.be.closeTo(50, 0.5));
      // A sideways drag moves the split, and the click that ends it neither plays nor locks.
      press(0.3, 0.7);
      cy.get(WIPE_MEDIA).should(($media) => expect(splitOf($media)).to.be.closeTo(70, 0.5));
      cy.get('@capture').should('have.been.calledOnceWith', 7);
      cy.get(play).should('have.attr', 'aria-pressed', 'false');
      cy.get(handle).should('have.attr', 'aria-pressed', 'false');
      // A tap plays, the next pauses, and only the handle locks.
      press(0.4);
      cy.get(play).should('have.attr', 'aria-pressed', 'true');
      press(0.4);
      cy.get(play).should('have.attr', 'aria-pressed', 'false');
      cy.get(handle).should('have.attr', 'aria-pressed', 'false').click();
      cy.get(handle).should('have.attr', 'aria-pressed', 'true');
      press(0.3, 0.2);
      nextFrames();
      cy.get(WIPE_MEDIA).should(($media) => expect(splitOf($media)).to.be.closeTo(70, 0.5));
    });
    // Hover titles never show on touch: the view's gestures and each readout cell open by tap.
    cy.get('[data-testid="video-results-metrics-help"]').click();
    cy.get('[data-testid="option-help-content-clip-metrics"]')
      .should('contain', 'Drag across the clips to slide the split')
      .and('contain', 'tap its info button');
    cy.get('body').type('{esc}');
    cy.get(`${readout} [data-metric="psnr"] [data-slot="info-help"]`).click();
    cy.get('[data-testid="option-help-content-readout-psnr"]').should('contain', 'Decoded RGB24');
  });

  it('leads a phone with the stage, one sentence, the Compare row and a strip of every prompt', () => {
    cy.viewport(390, 844);
    mountResultsClips(['b200', 'h200', 'h100'], '/vgx', false, undefined, [], false, [], {
      phone: true,
    });
    // With no pair in the link a phone opens the subject against another GPU, and says so in the URL.
    cy.get('[data-testid="video-results-against"]').should('not.have.value', 'reference');
    cy.location('search').should('match', /r_vs=h[12]00/u);
    // H100 has a modelled cost in this harness, so the sentence can state both sides.
    cy.get('[data-testid="video-results-against"]').select('h100');
    cy.get('[data-testid="video-results-sentence"]')
      .should('be.visible')
      .invoke('text')
      .should(
        'match',
        /^Same prompt, same seed\. B200 ×\d+ takes a median [\d.]+ s per clip for \$0\.1; H100 ×\d+ takes [\d.]+ s for \$0\.3\.$/u,
      );
    // Title, picture, sentence, transport, Compare row on one line, prompt strip; then the rest.
    const order = [
      'h1',
      '[data-testid="video-results-stage"]',
      '[data-testid="video-results-sentence"]',
      '[data-testid="video-results-play"]',
      '[data-testid="video-results-compare"]',
      '[data-testid="video-results-prompt-strip"]',
      '[data-testid="video-results-prompt"]',
      '[data-testid="video-results-view-wipe"]',
      '[data-testid="video-results-inspect-toggle-phone"]',
      '[data-testid="video-results-readout"]',
    ];
    expectStacked(order);
    cy.get('[data-testid="video-results-compare"]').should(($row) =>
      expect($row[0].getBoundingClientRect().height, 'one line').to.be.at.most(44),
    );
    cy.document().should((document) =>
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      ),
    );
    // The strip holds every prompt and scrolls sideways; the prompt row's own tiles are away.
    cy.get('[data-testid="video-results-prompts"]').should('not.be.visible');
    cy.get('[data-testid="video-results-prompt-strip"]').should(($strip) => {
      expect($strip.find('[data-strip-prompt]')).to.have.length(4);
      expect($strip[0].scrollWidth, 'more to swipe to').to.be.greaterThan($strip[0].clientWidth);
    });
    cy.get('[data-strip-prompt="drum-taps~4"]').scrollIntoView().click();
    cy.location('search').should('contain', 'r_prompt=drum-taps%7E4');
    cy.get('[data-strip-prompt="drum-taps~4"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="video-results-prompt"]').should('contain', 'take 4');
    // Inspect leaves the transport row for the view modes, and its drawer opens beside it.
    cy.get('[data-testid="video-results-inspect-toggle"]').should('not.be.visible');
    cy.get('[data-testid="video-results-inspect-toggle-phone"]').click();
    cy.get('[data-testid="video-results-inspect-slot"] [data-testid="video-results-inspect"]')
      .should('be.visible')
      .and('contain', 'Speed');
    // An explicit reference is a pick like any other on a phone.
    cy.get('[data-testid="video-results-against"]').select('reference');
    cy.get('[data-testid="video-results-sentence"]').should('not.exist');
    cy.get('[data-side="b"]').should('contain', 'Diffusers reference');
  });

  it('keeps Play on a sideways phone’s screen under the whole picture, the sentence after it', function () {
    if (!Cypress.isBrowser({ family: 'chromium' })) this.skip();
    touchScreen(true);
    // An iPhone 15 on its side.
    cy.viewport(734, 343);
    mountResultsClips(['b200', 'h200', 'h100'], '/vgx', false, undefined, [], false, [], {
      phone: true,
    });
    cy.get('[data-testid="video-results-against"]').select('h100');
    cy.get('[data-testid="video-results-sentence"]').should('be.visible');
    // The site's sticky header is 57 px tall; the picture rests 4 px under it.
    const HEADER = 57;
    topOf('[data-testid="video-results-stage"]').then((top) =>
      cy.window().then((win) => win.scrollBy(0, top - HEADER - 4)),
    );
    topOf('[data-testid="video-results-stage"]').should('be.closeTo', HEADER + 4, 1);
    // The picture takes the height the header and the transport leave, so it is taller than
    // the 180 px a desktop window this short gets.
    bottomOf('[data-testid="video-results-stage"]').then((picture) => {
      expect(picture - HEADER - 4, 'picture height').to.be.closeTo(215, 1);
      topOf('[data-testid="video-results-play"]').should('be.at.least', picture);
    });
    bottomOf('[data-testid="video-results-play"]').then((play) => {
      expect(play, 'Play inside the 343 px screen').to.be.at.most(343);
      // The sentence is kept; it follows the transport instead of pushing it off the screen.
      topOf('[data-testid="video-results-sentence"]').should('be.at.least', play);
    });
  });

  it('takes taps 44 px wide on the +N prompt tile of a touch tablet, at its 40 px width', function () {
    if (!Cypress.isBrowser({ family: 'chromium' })) this.skip();
    cy.viewport(820, 1000);
    mountResultsClips(['b200', 'h200']);
    const more = '[data-testid="video-results-prompts-more"]';
    cy.get(more).should('have.text', '+1');
    tapArea(more).its('width').should('equal', 40);
    touchScreen(true);
    tapArea(more).should((area) => {
      expect(area.width).to.equal(44);
      expect(area.height).to.be.at.least(44);
    });
    cy.get(more).should(($tile) => expect($tile[0].getBoundingClientRect().width).to.equal(40));
  });

  it('names a take only when another take shares the prompt and seed', () => {
    mountResultsClips(['b200'], '/vgx', false, undefined, [], false, [], { takes: 1 });
    cy.get('[data-testid="video-results-prompt"]')
      .should('contain', 'seed 11')
      .and('not.contain', 'take');
    mountResultsClips(['b200']);
    cy.get('[data-testid="video-results-prompt"]').should('contain', 'seed 11 · take 1');
    cy.get('[data-prompt="drum-taps"]').should('contain', 'take 1');
    cy.get('[data-prompt="drum-taps~2"]').should('contain', 'take 2');
  });

  it('shows first frames on the strip and the stage before Play, and a text tile without one', () => {
    const reference = poster('red');
    const subject = poster('blue');
    mountResultsClips(['b200', 'h200'], '/vgx', false, undefined, [], false, [], {
      posters: {
        reference,
        'measurement-r001': subject,
        'measurement-r002': subject,
        'measurement-r003': 'data:image/png;base64,AAAA',
      },
    });
    // The prompt's reference frame first, then the subject's, then text once neither loads.
    cy.get('[data-prompt="drum-taps"] img')
      .should('have.attr', 'src', reference)
      .and('have.attr', 'alt', 'drum-taps')
      .and('have.attr', 'loading', 'lazy');
    cy.get('[data-prompt="drum-taps~2"] img').should('have.attr', 'src', subject);
    cy.get('[data-prompt="drum-taps~3"]')
      .should('contain', 'seed 11')
      .find('img')
      .should('not.exist');
    cy.get('[data-testid="video-results-prompts-more"]').should('have.text', '+1').click();
    cy.get('[data-prompt="drum-taps~4"]')
      .should('contain', 'seed 11 · take 4')
      .find('img')
      .should('not.exist');

    sideVideo('a').should('have.attr', 'poster', subject);
    sideVideo('b').should('have.attr', 'poster', reference);
    cy.get<HTMLVideoElement>('[data-testid="video-results-stage"] video').each(($video) =>
      expect(($video[0] as HTMLVideoElement).preload, 'no media before Play').to.equal('none'),
    );
    // Both frames are there to compare, so the split works before Play and no idle frame covers it.
    cy.get('[data-testid="video-results-start"]').should('not.exist');
    pointAt(0.25);
    cy.get(WIPE_MEDIA).should(($media) => expect(splitOf($media)).to.be.closeTo(25, 0.5));
    // Difference hides both frames behind its empty canvas, so Play comes back.
    cy.get('[data-testid="video-results-view-diff"]').click();
    cy.get('[data-testid="video-results-start"]').should('be.visible');
  });

  it('fits the stage in a short window, also with two frames Side by side', () => {
    cy.viewport(1280, 600);
    mountResultsClips(['b200', 'h200'], '/vgx', false);
    // 600px less the 18rem kept for the header, Compare row, transport and readout.
    cy.get('[data-testid="video-results-stage"]').should(($stage) =>
      expect($stage[0].getBoundingClientRect().height).to.be.closeTo(312, 1),
    );
    cy.get('[data-testid="video-results-view-side"]').click();
    cy.get('[data-testid="video-results-clip"]').should(($clips) =>
      expect($clips[0].getBoundingClientRect().height).to.be.closeTo(312, 1),
    );
  });

  it('loops a tile’s preview while the mouse rests on it, and fetches nothing before', () => {
    mountResultsClips(['b200', 'h200'], '/vgx', false, undefined, ['reference'], false, [], {
      posters: { reference: poster('red') },
    });
    const tile = '[data-prompt="drum-taps"]';
    cy.get(tile).find('img').should('exist');
    cy.get(tile).find(TILE_PREVIEW).should('not.exist');
    // A touch picks the prompt; it never starts a download.
    cy.get(tile).trigger('pointerover', { pointerType: 'touch' });
    cy.get(tile).find(TILE_PREVIEW).should('not.exist');
    cy.get(tile).trigger('pointerover', { pointerType: 'mouse' });
    cy.get<string>('@preview-url').then((url) =>
      cy
        .get(tile)
        .find(TILE_PREVIEW)
        .should('have.attr', 'src', url)
        .and('have.css', 'opacity', '1'),
    );
    cy.get(tile).trigger('pointerout', { pointerType: 'mouse' });
    cy.get(tile).find(TILE_PREVIEW).should('not.exist');
  });

  it('keeps Play on the stage while a first frame fails to load', () => {
    mountResultsClips(['b200', 'h200'], '/vgx', false, undefined, [], false, [], {
      posters: { reference: poster('red'), 'measurement-r001': 'data:image/png;base64,AAAA' },
    });
    sideVideo('a').should('have.attr', 'poster', 'data:image/png;base64,AAAA');
    cy.get('[data-testid="video-results-start"]').should('be.visible');
  });

  it('cannot draw a difference after the reference decoder fails', () => {
    mountResultsClips();
    load();
    sideVideo('b').then(($video) => {
      const video = $video[0] as HTMLVideoElement;
      video.src = 'data:video/mp4;base64,YmFk';
      video.load();
    });
    cy.get('[data-side="b"]').should('contain', 'This clip could not be played.');
    cy.get('[data-side="b"]').contains('button', 'Retry').should('be.visible');
    cy.get('[data-testid="video-results-view-diff"]').click();
    cy.get('[data-testid="video-results-stage"]').should('contain', 'Both sides need a clip.');
    cy.get('[data-testid="video-results-difference"]').should('not.exist');
  });

  it('plays web renditions outside Difference and sealed originals in it, also for an overlay', () => {
    mountResultsClips(['b200', 'h200'], '/vgx', false, c1('b200').runId, [
      'b200',
      'h200',
      'reference',
    ]);
    cy.get('[data-side="a"]').should('contain', 'Unofficial run');
    cy.get('@preview-url').then((url) => {
      sideVideo('a').should('have.attr', 'src', url);
      sideVideo('b').should('have.attr', 'src', url);
    });
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should(
      'contain',
      'Playback uses a web encode; Difference, PSNR and the media link use the original.',
    );
    cy.get('@original-b200').then((url) =>
      cy
        .get('[data-testid="video-results-sources"] tbody tr')
        .eq(0)
        .find('a')
        .should('have.attr', 'href', url),
    );
    load();
    scrub(0.8);
    expectClipsAt(0.8);

    cy.get('[data-testid="video-results-view-diff"]').click();
    cy.get('@original-b200').then((url) => sideVideo('a').should('have.attr', 'src', url));
    sideVideo('b')
      .invoke('attr', 'src')
      .then((src) => cy.get('@preview-url').should('not.equal', src));
    // Swapping to the original reloads each side; it must resume at the group's time, not 0.
    expectClipsAt(0.8);
    // Both renditions are the same stand-in, so only the originals differ.
    expectDifference((rgba) => expect(rgba[0]).to.be.greaterThan(200));

    cy.get('[data-testid="video-results-view-toggle"]').click();
    cy.get('@preview-url').then((url) => sideVideo('a').should('have.attr', 'src', url));
    expectClipsAt(0.8);
    cy.get('[data-testid="video-results-toggle-a"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[aria-label="Notes"]').type('t');
    cy.get('[data-testid="video-results-toggle-a"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="video-results-stage"]').focus().type('t');
    cy.get('[data-testid="video-results-toggle-b"]').should('have.attr', 'aria-pressed', 'true');
    cy.location('search').should('contain', 'r_view=toggle');
    cy.get('[data-testid="video-results-view-wipe"]').click();
    cy.location('search').should('not.contain', 'r_view');
  });

  it('steps, slows, zooms, pans, swaps and loops both sides together, also for an overlay', () => {
    mountResultsClips(['b200', 'h200'], '/vgx', false, c1('b200').runId);
    cy.get('[data-side="a"]').should('contain', 'Unofficial run');
    const videos = '[data-testid="video-results-stage"] video';
    /** Both sides paused on one frame; the workload's 24 fps sets the frame, not the fixture's. */
    const expectFrame = (frame: number) =>
      cy
        .get(videos)
        .should('have.length', 2)
        .each(($video) =>
          cy.wrap($video).should(($element) => {
            const video = $element[0] as HTMLVideoElement;
            expect(video.paused).to.equal(true);
            expect(video.currentTime).to.be.closeTo((frame + 0.5) / 24, 0.002);
          }),
        );
    const expectTransforms = (expected: string[]) =>
      cy
        .get<HTMLVideoElement>(videos)
        .should(($videos) =>
          expect([...$videos].map((video) => video.style.transform)).to.deep.equal(expected),
        );
    load();
    cy.get('[data-testid="video-results-inspect-toggle"]').click();
    cy.get('[data-testid="video-results-loop"]').should('have.attr', 'aria-pressed', 'true');

    scrub(0.8);
    cy.get('[data-testid="video-results-frame-next"]').click();
    expectFrame(20);
    cy.get('[data-testid="video-results-frame"]').should('have.text', 'frame 21 / 48');
    cy.get('[data-testid="video-results-stage"]').focus().type('{leftArrow}');
    expectFrame(19);

    cy.get('[data-testid="video-results-speed-0.5"]').click();
    cy.get('[data-testid="video-results-play"]').click();
    cy.get(videos).each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.paused).to.equal(false);
        // A drift nudge is ±10% around the chosen speed, never a return to 1×.
        expect(video.playbackRate).to.be.closeTo(0.5, 0.051);
      }),
    );
    cy.get('[data-testid="video-results-play"]').click();

    cy.get('[data-testid="video-results-zoom-2"]').click();
    expectTransforms(['scale(2) translate(0%, 0%)', 'scale(2) translate(0%, 0%)']);
    cy.get('[data-testid="video-results-stage"]').then(($stage) => {
      const { width, height, left, top } = $stage[0].getBoundingClientRect();
      // Below the centre, so the drag starts on the clips rather than the split handle.
      const at = (x: number) =>
        [x, height * 0.75, { clientX: left + x, clientY: top + height * 0.75 }] as const;
      cy.wrap($stage)
        .trigger('pointerdown', ...at(width * 0.3))
        .trigger('pointermove', ...at(width * 0.4));
      // Dragging a tenth of the width at 2× pans by 5% of the scaled side.
      expectTransforms(['scale(2) translate(5%, 0%)', 'scale(2) translate(5%, 0%)']);
      // Esc while the pointer is still down resets the zoom; the held drag must not restore it.
      cy.wrap($stage)
        .focus()
        .type('{esc}')
        .trigger('pointermove', ...at(width * 0.5));
      nextFrames();
      cy.get<HTMLVideoElement>(videos).then(($videos) =>
        expect([...$videos].map((video) => video.style.transform)).to.deep.equal(['', '']),
      );
      cy.wrap($stage)
        .trigger('pointerup', ...at(width * 0.5))
        .trigger('click', ...at(width * 0.5));
    });
    cy.get('[data-testid="video-results-split"]').should('have.attr', 'aria-pressed', 'false');

    // The baseline plays on the left and the subject on the right, as in board E; Swap flips them.
    expectBaselineLeft(true);
    cy.get('[data-testid="video-results-swap"]').click();
    expectBaselineLeft(false);
    cy.get('[data-testid="video-results-stage"]').should(
      'have.attr',
      'aria-label',
      'B200 against Diffusers reference',
    );

    scrub(2);
    cy.get('[data-testid="video-results-frame"]').should('have.text', 'frame 48 / 48');
    scrub(1.9);
    cy.get('[data-testid="video-results-play"]').click();
    cy.get(videos).each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.paused).to.equal(false);
        expect(video.currentTime).to.be.lessThan(1);
      }),
    );
  });

  it('shows PSNR without media for an unpublished named run', () => {
    // H200 has media, but the run the user loaded stays the subject.
    mountResultsClips(['b200', 'h200'], '/vgx', false, c1('b200').runId, [], false, ['b200']);
    cy.get('[data-side="a"]')
      .should('contain', 'Media is not shown for an unpublished run.')
      .and('contain', 'Unofficial run')
      .find('video')
      .should('not.exist');
    readoutValue('psnr').should('have.text', '25 dB');
    cy.get('[data-side="b"]').should('contain', 'No sealed reference pair for this clip.');
    cy.get('[data-testid="video-results-play"]').should('be.disabled');
  });

  it('reads out both sides against another GPU and names the unofficial one', () => {
    mountResultsClips(['b200', 'h100'], '/vgx', false, c1('b200').runId);
    cy.get('[data-testid="video-results-against"]').select('h100');
    cy.get(readout).should('have.attr', 'data-pair', 'hardware');
    // Speed leads, so no sixth cell strands on a second row.
    readoutOrder(['speed', 'psnr', 'wall', 'cost', 'energy']);
    cy.get(`${readout} [data-readout-side="b200"]`)
      .should('contain', 'Unofficial run')
      .find('span')
      .first()
      .should('have.attr', 'style')
      .and('contain', overlayRunColor(0));
    cy.get(`${readout} [data-readout-side="h100"]`).should('not.contain', 'Unofficial run');
    readoutLines('wall').should('have.length', 2).last().should('have.text', 'H100 120 s');
    readoutValue('speed').should('have.text', '2.15× faster');
    readoutValue('speed', 1).should('have.text', 'p50 77.9 s vs 167.3 s');
    readoutValue('psnr', 2).should('have.text', 'H100 25 dB');
    readoutValue('cost', 1).should('have.text', '$0.02 / video-s');
    readoutValue('cost', 2).should('have.text', 'H100 $0.3');
  });

  it('shows a dash, not a pending score or stray times, where a lossy pair has nothing to compare', () => {
    mountLossyPair(0);
    readoutLines('speed').should('have.length', 1).and('have.text', '—');
    mountLossyPair(null);
    cy.get('[data-side="b"]').should('contain', 'no lossless config');
    for (const metric of ['speed', 'paired'])
      readoutLines(metric).should('have.length', 1).and('have.text', '—');
    for (const metric of ['psnr', 'cost', 'energy'])
      readoutLines(metric).last().should('have.text', 'B200 lossless —');
  });

  it('leads a lossy pair with its speed and never shows a score it has not measured', () => {
    mountLossyPair(112);
    cy.get(readout).should('have.attr', 'data-pair', 'twin');
    readoutOrder(['speed', 'paired', 'psnr', 'cost', 'energy']);
    cy.get(`${readout} [data-metric="speed"] dt`).should('have.text', 'Speed vs lossless');
    readoutValue('speed').should('have.text', '2.80× faster');
    readoutValue('speed', 1).should('have.text', 'p50 40 s vs 112 s');
    // Only the trade is tinted.
    cy.get(`${readout} [data-metric]`).should(($cells) => {
      const tinted = $cells
        .toArray()
        .filter((cell) => getComputedStyle(cell).backgroundColor !== 'rgba(0, 0, 0, 0)')
        .map((cell) => cell.dataset.metric);
      expect(tinted).to.deep.equal(['speed']);
    });
    // One planned cell stands for PSNR, SSIM and LPIPS against lossless; it holds no number.
    cy.get(`${readout} [data-metric="paired"] dt`).should('have.text', 'Paired scores');
    readoutValue('paired').should('have.text', 'Planned');
    cy.get(`${readout} [data-metric="paired"]`).invoke('text').should('not.match', /\d/u);
    readoutValue('cost').should('have.text', '$0.04');
    readoutValue('cost', 1).should('have.text', '$0.01 / video-s');
    readoutValue('cost', 2).should('have.text', 'B200 lossless $0.1');
    readoutValue('psnr', 2).should('have.text', 'B200 lossless 25 dB');
  });

  it('falls back to the sealed original when a web rendition cannot be played', () => {
    mountResultsClips(['b200', 'h200'], '/vgx', false, undefined, ['b200'], true);
    load();
    cy.get('@original-b200').then((url) => sideVideo('a').should('have.attr', 'src', url));
    sideVideo('a').should(($video) =>
      expect(($video[0] as HTMLVideoElement).readyState).to.be.at.least(1),
    );
    cy.get('[data-side="a"]').should('not.contain', 'This clip could not be played');
    // Both sides now play an original, so the note must not claim a web encode.
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should('not.contain', 'web encode');
  });
});
