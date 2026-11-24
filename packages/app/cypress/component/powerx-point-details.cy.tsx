import { StrictMode } from 'react';

import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { usePowerXActivePoint } from '@/components/inference/ui/powerx-surface';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface-provider';
import { POWER_TIMELINE_METRIC_KEY } from '@/components/inference/utils/powerTimeline';
import { Precision } from '@/lib/catalog/data-mappings';
import { writeUrlParams } from '@/lib/routing/url-state';
import { mountWithProviders } from '../support/test-utils';
import { clickScatterPoint } from '../support/scatter-points';
import {
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceData,
} from '../support/mock-data';

const ENERGY_METRIC = 'y_measuredJPerTotalToken';
const RUN_ID = '34716669498';
const AUDIT_NAME = 'dsv4_8k1k_fp4_sglang_disagg-true_conc504_gb200-host-0123';

// The PowerX page mirrors the pinned point; this probe shows what it sees.
function ActivePointProbe() {
  const active = usePowerXActivePoint();
  return <output data-testid="active-point-source">{active?.source ?? 'none'}</output>;
}

const point = createMockInferenceData({
  id: 42,
  hwKey: 'h100',
  precision: Precision.FP4,
  x: 20,
  y: 0.5,
  run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
  power_audit: { source: `power_validation_${AUDIT_NAME}.json` },
  measuredAvgPower: { y: 812, roof: false },
});

function mountEnergy({ strict = false } = {}) {
  cy.intercept('GET', '/api/v1/benchmark-presence', { trace: [], log: [] }).as('presence');
  // The page state a reader on Energy under the Decode role carries (and a stale trace load).
  writeUrlParams({ i_metric: ENERGY_METRIC, i_role: 'decode', i_ptconc: '8' });
  const setSelectedYAxisMetric = cy.stub().as('setMetric');
  const tree = (
    <PowerXSurfaceProvider>
      <div style={{ width: 1200 }}>
        <ScatterGraph
          chartId="powerx-details"
          modelLabel="DeepSeek V4"
          data={[point]}
          xLabel="Interactivity (tok/s/user)"
          yLabel="Energy per token (J)"
          chartDefinition={createMockChartDefinition()}
          transitionDuration={0}
          powerXDirectLabels
        />
        <ActivePointProbe />
      </div>
    </PowerXSurfaceProvider>
  );
  mountWithProviders(strict ? <StrictMode>{tree}</StrictMode> : tree, {
    inference: {
      hardwareConfig: createMockHardwareConfig(),
      selectedPrecisions: [Precision.FP4],
      selectedYAxisMetric: ENERGY_METRIC,
      setSelectedYAxisMetric,
    },
    unofficial: {},
  });
  cy.wait('@presence');
}

const pinPoint = () =>
  cy
    .scatterPoints('#powerx-details')
    .should('have.length', 1)
    .then(([target]) => clickScatterPoint(target));

const panel =
  '#powerx-details [data-slot="chart-details-frame"] [data-testid="point-details-panel"]';

describe('PowerX point details', () => {
  it('opens Over time on the point with the GPU role and focus from View power trace', () => {
    mountEnergy();
    pinPoint();
    cy.get(`${panel} [data-action="view-power-trace"]`)
      .should('contain.text', 'View power trace')
      .and(($link) => {
        const url = new URL($link.attr('href') ?? '');
        expect(url.searchParams.get('i_metric')).to.equal(POWER_TIMELINE_METRIC_KEY);
        expect(url.searchParams.get('i_role')).to.equal('decode');
        expect(url.searchParams.get('i_ptfocus')).to.equal(`${RUN_ID}:${AUDIT_NAME}`);
        expect(url.searchParams.has('i_ptconc')).to.equal(false);
      })
      .click();
    cy.get('@setMetric').should('have.been.calledWith', POWER_TIMELINE_METRIC_KEY);
  });

  // Strict Mode (next dev) replays effects on mount; an unmount-time release used to clear the
  // PowerX pin there and dismiss the details the click had just opened. Closing releases it.
  it('keeps the pinned point and its details in the legend slot under Strict Mode until closed', () => {
    mountEnergy({ strict: true });
    pinPoint();
    cy.get(panel).should('be.visible');
    cy.get('#powerx-details [data-slot="chart-legend-frame"]').should('have.class', 'hidden');
    cy.wait(500);
    cy.get(panel).should('be.visible');
    cy.get('[data-testid="active-point-source"]').should('have.text', 'pinned');
    cy.get('#powerx-details [data-testid="point-details-close"]').click();
    cy.get(panel).should('not.exist');
    cy.get('#powerx-details [data-slot="chart-legend-frame"]').should('not.have.class', 'hidden');
    cy.get('[data-testid="active-point-source"]').should('have.text', 'none');
  });
});
