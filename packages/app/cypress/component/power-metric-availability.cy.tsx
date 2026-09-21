import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {
  PowerMetricAvailability,
  PowerMetricAvailabilityPanel,
} from '@/components/inference/ui/PowerMetricAvailability';
import { createMockInferenceData } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';
import { Precision, Model, Sequence } from '@/lib/data-mappings';

const source = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123/attempts/2';
const base = { model: Model.Qwen3_5, precision: Precision.FP8, run_url: source };
const missing = createMockInferenceData({ ...base, hwKey: 'gb200' });
const invalid = createMockInferenceData({
  ...base,
  hwKey: 'mi355x',
  power_valid: 0,
  power_invalid_reasons: ['sampling_gap_exceeded'],
});
const measured = createMockInferenceData({
  ...base,
  hwKey: 'b200',
  power_valid: 1,
  power_metric_schema_version: 2,
  measuredAvgPower: { y: 640, roof: false },
});

// Derived power boundaries (lib/power-basis.ts). The registered B200 carries
// every boundary; the GB200 NVL72 has spec watts but sits outside the chassis
// power model; the AMD row failed validation, so its modeled boundary is
// withheld even though its spec constants exist; the disaggregated AgentX row
// reports throughput but no whole-deployment GPU count, so its provisioned
// energy is withheld and the chassis model rejects its workload; the
// unregistered hardware has no spec constants at all.
const boundaries = createMockInferenceData({
  ...base,
  hwKey: 'b200',
  power_valid: 1,
  power_metric_schema_version: 2,
  measuredAvgPower: { y: 640, roof: false },
  gpuProvisionedWatts: { y: 1000, roof: false },
  gpuProvisionedJPerOutputToken: { y: 3.6, roof: false },
  utilityProvisionedWatts: { y: 1710, roof: false },
  utilityProvisionedJPerOutputToken: { y: 6.1, roof: false },
  utilityModeledWatts: { y: 1105, roof: false },
  utilityModeledJPerOutputToken: { y: 3.9, roof: false },
});
const outsideModel = createMockInferenceData({
  ...base,
  hwKey: 'gb200',
  output_tput_per_gpu: undefined,
  gpuProvisionedWatts: { y: 1200, roof: false },
  utilityProvisionedWatts: { y: 1870, roof: false },
  modeledSystemPower: { status: 'unsupported', reason: 'hardware', modelRevision: 'abc1234' },
});
const failedValidation = createMockInferenceData({
  ...base,
  hwKey: 'mi355x',
  power_valid: 0,
  power_invalid_reasons: ['sampling_gap_exceeded'],
  gpuProvisionedWatts: { y: 1400, roof: false },
  gpuProvisionedJPerOutputToken: { y: 5, roof: false },
  utilityProvisionedWatts: { y: 2200, roof: false },
  utilityProvisionedJPerOutputToken: { y: 7.9, roof: false },
});
const agenticDisagg = createMockInferenceData({
  ...base,
  hwKey: 'b200_disagg',
  disagg: true,
  benchmark_type: 'agentic_traces',
  output_tput_per_gpu: 300,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  power_valid: 1,
  power_metric_schema_version: 2,
  measuredAvgPower: { y: 700, roof: false },
  gpuProvisionedWatts: { y: 1000, roof: false },
  utilityProvisionedWatts: { y: 1710, roof: false },
  modeledSystemPower: { status: 'unsupported', reason: 'workload', modelRevision: 'abc1234' },
});
const unregistered = createMockInferenceData({ ...base, hwKey: 'unknown_hw' });
function BoundaryPanel({ metric: initial }: { metric: string }) {
  const [metric, select] = useState(initial);
  return (
    <PowerMetricAvailabilityPanel
      points={[boundaries, outsideModel, failedValidation, agenticDisagg, unregistered]}
      metric={metric}
      onSelect={select}
    />
  );
}
function Panel() {
  const [metric, select] = useState('y_measuredAvgPower');
  return (
    <PowerMetricAvailabilityPanel
      points={[missing, invalid, measured]}
      metric={metric}
      onSelect={select}
    />
  );
}

