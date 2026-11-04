describe('original H100 artifact through the local development replay', () => {
  const run = '41266176201';
  const artifact = 13068476608;
  const overview = `/api/v1/views/video?view=overview&unofficialrun=${run}&r_tier=r`;

  it('changes GPU count without updating the router during render', () => {
    cy.visit(`/video?unofficialrun=${run}`, {
      onBeforeLoad(win) {
        cy.spy(win.console, 'error').as('consoleError');
      },
    });
    cy.get('[data-testid="results-replay"]').should('be.visible');
    cy.contains(
      '[data-testid="results-workload-summary"]',
      'MiniMaxAI/MiniMax-H3 · 1344×768 · 5 s · 24 fps · 49 steps',
    );
    cy.contains('[role="group"] button', /^4$/).click({
      scrollBehavior: 'center',
    });
    cy.location('search').should('include', 'r_gpus=4');
    cy.get('[data-testid="results-row"][data-hardware="h100"] button').click();
    cy.get('[data-testid="results-power-trace"] circle').should('have.length', 1478);
    cy.get('@consoleError').should('not.be.calledWithMatch', /Cannot update a component/);
  });

  it('keeps History, JSON, CSV and original stored bytes on the same unapproved source', () => {
    cy.request('/api/video-runs?format=history&page=1').then(({ status, headers, body }) => {
      expect(status).to.equal(200);
      expect(headers['x-videogenx-replay'], 'explicit replay must be active').to.equal('1');
      const entries = body.entries.filter(
        (entry: { runId: string; artifact: { id: number } }) =>
          entry.runId === run && entry.artifact.id === artifact,
      );
      expect(entries).to.have.length(1);
      const entry = entries[0];
      expect(entry.runId).to.equal(run);
      expect(entry.artifact.id).to.equal(artifact);
      expect(entry.approved).to.equal(false);
      expect(entry.publishedAt).to.equal(null);
      expect(entry.sources).to.have.length(1);
      expect(entry.sources[0].releaseQualified).to.equal(false);
      const observation = entry.sources[0].observations.find(
        (item: { cell: string }) => item.cell === 'c1',
      );
      expect(observation.scheduled).to.equal(20);
      expect(observation.valid).to.equal(20);
      expect(observation.participating).to.equal(4);
      expect(observation.allocated).to.equal(8);
      expect(observation.results.powerSeries).to.have.length(1478);
    });
    cy.request(`/api/video-runs?run=${run}&artifact=${artifact}&format=published`).then(
      ({ body }) => {
        expect(body.runId).to.equal(run);
        expect(body.artifact.id).to.equal(artifact);
        const documents = Object.fromEntries(body.sources[0].documents) as Record<
          string,
          { records?: { phase: string }[] }
        >;
        const runDocument = Object.values(documents).find(
          (doc) =>
            Array.isArray(doc.records) && doc.records.some((record) => record.phase === 'warmup'),
        );
        expect(runDocument, 'source run records').not.to.equal(undefined);
        expect(
          runDocument!.records!.filter((record) => record.phase === 'measurement'),
        ).to.have.length(20);
        expect(runDocument!.records!.filter((record) => record.phase === 'warmup')).to.have.length(
          1,
        );
        const asset = body.sources[0].assets.find(([path]: [string]) => path.endsWith('.mp4'));
        expect(asset, 'verified original MP4').not.to.equal(undefined);
        cy.request({ method: 'HEAD', url: asset[1].url }).then((response) => {
          expect(response.status).to.equal(200);
          expect(Number(response.headers['content-length'])).to.be.greaterThan(32);
          expect(response.headers['accept-ranges']).to.equal('bytes');
        });
        cy.request({
          url: asset[1].url,
          headers: { Range: 'bytes=0-31' },
          encoding: 'binary',
        }).then((response) => {
          expect(response.status).to.equal(206);
          expect(response.headers['content-range']).to.match(/^bytes 0-31\/\d+$/);
          expect(response.body).to.have.length(32);
        });
      },
    );
    cy.request(overview).then(({ status, body }) => {
      expect(status).to.equal(200);
      expect(body.cells).to.have.length(0);
      expect(body.overlayCells).to.have.length(1);
      const cell = body.overlayCells[0];
      expect(cell.point.runId).to.equal(run);
      expect(cell.point.artifactId).to.equal(artifact);
      expect(cell.point.approved).to.equal(false);
      expect(cell.point.participating).to.equal(4);
      expect(cell.point.allocated).to.equal(8);
      expect(cell.deliveryP50).to.equal(73.88155640591867);
      expect(cell.evidence.powerSeries).to.have.length(1478);
      expect(cell.cost.participating).not.to.equal(null);
      expect(cell.cost.allocated).not.to.equal(null);
      cy.request(`${overview}&format=csv`).then(({ status: csvStatus, headers, body: csv }) => {
        expect(csvStatus).to.equal(200);
        expect(headers['cache-control']).to.equal('private, no-store');
        expect(csv).to.contain(cell.point.id);
        expect(csv).to.contain(String(cell.cost.participating.perVideo));
        expect(csv).to.contain(String(cell.cost.allocated.perVideo));
        expect(csv).to.contain('named,false,');
      });
    });
  });
});
