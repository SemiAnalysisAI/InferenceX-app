import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import VideoResultsClips from '@/components/video-benchmark/VideoResultsClips';
import history from '../fixtures/api/video-history.json';
import { servingArtifact } from '../support/video-artifacts';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';

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
/** The Wipe split, read from the right side's clip-path. */
const splitOf = ($media: JQuery<HTMLElement>) =>
  Number(/(?<split>[\d.]+)%/u.exec($media[0].style.clipPath)?.groups?.split);
const WIPE_MEDIA = '[data-side="b"] > div';
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

// These decoder fixtures are test inputs, never benchmark evidence.
function mountResultsClips(
  keys = ['b200', 'h200'],
  pathname = '/vgx',
  diagnostics = false,
  unofficialRun?: string,
  previews: string[] = [],
  brokenPreview = false,
  unpublished: string[] = [],
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
          );
          saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
            path,
            path === 'manifest.json' ? point.id.split(':')[0] : sha,
          ]);
          saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
            path,
            previews.includes(key)
              ? { ...asset, url, previewUrl: referenceMedia.previewUrl }
              : { ...asset, url },
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
  const selectedPoints = keys.map(c1);
  function Clips() {
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
    return (
      <PathnameContext.Provider value={pathname}>
        <button onClick={() => setHidden(hidden.size > 0 ? new Set() : new Set(['b200']))}>
          Toggle B200
        </button>
        <input aria-label="Notes" />
        <VideoResultsClips
          points={selectedPoints}
          colorFor={colorFor}
          hidden={hidden}
          costs={{ [c1('b200').id]: { participating: 0.02, allocated: null } }}
          unofficialRun={unofficialRun}
        />
      </PathnameContext.Provider>
    );
  }
  cy.mount(<Clips />);
  cy.wait(keys.map((key) => `@results-${key}` as const));
}

describe('Video results clip stage', () => {
  beforeEach(() => {
    // The stage keeps its view and prompt in the URL, which outlives one test's mount.
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
  });

  it('keeps one audible side, also across a prompt switch', () => {
    mountResultsClips(['b200', 'h100'], '/vgx', true);
    expectAudio(null);
    speaker('a').click();
    expectAudio('a');
    cy.get('[data-testid="video-results-play"]').click();
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
    cy.viewport(390, 900);
    mountResultsClips(['b200', 'h100'], '/zh/vgx', false, c1('b200').runId);
    cy.get('[data-side="a"]').should('contain', 'B200').and('contain', '非官方运行');
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
      expect(b.top, 'stacked below 640 px').to.be.at.least(a.bottom);
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
    cy.get('[data-prompt="diag:drum-taps"]')
      .should('have.attr', 'aria-pressed', 'true')
      .and('contain', 'Matched-noise rerun');
    cy.get('[data-side="a"]').should('contain', '4 GPU');
    const facts = '[data-testid="video-results-facts"]';
    cy.get(facts).should('contain', '30 dB');
    for (const label of ['Wall time', 'J / clip', 'Participating', 'Allocated'])
      cy.get(facts).contains('dt', label).next('dd').should('have.text', '—');
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
    cy.get('[data-prompt="drum-taps"]').click();
    cy.get(facts).should('contain', '25 dB');
    cy.get(facts).contains('dt', 'Wall time').next('dd').should('have.text', '120 s');
    cy.get(facts).contains('dt', 'Participating').next('dd').should('have.text', '0.02');
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
    cy.get('[data-testid="video-results-facts"]').should('contain', '0.02');

    load('[data-testid="video-results-start"]');
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
    // H200's clip equals the reference, so the next subject draws a black difference.
    cy.contains('button', 'Toggle B200').click();
    cy.get('[data-side="a"]').should('contain', 'H200');
    expectDifference((rgba) => expect(rgba).to.deep.equal([0, 0, 0, 255]));
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

  it('shows PSNR without media for an unpublished named run', () => {
    mountResultsClips(['b200'], '/vgx', false, c1('b200').runId, [], false, ['b200']);
    cy.get('[data-side="a"]')
      .should('contain', 'Media is not shown for an unpublished run.')
      .and('contain', 'Unofficial run')
      .find('video')
      .should('not.exist');
    cy.get('[data-testid="video-results-facts"]').should('contain', '25 dB');
    cy.get('[data-side="b"]').should('contain', 'No sealed reference pair for this clip.');
    cy.get('[data-testid="video-results-play"]').should('be.disabled');
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
