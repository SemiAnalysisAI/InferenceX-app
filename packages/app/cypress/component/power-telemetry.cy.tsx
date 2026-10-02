import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import { TelemetryDisplayControls } from '@/components/gpu-power/TelemetryDisplayControls';
import {
  DEFAULT_TELEMETRY_DISPLAY,
  type TelemetryDisplayState,
} from '@/components/gpu-power/telemetry-smoothing';
import { PowerTelemetryView } from '@/components/inference/agentic-point/power-telemetry-view';
import type { GpuMetricsPointPayload, GpuMetricSeries } from '@/hooks/api/use-gpu-metrics-point';
import { registerAnalyticsClient } from '@/lib/analytics';

const ID = 206887;
const endpoint = `/api/v1/gpu-metrics-point?id=${ID}`;
const queryKey = ['gpu-metrics-point', ID];
const chart = '[data-testid="power-telemetry-chart"]';

function series(id: number, host: string, base: number): GpuMetricSeries {
  const data = [0, 1, 2].flatMap((second) =>
    [0, 1].map((index) => ({
      timestamp: `2026-09-21T00:00:0${second}Z`,
      index,
      power: base + index * 100 + second * 10,
      temperature: 40 + index + second,
    })),
  );
  return {
    id,
    artifactName: 'gpu_metrics_qwen35_b200',
    configKey: 'qwen35_b200_tp8',
    fileName: `${host}/gpu_metrics.csv`,
    vendor: 'nvidia',
    sampleIntervalS: 1,
    sampleCount: data.length,
    gpuCount: 2,
    startedAt: data[0].timestamp,
    endedAt: data.at(-1)!.timestamp,
    sidecars: {},
    benchmarkResultIds: [ID],
    stats: [0, 1].map((gpuIndex) => ({
      gpuIndex,
      metric: 'power_w',
      count: 3,
      min: base + gpuIndex * 100,
      max: base + gpuIndex * 100 + 20,
      mean: base + gpuIndex * 100 + 10,
      median: base + gpuIndex * 100 + 10,
      p95: base + gpuIndex * 100 + 19,
      p99: base + gpuIndex * 100 + 19.8,
      stddev: Math.sqrt(200 / 3),
    })),
    data,
  };
}

const payload: GpuMetricsPointPayload = {
  benchmarkResultId: ID,
  series: [series(1, 'host-a', 500), series(2, 'host-b', 700)],
};

function QueryStatus() {
  const { status } = useQuery({ queryKey, enabled: false });
  return <output data-testid="query-status">{status}</output>;
}

function mountPoint(path = '/inference/agentic/206887') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  cy.mount(
    <PathnameContext.Provider value={path}>
      <QueryClientProvider client={client}>
        <div className="p-4">
          <PowerTelemetryView id={ID} enabled hardware="b200" serverMetricsEnabled={false} />
          <QueryStatus />
        </div>
      </QueryClientProvider>
    </PathnameContext.Provider>,
  );
  return client;
}

function Controls() {
  const [display, setDisplay] = useState<TelemetryDisplayState>(DEFAULT_TELEMETRY_DISPLAY);
  return (
    <>
      <TelemetryDisplayControls
        value={display}
        onChange={setDisplay}
        analyticsPrefix="power_test"
        idPrefix="display"
      />
      <output>{JSON.stringify(display)}</output>
    </>
  );
}

