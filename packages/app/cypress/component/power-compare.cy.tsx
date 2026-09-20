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
// own frontier — with legend rows that toggle and highlight them, and one line
// label per series that names the boundary or role it plots.

const OVERLAY_RUN_ID = 31415926535;
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;
const hwConfig = createMockHardwareConfig();
const chartDefinition = createMockChartDefinition({
  chartType: 'interactivity',
  y_measuredAvgPower: 'measuredAvgPower.y',
  y_measuredAvgPower_roofline: 'lower_left',
  y_measuredJPerOutputToken: 'measuredJPerOutputToken.y',
  // Interactivity chart, lower-is-better metric (metric-registry `rooflineDirection`).
  y_measuredJPerOutputToken_roofline: 'lower_right',
});

type CompareMetric = 'y_measuredAvgPower' | 'y_measuredJPerOutputToken';

const Y_LABELS: Record<CompareMetric, string> = {
  y_measuredAvgPower: 'Measured Power per Chip (W)',
  y_measuredJPerOutputToken: 'Energy per Output Token (J)',
};

const metric = (y: number) => ({ y, roof: false });

interface CurveOptions {
  run_url?: string;
  precision?: Precision;
  /** Measured W per chip at x = 8, 16, 32. Falls as x rises so every point sits on the envelope. */
  measured?: readonly [number, number, number];
  /** Per-chip provisioned boundaries; the defaults are the B200 registry figures. */
  tdpWatts?: number;
  allInWatts?: number;
}

/**
 * H100 registry boundaries (700 W TDP, 1.37 kW all-in) with measured watts far
 * enough below the TDP line that a label anchored on the wrong series is
 * unambiguous in pixels.
 */
const H100_CURVE: CurveOptions = { measured: [400, 360, 320], tdpWatts: 700, allInWatts: 1370 };

/**
 * Three measured points with every boundary and both roles available. Power
 * falls as x rises so every point sits on the upper power envelope the chart
 * draws for watt axes (maximise x, keep the running maximum y).
 */
function measuredCurve(hwKey: string, options: CurveOptions = {}): InferenceData[] {
  const {
    run_url,
    precision = Precision.FP4,
    measured = [700, 600, 500],
    tdpWatts = 1000,
    allInWatts = 1710,
  } = options;
  return [
    [8, 840, 500],
    [16, 820, 450],
    [32, 800, 400],
  ].map(([x, prefill, decode], index) =>
    createMockInferenceData({
      hwKey,
      x,
      conc: x,
      y: measured[index],
      precision,
      run_url,
      disagg: true,
      measuredAvgPower: metric(measured[index]),
      measuredPrefillAvgPower: metric(prefill),
      measuredDecodeAvgPower: metric(decode),
      gpuProvisionedWatts: metric(tdpWatts),
      utilityProvisionedWatts: metric(allInWatts),
    }),
  );
}

/**
 * J per output token for the measured and provisioned boundaries. Energy rises
 * with interactivity, so the lower-right Pareto frontier keeps all three points
 * of every series.
 */
function energyCurve(hwKey: string): InferenceData[] {
  return [
    [8, 0.5, 0.9, 1.7],
    [16, 0.6, 1, 1.9],
    [32, 0.7, 1.1, 2.1],
  ].map(([x, measured, tdp, allIn]) =>
    createMockInferenceData({
      hwKey,
      x,
      conc: x,
      y: measured,
      precision: Precision.FP4,
      disagg: true,
      measuredJPerOutputToken: metric(measured),
      gpuProvisionedJPerOutputToken: metric(tdp),
      utilityProvisionedJPerOutputToken: metric(allIn),
    }),
  );
}

