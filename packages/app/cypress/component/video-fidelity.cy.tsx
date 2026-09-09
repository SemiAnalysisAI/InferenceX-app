import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import FidelityResults from '@/components/video-benchmark/FidelityResults';
import { fidelityFixture } from '@/components/video-benchmark/fidelity.fixture';
import { at } from '@/components/video-benchmark/bundle';

// Synthetic non-playable bytes validate controls, URL binding, and accounting only.
// Actual decoded video/audio playback is verified separately using retained CI output.
const mount = (props: React.ComponentProps<typeof FidelityResults>, locale = '/video') =>
  cy.mount(
    <PathnameContext.Provider value={locale}>
      <FidelityResults {...props} />
    </PathnameContext.Provider>,
  );

describe('Native paired fidelity UI (synthetic artifacts)', () => {
  it('distinguishes valid media from 18 threshold failures and changes both selected videos', () => {
    cy.then(() => fidelityFixture({ pairs: 20, failedPairs: 18 })).then((fixture) => {
      mount({ published: fixture.published, runId: fixture.runId });
      cy.contains('p', 'Matched valid pairs').next().should('have.text', '20');
      cy.contains('p', 'Pairs outside fidelity thresholds').next().should('have.text', '18');
      cy.contains('dt', 'Threshold calibration').next().should('have.text', 'Uncalibrated');
      cy.contains('dt', 'Release qualified').next().should('have.text', 'No');
      cy.contains('dt', 'Video/audio technical validity').next().should('have.text', 'Yes');
      for (const role of ['Baseline', 'Candidate'])
        cy.get(`video[aria-label="${role}"]`)
          .should('have.prop', 'controls', true)
          .and('have.prop', 'muted', false)
          .and('have.attr', 'preload', 'metadata');
      const initial = ['baseline', 'candidate'].map(
        (role) => `report/${at(fixture.portable, 'slots', 0, role, 'artifact_path')}`,
      );
      const next = ['baseline', 'candidate'].map(
        (role) => `report/${at(fixture.portable, 'slots', 1, role, 'artifact_path')}`,
      );
      for (const [index, role] of ['Baseline', 'Candidate'].entries())
        cy.get(`video[aria-label="${role}"]`).should(
          'have.attr',
          'src',
          fixture.published.assets.find(([path]) => path === initial[index])![1].url,
        );
      cy.get('[aria-label="Paired clip"]').click();
      cy.get('[role="option"]').should('have.length', 20);
      cy.contains('[role="option"]', 'synthetic-case-2').click();
      for (const [index, role] of ['Baseline', 'Candidate'].entries())
        cy.get(`video[aria-label="${role}"]`).should(
          'have.attr',
          'src',
          fixture.published.assets.find(([path]) => path === next[index])![1].url,
        );
      cy.contains('Synthetic test prompt 2').should('be.visible');
      cy.contains('a', 'Raw comparison JSON').should(
        'have.attr',
        'href',
        fixture.published.assets.find(([path]) => path === 'comparison.json')![1].downloadUrl,
      );
      cy.contains('a', 'CI #101').should(
        'have.attr',
        'href',
        'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/101',
      );
    });
  });

  it('rewrites report media/download links and removes scripts and external resources', () => {
    cy.then(() => fidelityFixture()).then((fixture) => {
      mount({ published: fixture.published, runId: fixture.runId });
      cy.contains('summary', 'Original report').click();
      cy.get<HTMLIFrameElement>('iframe')
        .should('have.attr', 'sandbox', 'allow-same-origin allow-downloads')
        .should(($iframe) => {
          const doc = $iframe[0].contentDocument!;
          const path = `report/${at(fixture.portable, 'slots', 0, 'baseline', 'artifact_path')}`;
          expect(doc.querySelector('video')?.getAttribute('src')).to.equal(
            fixture.published.assets.find(([key]) => key === path)![1].url,
          );
          expect(doc.querySelector('a')?.getAttribute('href')).to.equal(
            fixture.published.assets.find(([key]) => key === 'report/index.comparison.json')![1]
              .url,
          );
          expect(doc.querySelectorAll('script')).to.have.length(0);
          expect(doc.querySelector('img')?.hasAttribute('src')).to.equal(false);
          expect(doc.body.dataset.scriptRan).to.equal(undefined);
        });
    });
  });

  it('loads a raw sealed bundle and revokes owned object URLs when unmounted', () => {
    cy.window().then((win) => {
      cy.spy(win.URL, 'revokeObjectURL').as('revoke');
    });
    cy.then(() => fidelityFixture()).then((fixture) => {
      mount({ reader: fixture.read, runId: fixture.runId });
      cy.get('[data-testid="fidelity-results"]').should('be.visible');
      cy.get('video[aria-label="Baseline"]')
        .invoke('attr', 'src')
        .then((url) => {
          expect(url).to.match(/^blob:/u);
          cy.mount(<p>Unmounted synthetic reader</p>);
          cy.get('@revoke').should('have.been.calledWith', url);
        });
    });
  });

  it('clears old evidence and reports an invalid or empty comparison', () => {
    cy.then(() => fidelityFixture()).then((fixture) => {
      mount({ published: fixture.published, runId: fixture.runId });
      cy.get('[data-testid="fidelity-results"]').should('be.visible');
      const invalid = structuredClone(fixture.published);
      for (const [path, value] of invalid.documents)
        if (['comparison.json', 'report/index.comparison.json'].includes(path))
          Object.assign(value!, { slots: [] });
      mount({ published: invalid, runId: fixture.runId });
      cy.contains('[role="alert"]', 'Could not load paired evidence').should('be.visible');
      cy.get('[data-testid="fidelity-results"]').should('not.exist');
      cy.get('video').should('not.exist');
    });
  });

  it('renders Chinese status and original-audio controls without relabeling failures as invalid media', () => {
    cy.then(() => fidelityFixture()).then((fixture) => {
      mount({ published: fixture.published, runId: fixture.runId }, '/zh/video');
      cy.contains('成对视频保真度').should('be.visible');
      cy.contains('p', '超出保真度阈值的视频对').next().should('have.text', '1');
      cy.contains('dt', '视频与音频技术有效性').next().should('have.text', '是');
      cy.contains('dt', '阈值校准状态').next().should('have.text', '未校准');
      cy.get('video[aria-label="基线"]').should('have.prop', 'muted', false);
      cy.get('video[aria-label="候选"]').should('have.prop', 'controls', true);
    });
  });
});
