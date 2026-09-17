import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import GpuMetricsDisplay from '@/components/gpu-power/GpuPowerDisplay';
import { createMockRouter } from '../support/mock-router';
import { ServingPowerChart } from '@/components/gpu-power/ServingPowerComparison';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  PowerAuditArtifact,
  PowerAuditWindow,
  ServingPowerTrace,
} from '@/components/gpu-power/power-audit';

const artifact: PowerAuditArtifact = {
  id: 1,
  name: 'power_audit_qwen3.5_8k1k_fp8_gb200',
  samples: [],
  windows: [],
  manifest: {
    source_metric: 'DCGM_FI_DEV_POWER_USAGE',
    power_scope: 'gpu_device_board_as_reported_by_dcgm',
    sample_interval_seconds: 1,
    producer: 'test',
    producer_git_commit: 'abc',
    expected_devices: [],
  },
};
const window: PowerAuditWindow = {
  name: 'window.json',
  concurrency: 4,
  benchmark_start_time_unix: 0,
  benchmark_end_time_unix: 60,
  result_path: 'sa-bench_isl_8192_osl_1024/results_concurrency_4_gpus_8_ctx_4_gen_4.json',
  status: 'completed',
};
const trace: ServingPowerTrace = {
  hardware: 'GB200',
  concurrency: 4,
  duration: 60,
  roles: [
    {
      role: 'prefill',
      gpuCount: 4,
      meanWatts: 1000,
      maxSample: { x: 1, y: 2000 },
      tdpWatts: 4800,
      points: [
        { x: 0, y: 800, boundary: true },
        { x: 1, y: 2000, boundary: false },
        { x: 60, y: 900, boundary: true },
      ],
    },
    {
      role: 'decode',
      gpuCount: 4,
      meanWatts: 1600,
      maxSample: { x: 30, y: 1800 },
      tdpWatts: 4800,
      points: [
        { x: 0, y: 800, boundary: true },
        { x: 30, y: 1800, boundary: false },
        { x: 60, y: 1500, boundary: true },
      ],
    },
  ],
};

const audit: PowerAuditArtifact = {
  ...artifact,
  manifest: {
    ...artifact.manifest,
    expected_devices: [
      { hostname: 'host', gpu_index: 0, assignments: [{ worker_role: 'prefill' }] },
    ],
  },
  samples: [0, 1, 2, 3].map((time) => ({
    timestamp_unix: time,
    scrape_seq: time,
    hostname: 'host',
    gpu_index: 0,
    gpu_uuid: 'GPU-0',
    power_w: 100,
  })),
  windows: [
    {
      ...window,
      benchmark_start_time_unix: 0.5,
      benchmark_end_time_unix: 2.5,
      validation: {
        power_valid: true,
        benchmark_window: { start_time_unix: 0.5, end_time_unix: 2.5 },
        per_gpu_role: { 'host/GPU-0': 'prefill' },
        per_gpu_energy_j: { 'host/GPU-0': 200 },
      },
    },
  ],
};

function mountComparison(key: string) {
  cy.window().then((win) => {
    const search = new URLSearchParams(win.location.search);
    search.set('gm_view', 'serving');
    search.set('gm_runId', '123');
    win.history.replaceState(null, '', `${win.location.pathname}?${search}`);
  });
  return mountPage(key);
}

const mountPage = (key: string) =>
  cy.mount(
    <AppRouterContext.Provider value={createMockRouter()}>
      <QueryClientProvider
        key={key}
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GpuMetricsDisplay />
      </QueryClientProvider>
    </AppRouterContext.Provider>,
  );

