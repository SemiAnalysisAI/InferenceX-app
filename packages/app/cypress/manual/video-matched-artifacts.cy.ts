import { expectNoPageOverflow } from '../support/e2e';

const run = '41280191475';
const artifacts = { b200: 13074345365, h100: 13074376724 };
const selection = `unofficialrun=${run}&r_hidden=gb200,mi355x,h200`;
const overview = `/api/v1/views/video?view=overview&${selection}`;

describe('matched original H100 and B200 artifacts', () => {
  it('preserves independent artifact identities and matching workload in History, JSON and CSV', () => {
    cy.request('/api/video-runs?format=history').then(({ body, headers }) => {
      expect(headers['x-videogenx-replay']).to.equal('1');
      const entries = body.entries.filter((entry: { runId: string }) => entry.runId === run);
      expect(
        entries.map((entry: { artifact: { id: number } }) => entry.artifact.id).sort(),
      ).to.deep.equal(Object.values(artifacts).sort());
      for (const entry of entries) {
        expect(entry.approved).to.equal(false);
        expect(entry.publishedAt).to.equal(null);
        expect(entry.sources[0].releaseQualified).to.equal(false);
      }
    });
    cy.request(overview).then(({ body }) => {
      expect(body.cells).to.have.length(0);
      expect(body.overlayCells).to.have.length(2);
      const cells = body.overlayCells;
      expect(body.clipQuality.status).to.equal('ready');
      expect(body.clipQuality.groups).to.have.length(20);
      for (const group of body.clipQuality.groups) {
        expect(group.clips).to.have.length(2);
        expect(
          new Set(
            group.clips.map(
              (clip: { quality: { reference: { media_sha256: string } } }) =>
                clip.quality.reference.media_sha256,
            ),
          ).size,
        ).to.equal(1);
        for (const clip of group.clips) {
          if (clip.quality.status === 'identical') {
            expect(clip.quality.psnrDb).to.equal(null);
          } else {
            expect(clip.quality.status).to.equal('measured');
            expect(Number.isFinite(clip.quality.psnrDb)).to.equal(true);
          }
          expect(clip.quality.comparedFrames).to.equal(124);
          expect(clip.quality.totalFrames).to.equal(124);
          expect(clip.quality.candidate.artifact_id).to.equal(
            artifacts[clip.hardware as keyof typeof artifacts],
          );
          expect(clip.quality.candidate.prompt).to.equal(group.prompt);
          expect(clip.quality.candidate.seed).to.equal(group.seed);
          expect(clip.quality.reference.implementation).to.equal('official-diffusers-t2va');
          expect(clip.quality.reference.denoising_updates).to.equal(49);
          expect(clip.quality.reference.sigma_points).to.equal(50);
          expect(clip.quality.qualityStatus).to.equal('unjudged');
          expect(clip.quality.releaseQualified).to.equal(false);
        }
      }
      expect(JSON.stringify(body.clipQuality)).not.to.match(/\/Users\/|\/data\/home\//);
      expect(
        new Set(cells.map((cell: { point: { workloadKey: string } }) => cell.point.workloadKey))
          .size,
      ).to.equal(1);
      for (const cell of cells) {
        const hardware = cell.point.hardwareKey as keyof typeof artifacts;
        expect(cell.point.artifactId).to.equal(artifacts[hardware]);
        expect(cell.point.runId).to.equal(run);
        expect(cell.point.approved).to.equal(false);
        expect(cell.point.valid).to.equal(20);
        expect(cell.point.participating).to.equal(4);
        expect(cell.point.allocated).to.equal(8);
        expect(cell.deliveryP50).to.be.greaterThan(0);
        expect(cell.evidence.powerSeries.length).to.be.greaterThan(500);
        expect(cell.cost.participating).not.to.equal(null);
        expect(cell.cost.allocated.perVideo).to.equal(cell.cost.participating.perVideo * 2);
      }
      cy.request(`${overview}&format=csv`).then(({ body: csv }) => {
        for (const cell of cells) {
          expect(csv).to.contain(cell.point.id);
          expect(csv).to.contain(String(cell.deliveryP50));
        }
      });
    });
  });

  for (const [width, path] of [
    [1440, '/video'],
    [390, '/video'],
    [320, '/zh/video'],
  ] as const) {
    it(`plays and scrubs both matching original videos at ${width}px ${path}`, () => {
      cy.viewport(width, 900);
      cy.visit(`${path}?${selection}`);
      cy.get('[data-testid="results-overlay"]').should('contain', run);
      cy.get('[data-testid="video-results-clip"]').should('have.length', 2);
      cy.get('[data-testid="video-results-reference"]').should('contain', 'Diffusers');
      cy.get('[data-hardware="b200"]').should('contain', '26.18 dB');
      cy.get('[data-hardware="h100"]').should('contain', '25.39 dB');
      for (const [hardware, artifact] of Object.entries(artifacts)) {
        cy.get(`[data-hardware="${hardware}"] video`)
          .should('have.attr', 'src')
          .and('contain', `artifact=${artifact}`);
      }
      cy.get<HTMLVideoElement>('[data-testid="video-results-clip"] video').should(($videos) => {
        expect($videos).to.have.length(2);
        for (const video of $videos) {
          expect(video.readyState).to.be.at.least(1);
          expect(video.videoWidth).to.equal(1344);
          expect(video.videoHeight).to.equal(768);
        }
        if (width >= 390) {
          expect(
            Math.abs(
              $videos[0].getBoundingClientRect().top - $videos[1].getBoundingClientRect().top,
            ),
          ).to.be.lessThan(2);
        }
      });
      cy.get('[data-testid="video-results-play"]').click();
      cy.get<HTMLVideoElement>('[data-testid="video-results-clips"] video').should(($videos) => {
        expect($videos).to.have.length(3);
        for (const video of $videos) expect(video.currentTime).to.be.greaterThan(0);
      });
      cy.get('[data-testid="video-results-play"]').click();
      cy.get('[data-testid="video-results-scrub"]').invoke('val', '1').trigger('input');
      cy.get<HTMLVideoElement>('[data-testid="video-results-clips"] video').should(($videos) => {
        for (const video of $videos) expect(video.currentTime).to.be.within(0.98, 1.1);
      });
      cy.get('[data-testid="video-results-view"][data-view="difference"]').click();
      cy.get<HTMLCanvasElement>('[data-testid="video-results-clip"] canvas').should(($canvases) => {
        expect($canvases).to.have.length(2);
        for (const canvas of $canvases) {
          expect(canvas.width).to.equal(1344);
          expect(canvas.height).to.equal(768);
          const pixels = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          expect(pixels.some((value, index) => index % 4 !== 3 && value > 0)).to.equal(true);
        }
      });
      cy.get('[data-testid="video-results-view"][data-view="clip"]').click();
      expectNoPageOverflow();
      cy.get('[data-testid="video-results-clips"]').screenshot(
        `matched-hardware-${width}-${path.startsWith('/zh') ? 'zh' : 'en'}`,
        { overwrite: true },
      );
      cy.get('[data-testid="results-overlay-dismiss"]').click();
      cy.get<HTMLVideoElement>('[data-testid="video-results-clip"] video').should('not.exist');
      cy.get('[data-testid="video-results-reference"]').should('not.exist');
    });
  }

  it('selects every matched case with the same per-clip scores and reference as the API', () => {
    cy.viewport(1440, 900);
    cy.request(overview).then(({ body }) => {
      cy.visit(`/video?${selection}`);
      for (const group of body.clipQuality.groups) {
        const caseId = group.clips[0].caseId;
        cy.get('[data-testid="video-results-case"]').click();
        cy.contains('[role="option"]', caseId).click();
        cy.get('[data-testid="video-results-prompt"]').should('contain', group.prompt);
        for (const clip of group.clips) {
          cy.get(`[data-testid="video-results-clip"][data-hardware="${clip.hardware}"]`)
            .contains('dt', 'PSNR')
            .next('dd')
            .should(($score) => {
              const value = $score.text().trim();
              if (clip.quality.status === 'identical') {
                expect(value).to.equal('Exact match');
              } else {
                expect(value).to.match(/^\d+(?:\.\d{1,2})? dB$/);
                expect(Number.parseFloat(value)).to.equal(Number(clip.quality.psnrDb.toFixed(2)));
              }
            });
        }
        cy.get('[data-testid="video-results-reference"] video').should(($video) => {
          expect($video.attr('src')).to.be.oneOf(
            group.clips.map(
              (clip: { quality: { reference: { url: string } } }) => clip.quality.reference.url,
            ),
          );
        });
      }
      expectNoPageOverflow();
    });
  });
});
