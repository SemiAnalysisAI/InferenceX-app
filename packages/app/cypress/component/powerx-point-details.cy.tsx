import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import {
  PowerXSurfaceProvider,
  usePowerXActivePoint,
} from '@/components/inference/ui/powerx-surface';
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
  benchmark_type: 'agentic_traces',
  framework: 'sglang',
  disagg: true,
  is_multinode: true,
  physicalChips: 28,
  conc: 504,
  prefill_tp: 4,
  prefill_ep: 4,
  prefill_dp_attention: true,
  prefill_num_workers: 3,
  num_prefill_gpu: 12,
  decode_tp: 16,
  decode_ep: 16,
  decode_dp_attention: true,
  decode_num_workers: 1,
  num_decode_gpu: 16,
  p90_ttft: 4.55,
  p90_e2el: 13,
  p90_intvty: 253,
  kv_offloading: 'dram',
  kv_offload_backend: 'mooncake',
  server_gpu_cache_hit_rate: 0.959,
  theoretical_cache_hit_rate: 0.972,
  run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${RUN_ID}`,
  power_audit: { source: `power_validation_${AUDIT_NAME}.json` },
  measuredAvgPower: { y: 812, roof: false },
});

function mountEnergy() {
  // Trace and log presence for the point, so View charts and View logs show as on AgentX.
  cy.intercept('GET', '/api/v1/benchmark-presence', {
    body: { trace: [42, 1], log: [42, 1] },
  }).as('presence');
  // The page state a reader on Energy under the Decode role carries (and a stale trace load).
  writeUrlParams({ i_metric: ENERGY_METRIC, i_role: 'decode', i_ptconc: '8' });
  const setSelectedYAxisMetric = cy.stub().as('setMetric');
  mountWithProviders(
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
    </PowerXSurfaceProvider>,
    {
      inference: {
        hardwareConfig: createMockHardwareConfig(),
        selectedPrecisions: [Precision.FP4],
        selectedYAxisMetric: ENERGY_METRIC,
        setSelectedYAxisMetric,
      },
      unofficial: {},
    },
  );
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
  it('opens the full point details in the legend slot when a dot is clicked', () => {
    mountEnergy();
    pinPoint();
    cy.get(panel).should('be.visible').and('contain.text', 'H100').and('contain.text', 'FP4');
    cy.get('#powerx-details [data-slot="chart-legend-frame"]').should('have.class', 'hidden');
    cy.get('[data-testid="active-point-source"]').should('have.text', 'pinned');
    cy.get(`${panel} [data-pinned-config]`).should(
      'contain.text',
      'Multi-node disaggregated · 28 chips · conc 504',
    );
    cy.get(`${panel} [data-pinned-parallelism]`)
      .should('contain.text', 'Prefill')
      .and('contain.text', 'Decode');
    cy.get(`${panel} [data-pinned-latency]`)
      .should('contain.text', 'TTFT')
      .and('contain.text', 'E2EL')
      .and('contain.text', 'Interactivity');
    cy.get(`${panel} [data-pinned-cache]`).should('contain.text', 'KV cache hit');
    cy.get(`${panel} [data-action]`).then(($actions) => {
      expect([...$actions].map((action) => (action as HTMLElement).dataset.action)).to.deep.equal([
        'run',
        'view-charts',
        'view-logs',
        'view-power-trace',
        'reproduce',
      ]);
    });
    cy.get(panel).should('not.contain.text', 'View PowerX');
  });

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

  it('restores the legend and releases the pinned point when the details close', () => {
    mountEnergy();
    pinPoint();
    cy.get(panel).should('be.visible');
    cy.get('#powerx-details [data-testid="point-details-close"]').click();
    cy.get(panel).should('not.exist');
    cy.get('#powerx-details [data-slot="chart-legend-frame"]').should('not.have.class', 'hidden');
    cy.get('[data-testid="active-point-source"]').should('have.text', 'none');

    pinPoint();
    cy.get(panel).should('be.visible');
    cy.get('body').type('{esc}');
    cy.get(panel).should('not.exist');
    cy.get('[data-testid="active-point-source"]').should('have.text', 'none');
  });
});
