import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import { Precision } from '@/lib/data-mappings';
import { getInferenceHardwareConfig } from '@/lib/inference-labels';
import { createMockChartDefinition, createMockInferenceData } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const runId = 35879254139;
const runUrl = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`;
const hwKey = 'mi355x_mori-sglang';

describe('UMBP run recognition legend', () => {
  for (const { date, label } of [
    { date: '2026-10-09T23:59:59-04:00', label: 'UMBP MoRI SGLang' },
    { date: '2026-10-10T00:00:00-04:00', label: 'MoRI SGLang' },
  ]) {
    it(`renders the official and overlay legends as ${label} at ${date}`, () => {
      cy.viewport(1280, 900);
      cy.stub(Date, 'now').returns(Date.parse(date));
      const data = [8, 16, 32].map((x, index) =>
        createMockInferenceData({
          hwKey,
          framework: 'mori-sglang',
          run_url: runUrl,
          precision: Precision.FP4,
          x,
          y: 300 - index * 60,
        }),
      );
      const hardwareConfig = {
        [hwKey]: getInferenceHardwareConfig(hwKey, undefined, data),
      };
      mountWithProviders(
        <div style={{ width: 1200 }}>
          <ScatterGraph
            chartId="umbp-recognition"
            modelLabel="DeepSeek V4 Pro"
            data={data}
            overlayData={{
              data: data.map((point) => ({ ...point, y: point.y + 40 })),
              hardwareConfig,
              label: 'gamma6',
              runUrl,
            }}
            xLabel="Interactivity"
            yLabel="Throughput / Chip (tok/s)"
            chartDefinition={createMockChartDefinition({
              chartType: 'interactivity',
              y_tpPerGpu_roofline: 'upper_left',
            })}
            transitionDuration={0}
          />
        </div>,
        {
          inference: {
            hardwareConfig,
            activeHwTypes: new Set([hwKey]),
            hwTypesWithData: new Set([hwKey]),
            selectedPrecisions: [Precision.FP4],
            showLineLabels: true,
          },
          unofficial: {
            activeOverlayHwTypes: new Set([hwKey]),
            allOverlayHwTypes: new Set([hwKey]),
            runIndexByUrl: { [runUrl]: 0, [String(runId)]: 0 },
            unofficialRunInfos: [
              {
                id: runId,
                name: 'CI run',
                branch: 'gamma6',
                sha: 'test',
                createdAt: '2026-09-24T00:00:00Z',
                url: runUrl,
                conclusion: 'success',
                status: 'completed',
                isNonMainBranch: true,
              },
            ],
          },
        },
      );
      cy.get('[data-testid="chart-legend"]').should('contain.text', `(${label})`);
      cy.get('.roofline-path').should('have.length.greaterThan', 0);
      cy.get('.overlay-roofline-path').should('have.length.greaterThan', 0);
      cy.get('.line-label[data-line-key]:not([data-line-key^="overlay-"])').should(
        'contain.text',
        label,
      );
      if (label === 'UMBP MoRI SGLang') {
        cy.get('[data-testid="chart-legend"]').should(
          'contain.text',
          '✕ gamma6 (UMBP MoRI SGLang)',
        );
        cy.get('.line-label[data-line-key^="overlay-"]').should('contain.text', 'UMBP MoRI SGLang');
      } else {
        cy.get('[data-testid="chart-legend"]').should('contain.text', '✕ gamma6');
        cy.get('#umbp-recognition').should('not.contain.text', 'UMBP');
      }
      cy.screenshot(`umbp-legend-${label.startsWith('UMBP') ? 'active' : 'expired'}`);
    });
  }
});