describe('PowerX telemetry interactions', () => {
  beforeEach(() => {
    registerAnalyticsClient({ capture: cy.stub().as('capture') });
  });

  it('changes display, window and chip aggregation independently and tracks each action', () => {
    cy.mount(<Controls />);
    cy.get('[data-testid="display-mode-points"]').click();
    cy.get('#display-window').should('not.exist');
    cy.get('[data-testid="display-series-mean"]').click();
    cy.get('[data-testid="display-mode-rolling"]').click();
    cy.get('#display-window').click();
    cy.get('[role="option"]').contains('60 s').click();
    cy.get('output').should('have.text', '{"mode":"rolling","windowS":60,"series":"mean"}');
    cy.get('@capture').should('have.been.calledWith', 'power_test_display_mode_changed', {
      mode: 'points',
    });
    cy.get('@capture').should('have.been.calledWith', 'power_test_series_mode_changed', {
      series: 'mean',
    });
    cy.get('@capture').should('have.been.calledWith', 'power_test_smoothing_window_changed', {
      windowS: 60,
    });
    cy.get('@capture').its('callCount').should('eq', 4);
  });

  it('shows loading, distinguishes an initial failure from missing data, and retries', () => {
    let failed = true;
    cy.intercept('GET', endpoint, (request) => {
      request.reply(failed ? { statusCode: 503, delay: 150, body: {} } : { body: payload });
    }).as('telemetry');
    mountPoint();
    cy.get('[data-testid="power-telemetry-loading"]').should('contain.text', 'Loading PowerX');
    cy.wait('@telemetry');
    cy.get('[data-testid="power-telemetry-query-error"]').should('contain.text', 'Failed to load');
    cy.get('[data-testid="power-telemetry-missing"]').should('not.exist');
    cy.then(() => {
      failed = false;
    });
    cy.contains('button', 'Retry').click();
    cy.wait('@telemetry');
    cy.get(chart).find('svg .point').should('have.length', 6);
    cy.get('@capture').should(
      'have.been.calledWith',
      'inference_agentic_power_telemetry_retry_clicked',
    );
  });

  it('shows a genuine missing point without offering an error retry', () => {
    cy.intercept('GET', endpoint, { statusCode: 404, body: {} });
    mountPoint();
    cy.get('[data-testid="power-telemetry-missing"]').should('contain.text', `#${ID}`);
    cy.get('[data-testid="power-telemetry-query-error"]').should('not.exist');
    cy.get(chart).should('not.exist');
  });

  it('preserves a rendered chart when a background refetch fails', () => {
    let failed = false;
    cy.intercept('GET', endpoint, (request) => {
      request.reply(failed ? { statusCode: 503, body: {} } : { body: payload });
    }).as('telemetry');
    const client = mountPoint();
    cy.wait('@telemetry');
    cy.get(chart).find('svg .point').should('have.length', 6);
    cy.then(() => {
      failed = true;
      return client.refetchQueries({ queryKey });
    });
    cy.wait('@telemetry');
    cy.get('[data-testid="query-status"]').should('have.text', 'error');
    cy.get(chart).find('svg .point').should('have.length', 6);
    cy.get('[data-testid="power-telemetry-query-error"]').should('not.exist');
  });

  for (const [locale, width] of [
    ['en', 1280],
    ['zh', 390],
  ] as const) {
    it(`keeps chip filters scoped to a host and renders ${locale} at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.intercept('GET', endpoint, { body: payload });
      mountPoint(`${locale === 'zh' ? '/zh' : ''}/inference/agentic/${ID}`);
      cy.get(chart).find('svg .point').should('have.length', 6);
      cy.get('[data-testid="power-telemetry-sample-count"]').should('have.text', '6');
      cy.get('table tbody tr').first().find('td').eq(4).should('have.text', '510.0');
      cy.get('[data-testid="chart-legend"]')
        .contains(locale === 'zh' ? '芯片 0' : 'Chip 0')
        .click();
      cy.get(chart).find('svg .point').should('have.length', 3);
      cy.get('#power-telemetry-series-select').click();
      cy.get('[role="option"]').contains('host-b').click();
      cy.get(chart).find('svg .point').should('have.length', 6);
      cy.get('table tbody tr').first().find('td').eq(4).should('have.text', '710.0');
      cy.get('[data-testid="power-telemetry-display-mode-points"]').click();
      cy.get('[data-testid="power-telemetry-display-series-mean"]').click();
      cy.get(chart).find('svg .point').should('have.length', 3);
      cy.get('[data-testid="power-telemetry-view"]').should(($view) => {
        expect($view[0].scrollWidth).to.be.at.most($view[0].clientWidth + 1);
      });
      cy.get('[data-testid="power-telemetry-metric-select"]').should(
        'contain.text',
        locale === 'zh' ? '功耗' : 'Power',
      );
      cy.get('[data-testid="power-telemetry-view"]').screenshot(
        `power-telemetry-${locale}-${width}`,
      );
    });
  }
});
