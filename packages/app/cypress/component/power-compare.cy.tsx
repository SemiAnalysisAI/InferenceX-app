import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import type { InferenceData } from '@/components/inference/types';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';
import { Precision } from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';

import {
  createMockChartDefinition,
  createMockHardwareConfig,
  createMockInferenceData,
} from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

// Power comparison series (`i_pcompare`) on `?unofficialrun=` overlays: role
// clones draw in the overlay run colour with the role dash, and their legend
// rows toggle them.

const OVERLAY_RUN_ID = 31415926535;
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const hwConfig = createMockHardwareConfig();
const chartDefinition = createMockChartDefinition({
  chartType: 'interactivity',
  y_measuredAvgPower: 'measuredAvgPower.y',
  y_measuredAvgPower_roofline: 'lower_left',
});

const metric = (y: number) => ({ y, roof: false });

/**
 * Three measured points with both roles available. Power falls as x rises so
 * every point sits on the upper power envelope the chart draws for watt axes.
 */
function measuredCurve(hwKey: string, run_url?: string): InferenceData[] {
  return [
    [8, 700, 840, 500],
    [16, 600, 820, 450],
    [32, 500, 800, 400],
  ].map(([x, measured, prefill, decode]) =>
    createMockInferenceData({
      hwKey,
      x,
      conc: x,
      y: measured,
      precision: Precision.FP4,
      run_url,
      disagg: true,
      measuredAvgPower: metric(measured),
      measuredPrefillAvgPower: metric(prefill),
      measuredDecodeAvgPower: metric(decode),
    }),
  );
}

function mountCompare(data: InferenceData[], overlay: InferenceData[]) {
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: 1000, height: 640 }}>
        <ScatterGraph
          chartId="power-compare-test"
          modelLabel="DeepSeek V4 Pro"
          data={data}
          xLabel="Interactivity (tok/s/user)"
          yLabel="Measured Power per Chip (W)"
          chartDefinition={chartDefinition}
          overlayData={{
            data: overlay,
            hardwareConfig: hwConfig,
            label: 'powerx-compare',
            runUrl: OVERLAY_RUN_URL,
          }}
        />
      </div>
    </PathnameContext.Provider>,
    {
      inference: {
        selectedYAxisMetric: 'y_measuredAvgPower',
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200', 'h100']),
        hwTypesWithData: new Set(['b200', 'h100']),
        selectedPrecisions: [Precision.FP4],
        hideNonOptimal: false,
        showLineLabels: false,
      },
      unofficial: {
        isUnofficialRun: true,
        activeOverlayHwTypes: new Set(['h100']),
        allOverlayHwTypes: new Set(['h100']),
        runIndexByUrl: { [OVERLAY_RUN_URL]: 0, [String(OVERLAY_RUN_ID)]: 0 },
        unofficialRunInfos: [
          {
            id: OVERLAY_RUN_ID,
            name: 'powerx-compare',
            branch: 'powerx-compare',
            sha: 'abc000',
            createdAt: '2026-09-01T00:00:00Z',
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
      },
    },
  );
}

const svg = '#power-compare-test svg';
const legend = '#power-compare-test [data-testid="chart-legend"]';

describe('ScatterGraph power comparison series', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('draws role siblings for ?unofficialrun= overlays in the run colour with the role dash', () => {
    const official = expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles');
    const overlay = expandPowerCompareSeries(
      measuredCurve('h100', OVERLAY_RUN_URL),
      'y_measuredAvgPower',
      'roles',
    );
    mountCompare(official, overlay);

    cy.get(`${svg} .roofline-path[data-power-variant="prefill"]`).should(
      'have.attr',
      'stroke-dasharray',
      '7 3',
    );
    cy.get(`${svg} .unofficial-overlay-pt`).should('have.length', 9);
    cy.get(`${svg} .overlay-roofline-path[data-power-variant="decode"]`)
      .should('have.length', 1)
      .and('have.attr', 'stroke', overlayRunColor(0))
      .and('have.attr', 'stroke-dasharray', '2 3');
    cy.get(`${svg} .overlay-roofline-path:not([data-power-variant])`).should('have.length', 1);
    cy.get(legend).within(() => {
      cy.contains('All GPUs').should('exist');
      cy.contains('Prefill GPUs').should('exist');
      cy.contains('Decode GPUs').click();
    });
    cy.get(`${svg} .overlay-roofline-path[data-power-variant="decode"]`).should(
      'have.css',
      'opacity',
      '0',
    );
    cy.get(`${svg} .unofficial-overlay-pt`).then(($points) => {
      const hidden = [...$points].filter((point) => getComputedStyle(point).opacity === '0');
      expect(hidden).to.have.length(3);
    });
  });
});
