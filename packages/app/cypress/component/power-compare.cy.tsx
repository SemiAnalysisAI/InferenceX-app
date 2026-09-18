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

// Power comparison series (`i_pcompare`): useChartData / the overlay processor
// append one clone per boundary or role to every base point. ScatterGraph must
// draw the clones as their own series — hardware colour, per-variant dash, its
// own frontier — with legend rows that toggle and highlight them.

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
 * Three measured points with every boundary and both roles available. Power
 * falls as x rises so every point sits on the upper power envelope the chart
 * draws for watt axes (maximise x, keep the running maximum y).
 */
function measuredCurve(hwKey: string, run_url?: string): InferenceData[] {
  return [
    [8, 700, 840, 500],
    [16, 600, 820, 450],
    [32, 500, 800, 400],
  ].map(([x, watts, prefill, decode]) =>
    createMockInferenceData({
      hwKey,
      x,
      conc: x,
      y: watts,
      precision: Precision.FP4,
      run_url,
      disagg: true,
      measuredAvgPower: metric(watts),
      measuredPrefillAvgPower: metric(prefill),
      measuredDecodeAvgPower: metric(decode),
      gpuProvisionedWatts: metric(1000),
      utilityProvisionedWatts: metric(1710),
    }),
  );
}

function mountCompare(
  data: InferenceData[],
  options: {
    pathname?: string;
    overlay?: InferenceData[];
    hiddenNonOptimal?: boolean;
  } = {},
) {
  mountWithProviders(
    <PathnameContext.Provider value={options.pathname ?? '/inference'}>
      <div style={{ width: 1000, height: 640 }}>
        <ScatterGraph
          chartId="power-compare-test"
          modelLabel="DeepSeek V4 Pro"
          data={data}
          xLabel="Interactivity (tok/s/user)"
          yLabel="Measured Power per Chip (W)"
          chartDefinition={chartDefinition}
          overlayData={
            options.overlay
              ? {
                  data: options.overlay,
                  hardwareConfig: hwConfig,
                  label: 'powerx-compare',
                  runUrl: OVERLAY_RUN_URL,
                }
              : undefined
          }
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
        hideNonOptimal: options.hiddenNonOptimal ?? false,
      },
      unofficial: options.overlay
        ? {
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
          }
        : {},
    },
  );
}

const svg = '#power-compare-test svg';

describe('ScatterGraph power comparison series', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('draws each boundary as a dashed sibling series in the hardware colour with a toggling legend row', () => {
    const data = expandPowerCompareSeries(
      measuredCurve('b200'),
      'y_measuredAvgPower',
      'boundaries',
    );
    // Three base points plus TDP and all-in clones; no modeled watts on these rows.
    expect(data).to.have.length(9);
    mountCompare(data);

    cy.get(`${svg} .dot-group[data-power-variant=""]`).should('have.length', 3);
    cy.get(`${svg} .dot-group[data-power-variant="gpu-provisioned"]`)
      .should('have.length', 3)
      .each(($point) => {
        // Clones sit behind the base series they annotate.
        expect(Number(getComputedStyle($point[0]).opacity)).to.be.closeTo(0.6, 0.01);
      });
    cy.get(`${svg} .roofline-path[data-hw-key="b200"]`).should('have.length', 3);
    cy.get(`${svg} .roofline-path:not([data-power-variant])`)
      .should('have.length', 1)
      .and('not.have.attr', 'stroke-dasharray');
    cy.get(`${svg} .roofline-path[data-power-variant="gpu-provisioned"]`)
      .should('have.length', 1)
      .and('have.attr', 'stroke-dasharray', '8 4');
    cy.get(`${svg} .roofline-path[data-power-variant="utility-provisioned"]`)
      .should('have.attr', 'stroke-dasharray', '3 3')
      .then(($sibling) => {
        cy.get(`${svg} .roofline-path:not([data-power-variant])`).should(($base) => {
          // Same hardware, same colour: only the dash tells the series apart.
          expect($sibling.attr('stroke')).to.eq($base.attr('stroke'));
        });
      });

    // Legend: the base series first, then its siblings, each with a line swatch.
    cy.get('#power-compare-test [data-testid="chart-legend"]').within(() => {
      cy.contains('GPU measured').should('exist');
      cy.contains('GPU provisioned (TDP)').should('exist');
      cy.contains('Utility provisioned (all-in)').should('exist');
      cy.contains('Utility modeled (PUE)').should('not.exist');
      cy.contains('GPU provisioned (TDP)').click();
    });
    cy.get(`${svg} .roofline-path[data-power-variant="gpu-provisioned"]`).should(
      'have.css',
      'opacity',
      '0',
    );
    cy.get(`${svg} .dot-group[data-power-variant="gpu-provisioned"]`).each(($point) => {
      expect(getComputedStyle($point[0]).opacity).to.eq('0');
    });
    // The base series and the other sibling stay.
    cy.get(`${svg} .roofline-path[data-power-variant="utility-provisioned"]`).should(
      'have.css',
      'opacity',
      '1',
    );
    cy.get(`${svg} .dot-group[data-power-variant=""]`).each(($point) => {
      expect(getComputedStyle($point[0]).opacity).to.eq('1');
    });
  });

  it('draws role siblings for ?unofficialrun= overlays in the run colour with the role dash', () => {
    const official = expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles');
    const overlay = expandPowerCompareSeries(
      measuredCurve('h100', OVERLAY_RUN_URL),
      'y_measuredAvgPower',
      'roles',
    );
    mountCompare(official, { overlay });

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
    cy.get('#power-compare-test [data-testid="chart-legend"]').within(() => {
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

  it('translates the comparison legend rows on /zh', () => {
    mountCompare(expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles'), {
      pathname: '/zh/inference',
    });
    cy.get('#power-compare-test [data-testid="chart-legend"]')
      .should('contain.text', '全部 GPU')
      .and('contain.text', '预填充 GPU')
      .and('contain.text', '解码 GPU');
  });
});
