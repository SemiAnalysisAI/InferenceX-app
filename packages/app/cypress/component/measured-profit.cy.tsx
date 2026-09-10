import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import MeasuredProfitComparison from '@/components/calculator/MeasuredProfitComparison';
import { compareMeasuredProfit } from '@/components/calculator/measured-profit';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import type { BenchmarkRow } from '@/lib/api';

// Public Kimi K3/B300 observation #439941 has throughput but no power telemetry.
const SOURCE: BenchmarkRow = {
  id: 439941,
  model: 'kimik3',
  hardware: 'b300',
  framework: 'vllm',
  precision: 'fp4',
  spec_method: 'mtp',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 0,
  decode_tp: 8,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 0,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  benchmark_type: 'agentic_traces',
  offload_mode: 'on',
  isl: null,
  osl: null,
  conc: 16,
  image: null,
  date: '2026-08-16',
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/31893747354/attempts/2',
  metrics: {
    p90_intvty: 32.123353678124,
    tput_per_gpu: 7650.69772,
    input_tput_per_gpu: 7592.28324,
    output_tput_per_gpu: 58.41448,
  },
};
const POINT: GPUDataPoint = {
  benchmarkRow: SOURCE,
  hwKey: 'b300_vllm',
  interactivity: SOURCE.metrics.p90_intvty,
  throughput: SOURCE.metrics.tput_per_gpu,
  inputThroughput: SOURCE.metrics.input_tput_per_gpu,
  outputThroughput: SOURCE.metrics.output_tput_per_gpu,
  concurrency: SOURCE.conc,
  tp: SOURCE.decode_tp,
  precision: SOURCE.precision,
  costh: 0,
  costr: 0,
  costhi: 0,
  costri: 0,
  costhOutput: 0,
  costrOutput: 0,
  tpPerMw: 0,
  inputTpPerMw: 0,
  outputTpPerMw: 0,
};
const RESULT: InterpolatedResult = {
  hwKey: POINT.hwKey,
  resultKey: POINT.hwKey,
  precision: POINT.precision,
  value: POINT.throughput,
  inputTputValue: POINT.inputThroughput,
  outputTputValue: POINT.outputThroughput,
  concurrency: POINT.concurrency,
  nearestPoints: [POINT],
  cost: 0,
  costInput: 0,
  costOutput: 0,
  tpPerMw: 0,
  inputTpPerMw: 0,
  outputTpPerMw: 0,
};
// Normalized pricing and provisioned power isolate presentation from live TCO rates.
const COMPARISON = compareMeasuredProfit(
  RESULT,
  { powerKwPerGpu: 2, costPerGpuHour: 1 },
  { source: 'normalized', inputPerMillion: 1, cachedInputPerMillion: 1, outputPerMillion: 1 },
  { utilizationPct: 60, labCutPct: 30, basis: 'gw-year' },
  POINT.interactivity,
);

function mountComparison(pathname = '/profit-estimator-per-gigawatt') {
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <MeasuredProfitComparison
        comparisons={[COMPARISON]}
        settings={{ targetInteractivity: POINT.interactivity, percentile: 'p90' }}
        labelFor={() => 'B300 vLLM'}
        onSelectPoint={cy.stub().as('selectPoint')}
      />
    </PathnameContext.Provider>,
  );
}

describe('Measured-power profit comparison', () => {
  it('preserves the provisioned baseline and selects the exact observed point without inventing power', () => {
    mountComparison();
    cy.get('tbody tr').within(() => {
      cy.get('th').should('have.text', 'B300 vLLM');
      cy.get('td').eq(0).should('contain.text', 'No validated GPU power');
      cy.get('td').eq(1).should('contain.text', 'Revenue / year: $72.4B');
      cy.get('td').eq(1).should('contain.text', 'Profit / year: $46.3B');
      cy.get('td').eq(2).should('contain.text', 'Unavailable');
      cy.get('td').eq(2).should('contain.text', 'Workload not supported by the system model');
      cy.get('td').eq(2).should('not.contain.text', '$');
      cy.contains('button', 'Use point: 32.12 tok/s/user').click();
    });
    cy.get('@selectPoint').should('have.been.calledOnceWithExactly', POINT.interactivity);
    cy.contains('summary', 'Inputs and assumptions').click();
    cy.contains('p', 'Planning adds 10% electrical headroom after PUE.').should('be.visible');
    cy.contains('p', 'it is not measured whole-system power.').should('be.visible');
    cy.contains('p', 'headroom is reserved capacity, not consumed energy.').should('be.visible');
  });

  it('exports the public source and explicit unavailable status with null measured inputs', () => {
    mountComparison();
    cy.get('a[download="InferenceX_power_planning.json"]')
      .invoke('attr', 'href')
      .then((href) => {
        const payload = JSON.parse(decodeURIComponent(href!.split(',').slice(1).join(',')));
        expect(payload.settings.targetInteractivity).to.equal(POINT.interactivity);
        const comparison = payload.comparisons[0];
        expect(comparison.modelAssumptions.pue).to.equal(1.3);
        expect(comparison.status).to.equal('unavailable');
        expect(comparison.reason).to.equal('workload');
        expect(comparison.sourcePoints[0]).to.include({
          id: SOURCE.id,
          hardware: 'b300',
          benchmarkType: 'agentic_traces',
          runUrl: SOURCE.run_url,
          powerValid: null,
          telemetryValid: false,
          measuredGpuWattsPerGpu: null,
          measuredTotalGpuWatts: null,
        });
        expect(comparison.modelRevision).to.equal('ca4403aa527069857351ad8047dbb726844b3382');
        expect(comparison).not.to.have.property('measured');
        expect(comparison).not.to.have.property('capacity');
        expect(comparison.baseline.revenue).to.be.closeTo(72381720989.376, 0.001);
      });
  });

  it('explains the same missing telemetry and model boundary in Chinese', () => {
    mountComparison('/zh/profit-estimator-per-gigawatt');
    cy.contains('h3', '功耗规划对比').should('be.visible');
    cy.get('tbody tr').within(() => {
      cy.get('td').eq(0).should('contain.text', '无有效 GPU 功率测量');
      cy.get('td').eq(1).should('contain.text', '年收入: $72.4B');
      cy.get('td').eq(2).should('contain.text', '系统模型不支持此工作负载');
    });
    cy.contains('p', '不代表整机实测功率').should('be.visible');
    cy.contains('summary', '输入与假设').click();
    cy.contains('p', '应用 PUE 后增加 10% 电力余量').should('be.visible');
    cy.contains('p', '余量是预留容量，不是耗电量').should('be.visible');
  });
});
