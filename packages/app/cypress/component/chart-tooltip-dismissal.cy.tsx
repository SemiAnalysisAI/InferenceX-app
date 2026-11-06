import { useState } from 'react';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Precision } from '@/lib/catalog/data-mappings';
import { mountWithProviders } from '../support/test-utils';
import { clickScatterPoint } from '../support/scatter-points';
import {
  createMockInferenceData,
  createMockChartDefinition,
  createMockHardwareConfig,
} from '../support/mock-data';

const chartDefinition = createMockChartDefinition();
const hardwareConfig = createMockHardwareConfig();

describe('Pinned chart dismissal', () => {
  for (const overlay of [false, true]) {
    it(`dismisses pinned ${overlay ? 'unofficial' : 'official'} details outside the chart and on Escape`, () => {
      const data = [
        createMockInferenceData({
          hwKey: 'b200_sglang',
          precision: Precision.FP4,
          x: 20,
          y: 80,
          conc: 16,
        }),
      ];
      const runUrl = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123';
      const overlayData = overlay
        ? {
            data: [
              createMockInferenceData({
                hwKey: 'h100_vllm',
                precision: Precision.FP4,
                x: 50,
                y: 40,
                conc: 32,
                run_url: runUrl,
              }),
            ],
            hardwareConfig,
            label: 'Preview',
            runUrl,
          }
        : undefined;
      function DismissalHarness() {
        const [clicks, setClicks] = useState(0);
        return (
          <div style={{ width: 1000 }}>
            <button
              data-testid="outside-chart"
              onClick={(event) => {
                event.stopPropagation();
                setClicks((value) => value + 1);
              }}
            >
              Outside clicks: {clicks}
            </button>
            <ScatterGraph
              chartId="outside-dismissal"
              modelLabel="DeepSeek R1"
              data={data}
              xLabel="Interactivity"
              yLabel="Throughput"
              chartDefinition={chartDefinition}
              transitionDuration={0}
              overlayData={overlayData}
            />
          </div>
        );
      }
      mountWithProviders(<DismissalHarness />, {
        inference: {
          hardwareConfig,
          activeHwTypes: new Set(['b200_sglang']),
          hwTypesWithData: new Set(['b200_sglang']),
          selectedPrecisions: [Precision.FP4],
        },
        unofficial: {
          isUnofficialRun: overlay,
          activeOverlayHwTypes: new Set(['h100_vllm']),
          allOverlayHwTypes: new Set(['h100_vllm']),
        },
      });
      const pin = () => {
        if (overlay) {
          cy.get('#outside-dismissal .unofficial-overlay-pt').first().click();
        } else {
          cy.scatterPoints('#outside-dismissal')
            .should('have.length', 1)
            .then(([point]) => clickScatterPoint(point));
        }
        cy.get('[data-chart-tooltip="outside-dismissal"]')
          .should('be.visible')
          .find('[data-pinned-config]')
          .should('contain.text', `Concurrency: ${overlay ? 32 : 16}`);
      };
      pin();
      cy.get('[data-pinned-config]').click();
      cy.get('[data-chart-tooltip="outside-dismissal"]').should('be.visible');
      cy.get('[data-testid="outside-chart"]').click().should('have.text', 'Outside clicks: 1');
      cy.get('[data-pinned-config]').should('not.be.visible');
      pin();
      cy.get('body').trigger('keydown', { key: 'Escape' });
      cy.get('[data-pinned-config]').should('not.be.visible');
    });
  }
});
