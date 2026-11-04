describe('matched original H100 and B200 artifacts', () => {
  const run = '41280191475';
  const artifacts = { b200: 13074345365, h100: 13074376724 };
  const selection = `unofficialrun=${run}&r_hidden=gb200,mi355x,h200`;
  const overview = `/api/v1/views/video?view=overview&${selection}`;

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
      const original = body.clipQuality.groups.filter(
        (group: { scope: string }) => group.scope === 'ci',
      );
      const diagnostics = body.clipQuality.groups.filter(
        (group: { scope: string }) => group.scope === 'matched-noise-diagnostic',
      );
      expect(original).to.have.length(20);
      expect(diagnostics).to.have.length(1);
      expect(body.clipQuality.groups).to.have.length(21);
      expect(diagnostics[0].take).to.equal(null);
      expect(diagnostics[0].clips).to.have.length(1);
      const diagnostic = diagnostics[0].clips[0];
      expect(diagnostic.hardware).to.equal('h100');
      expect(diagnostic.pointId).to.equal(null);
      expect(diagnostic.slotId).to.equal(null);
      expect(diagnostic.quality.psnrDb).to.equal(13.231470416302734);
      expect(diagnostic.quality.comparedFrames).to.equal(124);
      expect(diagnostic.quality.releaseQualified).to.equal(false);
      expect(diagnostic.quality.candidate.run_id).not.to.equal(run);
      for (const url of [diagnostic.quality.candidate.url, diagnostic.quality.reference.url]) {
        cy.request({
          url,
          headers: { Range: 'bytes=0-31' },
          encoding: 'binary',
        }).then(({ status, headers, body: bytes }) => {
          expect(status).to.equal(206);
          expect(headers['content-range']).to.match(/^bytes 0-31\/\d+$/);
          expect(bytes).to.have.length(32);
        });
      }
      for (const group of original) {
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
});
