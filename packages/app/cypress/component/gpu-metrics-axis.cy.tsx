import GpuMetricsChart from '@/components/gpu-power/GpuPowerChart';
import type { GpuMetricRow } from '@/components/gpu-power/types';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { useState } from 'react';

const svg = () => cy.get('[data-testid="gpu-metrics-chart-svg"]');

function samples(clock: (sample: number) => number): GpuMetricRow[] {
  return Array.from({ length: 8 }, (_chip, index) =>
    Array.from({ length: 21 }, (_, sample) => ({
      timestamp: new Date(Date.UTC(2026, 8, 20) + sample * 30_000).toISOString(),
      index,
      power: 300 + sample * 30,
      memClock: clock(sample),
    })),
  ).flat();
}

function mountClock(data: GpuMetricRow[]) {
  cy.mount(
    <GpuMetricsChart
      data={data}
      visibleGpus={new Set([0, 1, 2, 3, 4, 5, 6, 7])}
      metricKey="memClock"
      artifactName="gpu_metrics_b200"
      display={{ mode: 'rolling', windowS: 300, series: 'chips' }}
    />,
  );
}

function assertReadableAxis(value: number) {
  svg().should(($svg) => {
    const labels = $svg.find('.y-axis .tick text').toArray();
    expect(labels.length, 'multiple useful ticks').to.be.greaterThan(1);
    const values = labels.map((label) => Number(label.textContent?.replaceAll(',', '')));
    expect(values.every(Number.isFinite), 'numeric ticks').to.eq(true);
    expect(new Set(values).size, 'distinct ticks').to.eq(values.length);
    expect(Math.min(...values)).to.be.at.most(value);
    expect(Math.max(...values)).to.be.greaterThan(value);
    const title = $svg.find('.y-axis-label')[0]!.getBoundingClientRect();
    for (const label of labels) {
      expect(label.getBoundingClientRect().left, 'tick clears axis title').to.be.greaterThan(
        title.right,
      );
    }
  });
  svg().find('path.line-path').should('have.length', 8);
}

describe('PowerX telemetry axis', () => {
  for (const width of [1280, 375]) {
    it(`keeps constant memory clocks readable at ${width}px`, () => {
      cy.viewport(width, 800);
      mountClock(samples(() => 390));
      assertReadableAxis(390);
    });
  }

  it('does not magnify floating-point noise after rolling averages', () => {
    mountClock(samples((sample) => 390 - (sample % 2) * Number.EPSILON * 256));
    assertReadableAxis(390);
  });

  it('gives all-zero telemetry a nonzero, nonnegative range', () => {
    mountClock(samples(() => 0));
    assertReadableAxis(0);
    svg().find('.y-axis .tick text').first().should('have.text', '0.0');
  });

  it('preserves varying power measurements and the hardware TDP reference', () => {
    cy.mount(
      <GpuMetricsChart
        data={samples(() => 390)}
        visibleGpus={new Set([0, 1, 2, 3, 4, 5, 6, 7])}
        metricKey="power"
        artifactName="gpu_metrics_b200"
        display={{ mode: 'points', windowS: 300, series: 'chips' }}
      />,
    );
    svg().find('.tdp-line text').should('contain.text', `${HW_REGISTRY.b200.tdp}W`);
    svg().should(($svg) => {
      const values = $svg
        .find('.y-axis .tick text')
        .toArray()
        .map((label) => Number(label.textContent?.replaceAll(',', '')));
      expect(Math.min(...values)).to.be.at.most(300);
      expect(Math.max(...values)).to.be.at.least(HW_REGISTRY.b200.tdp);
    });
  });

  it('removes the power reference when switching to memory clock and restores it once', () => {
    function SwitchMetric() {
      const [metric, setMetric] = useState<'power' | 'memClock'>('power');
      return (
        <>
          <button onClick={() => setMetric(metric === 'power' ? 'memClock' : 'power')}>
            Switch metric
          </button>
          <GpuMetricsChart
            data={samples(() => 3996)}
            visibleGpus={new Set([0, 1, 2, 3, 4, 5, 6, 7])}
            metricKey={metric}
            artifactName="gpu_metrics_b200"
            display={{ mode: 'rolling', windowS: 300, series: 'chips' }}
          />
        </>
      );
    }
    cy.mount(<SwitchMetric />);
    svg().find('.tdp-line').should('have.length', 1);
    cy.contains('button', 'Switch metric').click();
    svg().find('.tdp-line').should('not.exist');
    assertReadableAxis(3996);
    cy.contains('button', 'Switch metric').click();
    svg().find('.tdp-line').should('have.length', 1);
  });
});
