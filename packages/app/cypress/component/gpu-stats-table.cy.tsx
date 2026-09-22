import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { GpuMetricStatRow } from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import GpuStatsTable from '@/components/gpu-power/GpuStatsTable';
import { parseCsvData, type GpuMetricKey } from '@/components/gpu-power/types';

const storedStats: GpuMetricStatRow[] = [
  {
    gpuIndex: 0,
    metric: 'power_w',
    count: 3,
    min: 0,
    max: 100,
    mean: 50,
    median: 50,
    p95: 95,
    p99: 99,
    stddev: Math.sqrt(5000 / 3),
  },
  {
    gpuIndex: 1,
    metric: 'power_w',
    count: 2,
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    p95: 0,
    p99: 0,
    stddev: 0,
  },
  {
    gpuIndex: 0,
    metric: 'gfx_voltage_mv',
    count: 1,
    min: 850,
    max: 850,
    mean: 850,
    median: 850,
    p95: 850,
    p99: 850,
    stddev: 0,
  },
];

function StoredTable() {
  const [metricKey, setMetricKey] = useState<GpuMetricKey>('power');
  return (
    <>
      <button onClick={() => setMetricKey('gfxVoltage')}>Voltage</button>
      <button onClick={() => setMetricKey('temperature')}>Uncollected</button>
      <GpuStatsTable data={[]} metricKey={metricKey} storedStats={storedStats} />
    </>
  );
}

function EmptyDigest() {
  const [digest, setDigest] = useState<GpuMetricStatRow[] | undefined>();
  return (
    <>
      <button onClick={() => setDigest([])}>Read empty digest</button>
      <GpuStatsTable
        metricKey="power"
        storedStats={digest}
        data={[{ timestamp: '2026-09-21T00:00:00Z', index: 0, power: 100 }]}
      />
    </>
  );
}

describe('PowerX full-record statistics', () => {
  for (const width of [1280, 390]) {
    it(`reads stored values, sorts, and switches metrics at ${width}px`, () => {
      cy.viewport(width, 720);
      cy.mount(<StoredTable />);
      cy.get('[data-testid="gpu-stats-scope"]')
        .should('contain.text', 'Full-record statistics include startup and warmup')
        .then(($scope) => {
          expect($scope[0].getBoundingClientRect().right).to.be.at.most(width);
        });
      // The full-record digest is authoritative; rendering never needs to scan raw samples.
      cy.get('tbody tr').should('have.length', 2);
      cy.get('tbody tr')
        .first()
        .find('td')
        .then(($cells) => {
          expect([...$cells].map((cell) => cell.textContent)).to.deep.equal([
            '0',
            '3',
            '0.0',
            '100.0',
            '50.0',
            '50.0',
            '95.0',
            '99.0',
            '40.8',
          ]);
        });
      cy.contains('button', 'Mean (W)').click();
      cy.get('tbody tr').first().find('td').first().should('have.text', '1');
      cy.contains('button', 'Voltage').click();
      cy.contains('th', 'Mean (mV)').should('exist');
      cy.get('tbody tr').should('have.length', 1).find('td').eq(4).should('have.text', '850.0');
      cy.get('[data-testid="gpu-stats-scope"]').parent().screenshot(`powerx-stored-stats-${width}`);
      cy.contains('button', 'Uncollected').click();
      cy.get('table').should('not.exist');
    });
  }

  it('keeps Chinese labels and measured zeros in the stored digest', () => {
    cy.viewport(390, 720);
    cy.mount(
      <PathnameContext.Provider value="/zh/gpu-metrics">
        <StoredTable />
      </PathnameContext.Provider>,
    );
    cy.contains('th', '平均值 (W)').should('exist');
    cy.get('[data-testid="gpu-stats-scope"]').should(
      'contain.text',
      '全记录统计，包含服务启动与 warmup',
    );
    cy.get('tbody tr').last().find('td').eq(4).should('have.text', '0.0');
    cy.get('[data-testid="gpu-stats-scope"]').parent().screenshot('powerx-stored-stats-zh-390');
  });

  it('computes a live artifact without a stored digest', () => {
    cy.mount(
      <GpuStatsTable
        metricKey="power"
        data={[
          { timestamp: '2026-09-21T00:00:00Z', index: 0, power: 0 },
          { timestamp: '2026-09-21T00:00:01Z', index: 0, power: 100 },
        ]}
      />,
    );
    cy.get('tbody tr').find('td').eq(4).should('have.text', '50.0');
  });

  it('does not synthesize stats when the stored digest is empty', () => {
    cy.mount(<EmptyDigest />);
    cy.get('table').should('exist');
    cy.contains('button', 'Read empty digest').click();
    cy.get('table').should('not.exist');
  });

  it('keeps a live CSV missing temperature separate from zero and duplicate readings', () => {
    const data = parseCsvData(
      'timestamp,gpu,socket_power,hotspot\n1789948800,0,0,N/A\n1789948801.0009,0,100,0\n1789948801.0011,0,900,90',
    );
    cy.mount(<GpuStatsTable metricKey="temperature" data={data} />);
    cy.contains('th', 'Mean (°C)').should('exist');
    cy.get('tbody tr').find('td').eq(1).should('have.text', '1');
    cy.get('tbody tr').find('td').eq(4).should('have.text', '0.0');
  });
});