function mountCompare(
  data: InferenceData[],
  options: {
    pathname?: string;
    overlay?: InferenceData[];
    hiddenNonOptimal?: boolean;
    metric?: CompareMetric;
    lineLabels?: boolean;
    precisions?: Precision[];
  } = {},
) {
  const metricKey = options.metric ?? 'y_measuredAvgPower';
  mountWithProviders(
    <PathnameContext.Provider value={options.pathname ?? '/inference'}>
      <div style={{ width: 1000, height: 640 }}>
        <ScatterGraph
          chartId="power-compare-test"
          modelLabel="DeepSeek V4 Pro"
          data={data}
          xLabel="Interactivity (tok/s/user)"
          yLabel={Y_LABELS[metricKey]}
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
        selectedYAxisMetric: metricKey,
        hardwareConfig: hwConfig,
        activeHwTypes: new Set(['b200', 'h100']),
        hwTypesWithData: new Set(['b200', 'h100']),
        selectedPrecisions: options.precisions ?? [Precision.FP4],
        hideNonOptimal: options.hiddenNonOptimal ?? false,
        showLineLabels: options.lineLabels ?? false,
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
const legend = '#power-compare-test [data-testid="chart-legend"]';
const lineLabels = `${svg} .line-label`;
/** Selector for the pill of one comparison series, relative to the chart svg. */
const labelSelector = (variant: string) => `.line-label[data-power-variant="${variant}"]`;
const lineLabel = (variant: string) => `${svg} ${labelSelector(variant)}`;

/** A pill's rendered text, whitespace-normalised across its tspans. */
const pillText = (node: Element): string =>
  (node.querySelector('.ll-text')?.textContent ?? '').replaceAll(/\s+/gu, ' ').trim();

/** Rendered pill text keyed by the comparison variant the pill labels. */
const pillTextByVariant = ($labels: JQuery<HTMLElement>): Record<string, string> =>
  Object.fromEntries([...$labels].map((node) => [node.dataset.powerVariant, pillText(node)]));

/** Vertical translate of a `.line-label` or `.dot-group`, in zoom-group pixels. */
const translateY = (node: Element): number => {
  const match = /translate\([^,]+,(?<y>[^)]+)\)/u.exec(node.getAttribute('transform') ?? '');
  return match?.groups?.y === undefined ? Number.NaN : Number.parseFloat(match.groups.y);
};

/** Pixel distance from `y` to the nearest marker of one comparison series. */
const distanceToSeries = (root: Element, variant: string, y: number): number =>
  Math.min(
    ...[...root.querySelectorAll(`.dot-group[data-power-variant="${variant}"]`)].map((marker) =>
      Math.abs(translateY(marker) - y),
    ),
  );

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
    cy.get(legend).within(() => {
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
      measuredCurve('h100', { run_url: OVERLAY_RUN_URL }),
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

  it('keys legend rows by the comparison base when only an overlay carries the series', () => {
    // No official measured points at all: the base row must still be the
    // selected metric, and each sibling must keep its own toggle.
    const overlay = expandPowerCompareSeries(
      measuredCurve('h100', { run_url: OVERLAY_RUN_URL }),
      'y_measuredAvgPower',
      'roles',
    );
    mountCompare([], { overlay });

    cy.get(`${svg} .unofficial-overlay-pt`).should('have.length', 9);
    cy.get(legend).within(() => {
      cy.contains('All GPUs').should('exist');
      cy.contains('Decode GPUs').click();
    });
    cy.get(`${svg} .overlay-roofline-path[data-power-variant="decode"]`).should(
      'have.css',
      'opacity',
      '0',
    );
    cy.get(`${svg} .overlay-roofline-path:not([data-power-variant])`).should(
      'have.css',
      'opacity',
      '1',
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
    cy.get(legend)
      .should('contain.text', '全部 GPU')
      .and('contain.text', '预填充 GPU')
      .and('contain.text', '解码 GPU');
  });

  // Line labels: one pill per drawn series. The base series keeps its ordinary
  // hardware label; a sibling appends the boundary or role it plots, and on a
  // watts axis a flat boundary also carries its per-chip watts.

  it('labels every boundary series once, with the boundary watts, each on its own line', () => {
    const data = expandPowerCompareSeries(
      measuredCurve('h100', H100_CURVE),
      'y_measuredAvgPower',
      'boundaries',
    );
    mountCompare(data, { lineLabels: true });

    cy.get(lineLabels).should('have.length', 3);
    cy.get(lineLabel(''))
      .should('have.length', 1)
      .and('have.attr', 'data-series-id', 'h100')
      .and('have.attr', 'data-visible', '1');
    cy.get(lineLabel('gpu-provisioned'))
      .should('have.length', 1)
      .and('have.attr', 'data-series-id', 'h100::gpu-provisioned')
      .and('have.attr', 'data-visible', '1');
    cy.get(lineLabel('utility-provisioned'))
      .should('have.length', 1)
      .and('have.attr', 'data-series-id', 'h100::utility-provisioned')
      .and('have.attr', 'data-visible', '1');
    cy.get(lineLabels).then(($labels) => {
      expect(pillTextByVariant($labels)).to.deep.equal({
        '': 'H100',
        'gpu-provisioned': 'H100 · TDP 700 W',
        'utility-provisioned': 'H100 · All-in 1.37 kW',
      });
      // Same hardware, same pill colour: the text tells the series apart.
      const fills = new Set(
        [...$labels].map((node) => node.querySelector('.ll-bg')?.getAttribute('fill')),
      );
      expect([...fills]).to.have.length(1);
    });

    // Each pill hugs the series it names: the base label sits on the measured
    // curve, not on the flat TDP line above it, and the TDP label vice versa.
    cy.get(svg).then(($svg) => {
      const root = $svg[0];
      const pillY = (variant: string) => translateY(root.querySelector(labelSelector(variant))!);
      const baseY = pillY('');
      expect(distanceToSeries(root, '', baseY)).to.be.lessThan(
        distanceToSeries(root, 'gpu-provisioned', baseY),
      );
      const tdpY = pillY('gpu-provisioned');
      expect(distanceToSeries(root, 'gpu-provisioned', tdpY)).to.be.lessThan(
        distanceToSeries(root, '', tdpY),
      );
    });
  });

  it('labels role siblings with the worker pool and never with watts', () => {
    mountCompare(expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles'), {
      lineLabels: true,
    });

    cy.get(lineLabels)
      .should('have.length', 3)
      .then(($labels) => {
        expect(pillTextByVariant($labels)).to.deep.equal({
          '': 'B200',
          prefill: 'B200 · Prefill GPUs',
          decode: 'B200 · Decode GPUs',
        });
      });
    cy.get(lineLabel('prefill')).should('have.attr', 'data-series-id', 'b200::prefill');
    cy.get(lineLabel('decode')).should('have.attr', 'data-series-id', 'b200::decode');

    // Hiding a sibling from the legend hides its label with it.
    cy.get(legend).within(() => {
      cy.contains('Decode GPUs').click();
    });
    cy.get(`${svg} .roofline-path[data-power-variant="decode"]`).should('have.css', 'opacity', '0');
    cy.get(svg).should(($svg) => {
      const label = $svg[0].querySelector<SVGGElement>(labelSelector('decode'));
      expect(label === null || getComputedStyle(label).opacity === '0').to.eq(true);
    });
    cy.get(lineLabel('prefill')).should('have.css', 'opacity', '1');
  });

  it('keeps the boundary suffix but drops the watts on a J per token axis', () => {
    const data = expandPowerCompareSeries(
      energyCurve('h100'),
      'y_measuredJPerOutputToken',
      'boundaries',
    );
    expect(data).to.have.length(9);
    mountCompare(data, { lineLabels: true, metric: 'y_measuredJPerOutputToken' });

    cy.get(`${svg} .roofline-path`).should('have.length', 3);
    cy.get(lineLabels)
      .should('have.length', 3)
      .then(($labels) => {
        expect(pillTextByVariant($labels)).to.deep.equal({
          '': 'H100',
          'gpu-provisioned': 'H100 · TDP',
          'utility-provisioned': 'H100 · All-in',
        });
      });
  });

  it('translates boundary line labels on /zh', () => {
    const data = expandPowerCompareSeries(
      measuredCurve('h100', H100_CURVE),
      'y_measuredAvgPower',
      'boundaries',
    );
    mountCompare(data, { lineLabels: true, pathname: '/zh/inference' });

    cy.get(lineLabels)
      .should('have.length', 3)
      .then(($labels) => {
        expect(pillTextByVariant($labels)).to.deep.equal({
          '': 'H100',
          'gpu-provisioned': 'H100 · TDP 700 W',
          'utility-provisioned': 'H100 · 全站 1.37 kW',
        });
      });
  });

  it('translates role line labels on /zh', () => {
    mountCompare(expandPowerCompareSeries(measuredCurve('b200'), 'y_measuredAvgPower', 'roles'), {
      lineLabels: true,
      pathname: '/zh/inference',
    });

    cy.get(lineLabels)
      .should('have.length', 3)
      .then(($labels) => {
        expect(pillTextByVariant($labels)).to.deep.equal({
          '': 'B200',
          prefill: 'B200 · 预填充 GPU',
          decode: 'B200 · 解码 GPU',
        });
      });
  });

  it('labels ?unofficialrun= comparison siblings with the marked hardware and the variant', () => {
    const overlay = expandPowerCompareSeries(
      measuredCurve('h100', { run_url: OVERLAY_RUN_URL }),
      'y_measuredAvgPower',
      'roles',
    );
    mountCompare([], { overlay, lineLabels: true });

    cy.get(lineLabels)
      .should('have.length', 3)
      .each(($label) => {
        expect($label.attr('data-line-key')).to.match(/^overlay-/u);
        // Overlay pills take the run colour, like the overlay rooflines.
        expect($label.find('.ll-bg').attr('fill')).to.eq(overlayRunColor(0));
      })
      .then(($labels) => {
        // The branch stays in the legend; pills name the hardware behind the marker.
        expect(pillTextByVariant($labels)).to.deep.equal({
          '': '✕ H100',
          prefill: '✕ H100 · Prefill GPUs',
          decode: '✕ H100 · Decode GPUs',
        });
      });
    cy.get(lineLabel('')).should('have.attr', 'data-series-id', 'h100');
    cy.get(lineLabel('decode')).should('have.attr', 'data-series-id', 'h100::decode');
  });

  it('labels each precision of every boundary series when several precisions are shown', () => {
    const fp4 = measuredCurve('h100', H100_CURVE);
    const fp8 = measuredCurve('h100', {
      ...H100_CURVE,
      measured: [200, 180, 160],
      precision: Precision.FP8,
    });
    const data = expandPowerCompareSeries([...fp4, ...fp8], 'y_measuredAvgPower', 'boundaries');
    mountCompare(data, { lineLabels: true, precisions: [Precision.FP4, Precision.FP8] });

    cy.get(lineLabels)
      .should('have.length', 6)
      .then(($labels) => {
        expect([...$labels].map(pillText)).to.have.members([
          'H100 FP4',
          'H100 FP4 · TDP 700 W',
          'H100 FP4 · All-in 1.37 kW',
          'H100 FP8',
          'H100 FP8 · TDP 700 W',
          'H100 FP8 · All-in 1.37 kW',
        ]);
      });
    cy.get(lineLabel('')).should('have.length', 2);
    cy.get(lineLabel('gpu-provisioned')).should('have.length', 2);
    cy.get(lineLabel('utility-provisioned')).should('have.length', 2);
  });

  it('leaves line labels untouched without a comparison', () => {
    mountCompare([...measuredCurve('b200'), ...measuredCurve('h100', H100_CURVE)], {
      lineLabels: true,
    });

    cy.get(lineLabels)
      .should('have.length', 2)
      .then(($labels) => {
        expect([...$labels].map(pillText)).to.have.members(['B200', 'H100']);
      });
  });
});
