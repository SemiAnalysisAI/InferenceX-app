import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import VideoResultsClips from '@/components/video-benchmark/VideoResultsClips';
import history from '../fixtures/api/video-history.json';
import { servingArtifact } from '../support/video-artifacts';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { verifiedReferencePairs } from '@/components/video-benchmark/reference-quality';

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
const pick = (label: string, option: string) => {
  cy.get(`[role="combobox"][aria-label="${label}"]`).click();
  cy.contains('[role="option"]', option).click();
};
const expectAudio = (source: string | null) =>
  cy.get<HTMLVideoElement>('video').should(($videos) => {
    for (const video of $videos) {
      const hardware = video.closest<HTMLElement>('[data-hardware]')?.dataset.hardware;
      expect(video.muted, hardware ?? 'reference').to.equal(!source || hardware !== source);
    }
  });

// These decoder fixtures are test inputs, never benchmark evidence.
function mountResultsClips(
  keys = ['b200', 'h200'],
  pathname = '/video',
  diagnostics = false,
  unofficialRun?: string,
) {
  const referenceMedia = { url: '', diagnosticUrl: '' };
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
            { ...asset, url },
          ]);
          const qualityFixture = referenceQualityFixture();
          const [quality] = verifiedReferencePairs(
            qualityFixture.attachment,
            qualityFixture.receipts,
            [qualityFixture.stored],
            '9'.repeat(64),
          );
          quality.candidate = {
            ...quality.candidate,
            run_id: point.runId,
            artifact_id: point.artifactId,
            source_id: saved.sources[0].id,
            manifest_sha256: point.id.split(':')[0],
          };
          quality.reference.url = referenceMedia.url;
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
          cy.intercept('GET', mediaUrl(point), saved).as(`results-${key}`);
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

