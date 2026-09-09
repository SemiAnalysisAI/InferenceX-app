import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import ResultPower from '@/components/video-benchmark/ResultPower';

const run = (id: number, conclusion: string) => ({
  id,
  name: `H3 fixture ${id}`,
  run_attempt: 1,
  head_sha: 'a'.repeat(40),
  created_at: '2026-09-09T00:00:00Z',
  status: 'completed',
  conclusion,
  html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${id}`,
});

describe('H3 automatic CI viewer (synthetic API fixtures)', () => {
  beforeEach(() => {
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
  });
  it('loads the newest run automatically and switches to a failed run without inventing media', () => {
    cy.intercept('GET', '/api/video-runs?page=1', {
      runs: [run(20, 'success'), run(10, 'failure')],
      nextPage: null,
    });
    cy.intercept('GET', '/api/video-runs?run=20', { run: run(20, 'success'), artifacts: [] }).as(
      'latest',
    );
    cy.intercept('GET', '/api/video-runs?run=10', { run: run(10, 'failure'), artifacts: [] }).as(
      'failed',
    );
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.wait('@latest');
    cy.contains('No result artifact for this run yet').should('be.visible');
    cy.get('select[aria-label="CI run"]').select('10');
    cy.wait('@failed');
    cy.contains('a', '#10 · completed / failure').should('be.visible');
    cy.get('video').should('not.exist');
  });
  it('reports expiration without downloading or substituting another artifact', () => {
    cy.intercept('GET', '/api/video-runs?page=1', { runs: [run(30, 'success')], nextPage: null });
    cy.intercept('GET', '/api/video-runs?run=30', {
      run: run(30, 'success'),
      artifacts: [{ id: 40, name: 'h3-results-30-1', expired: true, size_in_bytes: 100 }],
    });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoCIRuns />
      </PathnameContext.Provider>,
    );
    cy.get('[role="alert"]').should('contain', 'Expired');
    cy.get('video').should('not.exist');
    cy.get('select[aria-label="Result artifact"]').should('have.value', '40');
  });
  it('withholds invalid generation measurements and separates warmup energy', () => {
    const power = {
      phases: {
        measurement: {
          valid: false,
          status: 'invalid',
          invalid_reasons: ['unbracketed'],
          aggregate: { avg_power_w: 999 },
        },
        warmup: {
          valid: true,
          status: 'valid',
          duration_seconds: 2,
          aggregate: {
            avg_power_w: 100,
            energy_j: 200,
            joules_per_valid_clip: 200,
            observed_peak_power_w: 110,
          },
          per_gpu: { 'GPU-fixture': { avg_power_w: 100, observed_peak_power_w: 110 } },
        },
      },
    };
    cy.mount(
      <PathnameContext.Provider value="/video">
        <ResultPower result={{ roles: { baseline: { power }, candidate: { power } } }} />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="result-power"]')
      .should('contain', 'unbracketed')
      .and('not.contain', '999');
    cy.get('select[aria-label="Power window"]').select('warmup');
    cy.get('[data-testid="result-power"]')
      .should('contain', '0.2')
      .and('contain', 'GPU-fixture')
      .and('not.contain', 'unbracketed');
  });
});