describe('serving-window role power figure', () => {
  beforeEach(() => {
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
  });

  it('shares the raw telemetry run, selected artifact and metric from the same page Share', () => {
    cy.window().then((win) =>
      win.history.replaceState(null, '', `${win.location.pathname}?gm_runId=123`),
    );
    cy.intercept('GET', '/api/gpu-metrics?runId=123', {
      runInfo: {
        id: 123,
        name: 'Test',
        branch: 'test',
        sha: 'abc',
        createdAt: '2026-09-01T00:00:00Z',
        url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
        conclusion: 'success',
        status: 'completed',
      },
      artifacts: ['gpu_metrics_first', 'gpu_metrics_second'].map((name) => ({
        name,
        data: [0, 1].map((index) => ({
          timestamp: `2026-09-01T00:00:0${index}Z`,
          index: 0,
          power: 100 + index,
          temperature: 50 + index,
        })),
      })),
    }).as('rawMetrics');
    mountPage('raw');
    cy.wait('@rawMetrics');
    cy.get('[data-testid="gpu-metrics-artifact-select"]').click();
    cy.contains('[data-slot="select-item"]', 'gpu_metrics_second').click();
    cy.get('[data-testid="gpu-metrics-metric-select"]').click();
    cy.contains('[data-slot="select-item"]', 'Temperature').click();
    cy.get('[data-testid="share-button"]').should('have.length', 1).click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.searchParams.get('gm_runId')).to.equal('123');
        expect(url.searchParams.get('gm_artifact')).to.equal('gpu_metrics_second');
        expect(url.searchParams.get('gm_metric')).to.equal('temperature');
        expect(url.searchParams.has('gm_view')).to.equal(false);
        cy.window().then((win) => win.history.replaceState(null, '', url.href));
        mountPage('raw-restored');
      });
    cy.wait('@rawMetrics');
    cy.get('[data-testid="gpu-metrics-artifact-select"]').should('contain', 'gpu_metrics_second');
    cy.get('[data-testid="gpu-metrics-metric-select"]').should('contain', 'Temperature');
  });

  it('shares updated serving sources from the native page Share and restores both panels', () => {
    cy.window().then((win) =>
      win.history.replaceState(null, '', `${win.location.pathname}?gm_view=serving&gm_runId=123`),
    );
    for (const [runId, id] of [
      ['123', 2],
      ['456', 4],
    ] as const) {
      cy.intercept('GET', `/api/gpu-metrics?runId=${runId}&source=power-audit`, {
        runInfo: { id: Number(runId) },
        powerAudits: [
          { ...audit, id: id - 1 },
          {
            ...audit,
            id,
            windows: [
              ...audit.windows,
              { ...audit.windows[0], name: 'second.json', concurrency: 8 },
            ],
          },
        ],
      }).as(`pageAudit${runId}`);
    }
    mountPage('initial');
    cy.wait('@pageAudit123');
    cy.get('#serving-compare-run').type('456');
    cy.contains('button', /^Compare$/u).click();
    cy.wait('@pageAudit456');
    for (const [panel, id] of [
      [0, 2],
      [1, 4],
    ]) {
      cy.get(`#serving-artifact-${panel}`).click();
      cy.contains('[data-slot="select-item"]', `${audit.name} · ${id}`).click();
      cy.get(`#serving-window-${panel}`).click();
      cy.contains('[data-slot="select-item"]', 'Concurrency 8').click();
    }
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-url-input"]')
      .invoke('val')
      .then((value) => {
        const url = new URL(String(value));
        expect(url.searchParams.get('gm_view')).to.equal('serving');
        expect(url.searchParams.get('gm_runId')).to.equal('123');
        expect(url.searchParams.get('gm_compareRunId')).to.equal('456');
        expect(url.searchParams.get('gm_artifactId')).to.equal('2');
        expect(url.searchParams.get('gm_compareArtifactId')).to.equal('4');
        expect(url.searchParams.get('gm_window')).to.equal('second.json');
        expect(url.searchParams.get('gm_compareWindow')).to.equal('second.json');
        cy.window().then((win) => win.history.replaceState(null, '', url.href));
        mountPage('restored');
      });
    cy.wait(['@pageAudit123', '@pageAudit456']);
    cy.get('[data-testid="serving-power-panel"]')
      .should('have.length', 2)
      .each(($panel) => {
        expect($panel.text()).to.contain('Concurrency 8');
      });
    cy.get('a[href$="/123/artifacts/2"]').should('exist');
    cy.get('a[href$="/456/artifacts/4"]').should('exist');
  });

  for (const field of [
    'gm_artifact',
    'gm_window',
    'gm_compareArtifact',
    'gm_compareWindow',
    'gm_artifactId',
    'gm_compareArtifactId',
  ]) {
    it(`does not substitute a different source for an unavailable shared ${field}`, () => {
      const missing = field.endsWith('Id') ? '99999' : 'unavailable-source';
      const search = new URLSearchParams({
        gm_compareRunId: '456',
        gm_artifact: audit.name,
        gm_compareArtifact: audit.name,
      });
      search.set(field, missing);
      cy.window().then((win) =>
        win.history.replaceState(null, '', `${win.location.pathname}?${search}`),
      );
      for (const runId of ['123', '456']) {
        cy.intercept('GET', `/api/gpu-metrics?runId=${runId}&source=power-audit`, {
          runInfo: { id: Number(runId) },
          powerAudits: [audit],
        }).as(`audit${runId}`);
      }
      mountComparison('missing-source');
      cy.wait(['@audit123', '@audit456']);
      cy.get('[data-testid="serving-power-panel"]').should('have.length', 1);
      cy.get('[role="alert"]').should('contain', missing);
      cy.get('[data-testid="share-button"]').should('be.disabled');
      const panel = field.startsWith('gm_compare') ? 1 : 0;
      cy.get(
        `#serving-${field.toLowerCase().includes('artifact') ? 'artifact' : 'window'}-${panel}`,
      ).click();
      cy.get('[data-slot="select-item"]').first().click();
      cy.get('[data-testid="serving-power-panel"]').should('have.length', 2);
      cy.get('[data-testid="share-button"]').should('not.be.disabled');
    });
  }

  it('restores immutable artifact IDs and non-default windows through a shared URL', () => {
    cy.window().then((win) =>
      win.history.replaceState(
        null,
        '',
        `${win.location.pathname}?gm_artifactId=2&gm_window=second.json&gm_compareRunId=456&gm_compareArtifactId=4&gm_compareWindow=second.json`,
      ),
    );
    for (const [runId, id] of [
      ['123', 2],
      ['456', 4],
    ] as const) {
      cy.intercept('GET', `/api/gpu-metrics?runId=${runId}&source=power-audit`, {
        runInfo: { id: Number(runId) },
        powerAudits: [
          { ...audit, id: id - 1 },
          {
            ...audit,
            id,
            windows: [
              ...audit.windows,
              { ...audit.windows[0], name: 'second.json', concurrency: 8 },
            ],
          },
        ],
      }).as(`audit${runId}`);
    }
    mountComparison('initial');
    cy.wait(['@audit123', '@audit456']);
    cy.get('[data-testid="serving-power-panel"]')
      .should('have.length', 2)
      .each(($panel) => {
        expect($panel.text()).to.contain('Concurrency 8');
      });
    cy.window().then((win) => cy.stub(win.navigator.clipboard, 'writeText').as('copy').resolves());
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-copy-button"]').click();
    cy.get<sinon.SinonStub>('@copy')
      .should('have.been.calledOnce')
      .then((stub) => {
        const url = new URL(stub.getCall(0).args[0]);
        expect(url.searchParams.get('gm_artifactId')).to.equal('2');
        expect(url.searchParams.get('gm_compareArtifactId')).to.equal('4');
        expect(url.searchParams.get('gm_window')).to.equal('second.json');
        expect(url.searchParams.get('gm_compareWindow')).to.equal('second.json');
        cy.window().then((win) => win.history.replaceState(null, '', url.href));
        mountComparison('restored');
      });
    cy.wait(['@audit123', '@audit456']);
    cy.get('[data-testid="serving-power-panel"]')
      .should('have.length', 2)
      .each(($panel) => {
        expect($panel.text()).to.contain('Concurrency 8');
      });
    cy.get('a[href$="/123/artifacts/2"]').should('exist');
    cy.get('a[href$="/456/artifacts/4"]').should('exist');
  });
  it('loads a second run and shares both exact artifact/window selections', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '/api/gpu-metrics?runId=123&source=power-audit', {
      runInfo: { id: 123 },
      powerAudits: [audit],
    }).as('firstAudit');
    cy.intercept('GET', '/api/gpu-metrics?runId=456&source=power-audit', {
      runInfo: { id: 456 },
      powerAudits: [{ ...audit, name: 'power_audit_qwen3.5_8k1k_fp8_gb300' }],
    }).as('secondAudit');
    mountComparison('compare-runs');
    cy.wait('@firstAudit');
    cy.get('[data-testid="serving-power-panel"]').should('have.length', 1);
    cy.get('#serving-compare-run').type('456');
    cy.contains('button', /^Compare$/u).click();
    cy.wait('@secondAudit');
    cy.get('[data-testid="serving-power-panel"]').should('have.length', 2);
    cy.get('#serving-window-0, #serving-window-1').each(($trigger) => {
      expect($trigger[0].getBoundingClientRect().right).to.be.at.most(390);
    });
    cy.window().then((win) => cy.stub(win.navigator.clipboard, 'writeText').as('copy').resolves());
    cy.get('[data-testid="share-button"]').click();
    cy.get('[data-testid="share-copy-button"]').click();
    cy.get<sinon.SinonStub>('@copy')
      .should('have.been.calledOnce')
      .then((stub) => {
        const url = new URL(stub.getCall(0).args[0]);
        expect(url.searchParams.get('gm_runId')).to.equal('123');
        expect(url.searchParams.get('gm_compareRunId')).to.equal('456');
        expect(url.searchParams.get('gm_window')).to.equal('window.json');
        expect(url.searchParams.get('gm_compareWindow')).to.equal('window.json');
        expect(url.searchParams.get('gm_view')).to.equal('serving');
      });
  });

  it('renders role identity, measured summaries and the correctly sized TDP reference', () => {
    cy.mount(
      <ServingPowerChart artifact={artifact} window={window} trace={trace} index={0} yMax={6272} />,
    );
    cy.contains('GB200 · 60.0 s');
    cy.contains('Prefill (4 GPUs): Mean 1000 W · Sample max 2000 W');
    cy.get('.line-prefill').should('have.attr', 'stroke-dasharray', '6,4');
    cy.get('.line-decode').should('have.attr', 'stroke-dasharray', 'none');
    cy.get('.serving-tdp-line').should('have.length', 1);
    cy.contains('Registry TDP: 4800 W');
    cy.get('[data-testid="serving-power-chart-0"] svg').should('be.visible');
  });
  it('uses the same zero-based Y range across hardware panels', () => {
    cy.viewport(1200, 800);
    cy.mount(
      <div className="grid grid-cols-2">
        <ServingPowerChart
          artifact={artifact}
          window={window}
          trace={trace}
          index={0}
          yMax={6272}
        />
        <ServingPowerChart
          artifact={artifact}
          window={window}
          trace={{
            ...trace,
            hardware: 'GB300',
            roles: trace.roles.map((r) => ({ ...r, tdpWatts: 5600 })),
          }}
          index={1}
          yMax={6272}
        />
      </div>,
    );
    cy.get('#serving-power-0 .y-axis')
      .invoke('text')
      .then((axis) => cy.get('#serving-power-1 .y-axis').invoke('text').should('eq', axis));
    cy.contains('Registry TDP: 5600 W');
  });
  it('keeps the chart inside a mobile viewport with Chinese annotations', () => {
    cy.viewport(390, 844);
    cy.mount(
      <PathnameContext.Provider value="/zh/gpu-metrics">
        <ServingPowerChart
          artifact={artifact}
          window={window}
          trace={trace}
          index={0}
          yMax={6272}
        />
      </PathnameContext.Provider>,
    );
    cy.contains('均值 1000 W');
    cy.get('[data-testid="serving-power-panel"]').then(($panel) =>
      expect($panel[0].getBoundingClientRect().right).to.be.at.most(390),
    );
    cy.contains('硬件注册表 TDP: 4800 W');
  });
});