describe('Video results synchronized clips', () => {
  it('selects one audio source during playback and resets audio when the case changes', () => {
    mountResultsClips(['b200', 'h100'], '/video', true);
    expectAudio(null);
    cy.get('[data-testid="video-results-audio"]').should('contain', 'Muted').click();
    cy.get('[role="option"]').should(($options) => {
      expect([...$options].map((option) => option.textContent)).to.deep.equal([
        'Muted',
        'Listen to B200',
        'Listen to H100',
      ]);
    });
    cy.contains('[role="option"]', 'Listen to B200').click();
    expectAudio('b200');
    cy.get<HTMLVideoElement>('video').then(($videos) => {
      for (const video of $videos) video.playbackRate = 0.1;
    });
    cy.get('[data-testid="video-results-play"]').click();
    pick('Audio', 'Listen to H100');
    expectAudio('h100');
    cy.get<HTMLVideoElement>('[data-hardware="h100"] video').should(($video) => {
      expect($video[0].paused).to.equal(false);
    });
    cy.screenshot('audio-desktop-en');
    pick('Audio', 'Muted');
    expectAudio(null);
    pick('Audio', 'Listen to B200');
    pick('Case', 'drum-taps · take 1');
    expectAudio(null);
    cy.get('[data-testid="video-results-audio"]').should('contain', 'Muted');
  });

  it('resets hidden or failed audio sources and supports the Chinese unofficial-run view', () => {
    cy.viewport(390, 900);
    mountResultsClips(['b200', 'h100'], '/zh/video', false, c1('h100').runId);
    cy.get('[data-hardware="h100"]').should('contain', '非官方运行');
    pick('音频', '收听 B200');
    expectAudio('b200');
    cy.contains('button', 'Toggle B200').click();
    expectAudio(null);
    cy.get('[data-testid="video-results-audio"]').should('contain', '静音').click();
    cy.get('[role="option"]').should('have.length', 2).and('not.contain', 'B200');
    cy.contains('[role="option"]', '静音').click();
    cy.contains('button', 'Toggle B200').click();
    expectAudio(null);
    pick('音频', '收听 H100');
    expectAudio('h100');
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.screenshot('audio-mobile-zh');
    cy.get<HTMLVideoElement>('[data-hardware="h100"] video').then(($video) => {
      $video[0].src = 'data:video/mp4;base64,YmFk';
      $video[0].load();
    });
    expectAudio(null);
    cy.get('[data-testid="video-results-audio"]').should('contain', '静音').click();
    cy.get('[role="option"]').should('have.length', 2).and('not.contain', 'H100');
  });

  it('keeps native rerun media and PSNR separate from the original CI performance', () => {
    cy.viewport(390, 900);
    mountResultsClips(['b200', 'h100'], '/video', true);
    cy.get('[data-testid="video-results-case"]').should('contain', 'Matched-noise rerun');
    const tile = '[data-testid="video-results-clip"][data-hardware="b200"]';
    cy.get(tile).should('contain', '30 dB').and('contain', '4 GPU');
    for (const label of ['wall time', 'J / clip', 'Participating', 'Allocated'])
      cy.get(tile).contains('dt', label).next('dd').should('have.text', '—');
    cy.get('@diagnostic-b200-url').then((url) =>
      cy.get(tile).find('video').should('have.attr', 'src', url),
    );
    cy.get('@diagnostic-reference-url').then((url) =>
      cy.get('[data-testid="video-results-reference"] video').should('have.attr', 'src', url),
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
    pick('Case', 'drum-taps · take 1');
    cy.get(tile).should('contain', '25 dB');
    cy.get(tile).contains('dt', 'wall time').next('dd').should('have.text', '120 s');
    cy.get(tile).contains('dt', 'Participating').next('dd').should('have.text', '0.02');
    cy.get('[data-testid="video-results-sources"]').should('contain', c1('b200').runId);
  });

  it('decodes retained media, seeks and plays all three clips, then displays real pixel differences', () => {
    mountResultsClips(['b200', 'h200', 'h100']);
    cy.get('[data-testid="video-results-clip"] video')
      .should('have.length', 3)
      .each(($video) => {
        cy.wrap($video).should(($element) => {
          const video = $element[0] as HTMLVideoElement;
          expect(video.readyState).to.be.greaterThan(0.8);
          expect(video.videoWidth).to.equal(32);
          expect(video.duration).to.equal(2);
        });
      });
    cy.get('[data-testid="video-results-sources"]').should('not.have.attr', 'open');
    cy.get('[data-testid="video-results-sources"] summary').focus();
    cy.focused().should('contain', 'Prompt & sources').click();
    cy.get('[data-testid="video-results-sources"]')
      .should('contain', c1('b200').runId)
      .and('contain', c1('b200').runtime)
      .and('contain', c1('h200').runId)
      .and('contain', c1('h100').runId);

    cy.get('[data-testid="video-results-prompt"]')
      .should('contain', 'A drummer taps a snare drum.')
      .and('contain', 'seed 11')
      .and('contain', 'take 1');
    cy.window().then((win) => {
      cy.get('[data-testid="video-results-scrub"]').then(($input) => {
        const setValue = Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'value',
        )!.set!;
        setValue.call($input[0], '0.8');
        $input[0].dispatchEvent(new win.Event('input', { bubbles: true }));
      });
    });
    cy.get('[data-testid="video-results-scrub"]').should('have.value', '0.8');
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy
        .wrap($video)
        .should(($element) =>
          expect(($element[0] as HTMLVideoElement).currentTime).to.be.closeTo(0.8, 0.08),
        ),
    );
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.paused).to.equal(false);
        expect(video.currentTime).to.be.greaterThan(0.8);
      }),
    );
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy
        .wrap($video)
        .should(($element) => expect(($element[0] as HTMLVideoElement).paused).to.equal(true)),
    );
    cy.get('[data-testid="video-results-view"][data-view="difference"]').click();
    cy.get('[data-testid="video-results-clip"][data-hardware="h200"] canvas').should(($canvas) => {
      const rgba = ($canvas[0] as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 1, 1).data;
      expect([...rgba]).to.deep.equal([0, 0, 0, 255]);
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] canvas').should(($canvas) => {
      const rgba = ($canvas[0] as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 1, 1).data;
      expect(rgba[0]).to.be.greaterThan(200);
      expect(rgba[2]).to.be.greaterThan(200);
      expect(rgba[3]).to.equal(255);
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]')
      .should('contain', '0.02')
      .find('dl')
      .should('contain', '—');
  });
  it('keeps unknown hardware empty and cannot draw a difference after the reference decoder fails', () => {
    mountResultsClips();
    cy.get('[data-testid="video-results-clip"]').should('have.length', 4);
    cy.get('[data-testid="video-results-clip"][data-hardware="gb200"] video').should('not.exist');
    cy.get('[data-testid="video-results-clip"][data-hardware="mi355x"] video').should('not.exist');
    cy.get('[data-testid="video-results-clip"][data-hardware="gb200"]').should(
      'not.contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-clip"][data-hardware="mi355x"]').should(
      'not.contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-reference"] video').then(($video) => {
      const video = $video[0] as HTMLVideoElement;
      video.src = 'data:video/mp4;base64,YmFk';
      video.load();
    });
    cy.get('[data-testid="video-results-view"][data-view="difference"]').click();
    cy.get(
      '[data-testid="video-results-clip"][data-hardware="b200"] [data-testid="video-results-media-empty"]',
    ).should('contain', 'reference');
    cy.get('[data-testid="video-results-clips"]').should(
      'contain',
      'No sealed reference pair for this clip.',
    );
  });
});
