import type { ComponentProps } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import PowerXComparison from '@/components/powerx/PowerXComparison';
import type { InferenceData } from '@/components/inference/types';
import type { RenderedIsoRow } from '@/components/powerx/rendered-iso';

const source: InferenceData = {
  id: 12,
  hwKey: 'h200',
  model: 'DeepSeek-V3',
  date: '2026-09-15',
  precision: 'fp8',
  tp: 8,
  conc: 32,
  x: 75,
  y: 400,
  measuredAvgPower: { y: 400, roof: false },
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123',
  tpPerGpu: { y: 50, roof: false },
  tpPerMw: { y: 1, roof: false },
  costh: { y: 1, roof: false },
  costr: { y: 1, roof: false },
  costhi: { y: 1, roof: false },
  costri: { y: 1, roof: false },
};
const row: RenderedIsoRow = {
  key: 'official',
  points: [source],
  status: 'exact',
  value: 400,
  sources: [source],
};

function mount(overrides: Partial<ComponentProps<typeof PowerXComparison>> = {}, locale = 'en') {
  cy.mount(
    <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
      <PowerXComparison
        rows={[row]}
        metric="y_measuredAvgPower"
        xField="p90_intvty"
        xLabel="Interactivity"
        yLabel="W/chip"
        chartId="chart-0"
        target="75"
        onTargetChange={cy.stub().as('targetChanged')}
        {...overrides}
      />
    </PathnameContext.Provider>,
  );
  cy.get('[data-testid="powerx-comparison"] summary').click();
}
function captureCsv() {
  cy.window().then((win) => {
    cy.stub(win.URL, 'createObjectURL').as('csvBlob').returns('blob:test');
    cy.stub(win.URL, 'revokeObjectURL');
    cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(function (this: HTMLAnchorElement) {
      expect(this.download).to.equal('chart-0-powerx-iso.csv');
    });
  });
}
function csvRows() {
  return cy
    .get<sinon.SinonStub>('@csvBlob')
    .should('have.been.calledOnce')
    .then((stub) => {
      const blob = stub.getCall(0).args[0] as Blob;
      return blob.text();
    })
    .then((csv) => {
      const lines = csv.split('\n').filter((line) => !line.startsWith('#'));
      const headers = lines[0].split(',');
      return {
        csv,
        rows: lines
          .slice(1)
          .map((line) =>
            Object.fromEntries(line.split(',').map((value, index) => [headers[index], value])),
          ),
      };
    });
}

describe('native measured ISO panel', () => {
  it('retains legacy evidence labels and raw source links', () => {
    mount();
    cy.contains('No validation verdict').should('be.visible');
    cy.get('tr[data-iso-value="400"]').should('be.visible');
    cy.get('[data-testid="powerx-iso-table"] a').should('have.attr', 'href', source.run_url);
    cy.get('[data-testid="powerx-iso"]').clear().type('85');
    cy.get('@targetChanged').should('have.been.called');
  });
  it('exports exactly the presented official and overlay results', () => {
    mount({
      rows: [row, { ...row, key: 'overlay', overlayIndex: 0, status: 'curve', value: 450 }],
    });
    captureCsv();
    cy.get('[data-testid="powerx-iso-csv"]').click();
    csvRows().then(({ rows }) => {
      expect(rows).to.have.length(2);
      expect(rows[1]).to.include({
        Value: '450',
        Provenance: 'unofficial',
        Validation: 'unverified',
        'Run URLs': source.run_url,
      });
    });
  });
  it('exports modeled facility assumptions and source validation without a meter claim', () => {
    const modeled: InferenceData = {
      ...source,
      power_valid: 1,
      power_metric_schema_version: 2,
      recipe_fingerprint: 'recipe-123',
      image: 'image:sha256-test',
      powerxUtilityModeledWatts: { y: 650, roof: false },
      modeledSystemPower: {
        status: 'supported',
        hardware: 'h200',
        modelRevision: 'revision-1',
        modelPath: 'test',
        gpuCount: 4,
        chassisCount: 1,
        modeledGpuCount: 8,
        measuredGpuWattsPerGpu: 350,
        chassisAcWatts: 4000,
        chassisAcWattsPerGpu: 500,
        facilityWatts: 5200,
        deploymentAcWatts: 2000,
        deploymentFacilityWatts: 2600,
        pue: 1.3,
        telemetryBasis: 'validated-v2',
        topologyBasis: 'single-node',
        chassisBasis: 'extrapolated',
      },
    };

    mount({
      metric: 'y_powerxUtilityModeledWatts',
      rows: [{ ...row, points: [modeled], sources: [modeled], value: 650 }],
    });
    captureCsv();
    cy.get('[data-testid="powerx-iso-csv"]').click();
    csvRows().then(({ csv, rows }) => {
      expect(rows[0]).to.include({
        'Model Revision': 'revision-1',
        PUE: '1.3',
        Validation: 'strict',
        Images: 'image:sha256-test',
        'Recipe Fingerprints': 'recipe-123',
      });
      expect(csv).to.include('not measured wall power');
    });
  });
  it('distinguishes computed points and disables an invalid target export', () => {
    mount({ metric: 'y_powerxGpuProvisionedWatts', target: '' });
    cy.contains('Derived point').should('be.visible');
    cy.contains('No validation verdict').should('not.exist');
    cy.get('[data-testid="powerx-iso-csv"]').should('be.disabled');
  });
  it('shows a bilingual empty state without manufactured zero values on mobile', () => {
    cy.viewport(390, 844);
    mount({ rows: [] }, 'zh');
    cy.contains('当前选择下没有可比较的已显示曲线').should('be.visible');
    cy.get('[data-testid="powerx-iso-table"] tbody tr').should('not.exist');
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(390));
  });
  it('does not export a stale comparison while the chart is updating', () => {
    mount({ rows: [], pending: true });
    cy.contains('Updating comparison').should('be.visible');
    cy.get('[data-testid="powerx-iso-csv"]').should('be.disabled');
    cy.get('[data-testid="powerx-iso-table"] tbody tr').should('not.exist');
  });
});
