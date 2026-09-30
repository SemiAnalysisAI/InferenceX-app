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

function mountCompare(
  data: InferenceData[],
  overlay: InferenceData[],
  { locale = 'en', width = 1000 }: { locale?: 'en' | 'zh'; width?: number } = {},
) {
  mountWithProviders(
    <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
      <div style={{ width, height: 640 }}>
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

  it('keeps the base series lit when its legend row is hovered', () => {
    const official = expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles');
    const overlay = expandPowerCompareSeries(
      measuredCurve('h100', OVERLAY_RUN_URL),
      'y_measuredAvgPower',
      'roles',
    );
    mountCompare(official, overlay);

    cy.get(`${svg} .roofline-path[data-power-variant="prefill"]`).should('exist');
    // Base points and rooflines carry no variant id (only role siblings are
    // cloned), so the base row has to map back onto them.
    cy.get(legend).contains('label', 'All GPUs').trigger('mouseover');
    // Wait for the siblings to settle first: opacity transitions over 150 ms,
    // so a base check taken at once would still read the pre-hover value.
    cy.get(`${svg} .roofline-path[data-power-variant="prefill"]`).should(
      'have.css',
      'opacity',
      '0.15',
    );
    cy.get(`${svg} .roofline-path:not([data-power-variant])`).should('have.css', 'opacity', '1');
    cy.get(legend).contains('label', 'All GPUs').trigger('mouseout');
    cy.get(`${svg} .roofline-path[data-power-variant="prefill"]`).should(
      'have.css',
      'opacity',
      '1',
    );
  });
});

describe('Modeled power source links', () => {
  for (const locale of ['en', 'zh'] as const) {
    for (const width of [1280, 390]) {
      const overlay = width === 390;
      it(`links to app-owned source and ${locale} assumptions from a ${overlay ? 'mobile overlay' : 'desktop official'} tooltip`, () => {
        cy.viewport(width, 720);
        const modeledCurve = (hwKey: string, runUrl?: string) =>
          measuredCurve(hwKey, runUrl).map((point) =>
            createMockInferenceData({
              ...point,
              disagg: false,
              modeledSystemPower: {
                status: 'supported',
                hardware: hwKey,
                modelRevision: 'model-content-digest-for-tooltip-fixture',
                modelPath: 'packages/app/src/lib/system-power-model.ts',
                gpuCount: 8,
                chassisCount: 1,
                modeledGpuCount: 8,
                measuredGpuWattsPerGpu: 600,
                chassisAcWatts: 6400,
                chassisAcWattsPerGpu: 800,
                facilityWatts: 8320,
                deploymentAcWatts: 6400,
                deploymentFacilityWatts: 8320,
                pue: 1.3,
                topologyBasis: 'single-node',
                chassisBasis: 'full',
                telemetryBasis: 'validated-v2',
              },
            }),
          );
        mountCompare(modeledCurve('b200'), modeledCurve('h100', OVERLAY_RUN_URL), {
          locale,
          width: Math.min(1000, width - 32),
        });
        cy.get(`${svg} ${overlay ? '.unofficial-overlay-pt' : '.dot-group'}`)
          .eq(1)
          .click({ force: true });
        cy.get('[data-chart-tooltip]:visible').within(() => {
          if (overlay) cy.contains('powerx-compare').should('exist');
          cy.get('[data-testid="tooltip-modeled-system-power"]').within(() => {
            const base = `https://github.com/SemiAnalysisAI/InferenceX-app/blob/${process.env.NEXT_PUBLIC_APP_SOURCE_REF ?? 'master'}`;
            cy.get(`a[href="${base}/packages/app/src/lib/system-power-model.ts"]`)
              .should('have.attr', 'title', 'model-content-digest-for-tooltip-fixture')
              .and('have.attr', 'target', '_blank')
              .and('have.attr', 'rel', 'noopener noreferrer')
              .scrollIntoView()
              .should('be.visible');
            cy.contains('a', locale === 'zh' ? '功耗模型与假设' : 'Power model assumptions')
              .should(
                'have.attr',
                'href',
                `${base}/docs/powerx-system-power${locale === 'zh' ? '.zh' : ''}.md`,
              )
              .and('have.attr', 'target', '_blank')
              .and('have.attr', 'rel', 'noopener noreferrer')
              .then(($link) => $link[0].scrollIntoView({ block: 'center' }))
              .should('be.visible')
              .then(($link) => {
                const bounds = $link[0].getBoundingClientRect();
                expect(bounds.left).to.be.at.least(0);
                expect(bounds.right).to.be.at.most(width);
                const shell = $link.closest('[data-chart-tooltip]')[0].firstElementChild!;
                const frame = shell.getBoundingClientRect();
                expect(bounds.top).to.be.at.least(frame.top);
                expect(bounds.bottom).to.be.at.most(frame.bottom);
              });
          });
        });
        cy.screenshot(`power-model-links-${locale}-${width}`, { capture: 'viewport' });
      });
    }
  }
});