describe('PowerX metric availability', () => {
  it('explains missing GB and withheld AMD data, exposes source links, and switches metrics', () => {
    cy.mount(<Panel />);
    cy.contains('1 of 3 points have this metric');
    cy.contains('Validation failed: 1');
    cy.contains('Metric not reported: 1');
    cy.contains('summary', 'source details').click();
    cy.contains('sampling_gap_exceeded');
    cy.contains('a', 'Source run').should('have.attr', 'href', source);
    cy.contains('summary', 'all measured metrics').click();
    cy.contains('button', 'Measured Prefill Power per Chip').click();
    cy.contains('No separate worker pools: 3');
    cy.contains('0 of 3 points have this metric');
  });
  it('uses Chinese copy for the same coverage states', () => {
    cy.mount(
      <PathnameContext.Provider value="/zh/inference/qwen-3-5">
        <Panel />
      </PathnameContext.Provider>,
    );
    cy.contains('3 个数据点中有 1 个提供此指标');
    cy.contains('验证失败: 1');
    cy.contains('summary', '所有实测指标的可用性').click();
    cy.contains('缺失值不会被替换为零或 TDP 估算值');
  });
  it('explains why derived power boundaries are missing per point', () => {
    cy.mount(<BoundaryPanel metric="y_utilityModeledWatts" />);
    // B4 follows the chassis model and the telemetry verdict.
    cy.contains('1 of 5 points have this metric');
    cy.contains('Value available: 1');
    cy.contains('Hardware not in the chassis power model: 1');
    cy.contains('Chassis model covers 8K / 1K only: 1');
    cy.contains('No validated GPU telemetry: 1');
    cy.contains('Validation failed: 1');
    cy.contains('summary', 'source details').click();
    cy.contains('gb200: Hardware not in the chassis power model (1)');
    cy.contains('b200_disagg: Chassis model covers 8K / 1K only (1)');
    cy.contains('unknown_hw: No validated GPU telemetry (1)');
    cy.contains('mi355x: Validation failed (1) · sampling_gap_exceeded');
    // Spec-constant watts exist for every registered hardware, validated or not.
    cy.contains('summary', 'all measured metrics').click();
    cy.contains('button', 'GPU Provisioned Power per Chip (TDP)').should('contain', '4/5').click();
    cy.contains('4 of 5 points have this metric');
    cy.contains('No published spec for this hardware: 1');
    cy.get('[data-testid="power-metric-availability"]').should('not.contain', 'Validation failed');
    // Provisioned energy additionally needs output throughput and, for
    // disaggregated rows, the whole-deployment GPU count (the list stays open).
    cy.contains('button', 'Utility Provisioned Joules per Output Token, all GPUs (all-in)')
      .should('contain', '2/5')
      .click();
    cy.contains('2 of 5 points have this metric');
    cy.contains('No output throughput reported: 1');
    cy.contains('Whole-deployment GPU count unavailable for this disaggregated row: 1');
    cy.contains('No published spec for this hardware: 1');
    cy.contains('gb200: No output throughput reported (1)');
    cy.contains(
      'b200_disagg: Whole-deployment GPU count unavailable for this disaggregated row (1)',
    );
  });
  it('uses Chinese copy for the derived boundary states', () => {
    cy.mount(
      <PathnameContext.Provider value="/zh/inference/qwen-3-5">
        <BoundaryPanel metric="y_utilityModeledJPerOutputToken" />
      </PathnameContext.Provider>,
    );
    cy.contains('5 个数据点中有 1 个提供此指标');
    cy.contains('有数值: 1');
    cy.contains('硬件不在机箱功耗模型范围内: 1');
    cy.contains('机箱功耗模型仅覆盖 8K / 1K: 1');
    cy.contains('没有已验证的 GPU 遥测: 1');
    cy.contains('验证失败: 1');
    cy.contains('summary', '所有实测指标的可用性').click();
    cy.contains('button', '每芯片 GPU 额定功耗（TDP）').should('contain', '4/5');
    cy.contains('button', '每输出 token 全电源配置焦耳能耗，按全部 GPU 归一（all-in）')
      .should('contain', '2/5')
      .click();
    cy.contains('无法确定该分离式部署的 GPU 总数: 1');
    cy.contains('该硬件没有公开的规格参数: 1');
  });
  it('keeps the measured validation copy on the measured dictionary', () => {
    // `invalid` exists in both dictionaries; the measured metric must read
    // its own so a future basis-copy edit cannot rewrite the measured string.
    // Only the registered B200 and the disaggregated AgentX row carry
    // validated telemetry; the GB200 and the unregistered hardware report
    // nothing and the AMD row failed validation.
    cy.mount(<BoundaryPanel metric="y_measuredAvgPower" />);
    cy.contains('2 of 5 points have this metric');
    cy.contains('Validation failed: 1');
    cy.contains('Metric not reported: 2');
    cy.get('[data-testid="power-metric-availability"]').should('not.contain', 'Value available');
  });
  it('counts derived boundaries on visible unofficial overlay rows only', () => {
    mountWithProviders(
      <PowerMetricAvailability metric="y_gpuProvisionedJPerOutputToken" onSelect={cy.stub()} />,
      {
        inference: {
          selectionPoints: [outsideModel],
          activeHwTypes: new Set(['gb200']),
          selectedModel: Model.Qwen3_5,
          selectedSequence: Sequence.EightK_OneK,
          selectedPrecisions: [Precision.FP8],
        },
        unofficial: {
          isUnofficialRun: true,
          activeOverlayHwTypes: new Set(['b200']),
          getOverlayData: () => ({ data: [boundaries, failedValidation], hardwareConfig: {} }),
        },
      },
    );
    // Official GB200 (no throughput) + visible overlay B200; hidden overlay mi355x excluded.
    cy.contains('1 of 2 points have this metric');
    cy.contains('No output throughput reported: 1');
    cy.get('[data-testid="power-metric-availability"]').should('not.contain', 'Validation failed');
  });
  it('counts filtered unofficial rows before the metric filter and respects hidden overlay hardware', () => {
    mountWithProviders(
      <PowerMetricAvailability metric="y_measuredAvgPower" onSelect={cy.stub()} />,
      {
        inference: {
          selectionPoints: [missing],
          activeHwTypes: new Set(['gb200']),
          selectedModel: Model.Qwen3_5,
          selectedSequence: Sequence.EightK_OneK,
          selectedPrecisions: [Precision.FP8],
        },
        unofficial: {
          isUnofficialRun: true,
          activeOverlayHwTypes: new Set(['b200']),
          getOverlayData: () => ({ data: [measured, invalid], hardwareConfig: {} }),
        },
      },
    );
    cy.contains('1 of 2 points have this metric');
    cy.contains('Metric not reported: 1');
    cy.get('[data-testid="power-metric-availability"]').should(
      'not.contain',
      'Validation failed: 1',
    );
  });
});
