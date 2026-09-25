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
